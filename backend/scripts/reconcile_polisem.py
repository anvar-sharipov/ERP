"""Сверка баланса клиентов/поставщиков и остатков товара MyERP vs Polisem."""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from decimal import Decimal
import psycopg2
import psycopg2.extras
from django_tenants.utils import schema_context

SRC_DSN = dict(host='db', port=5432, user='postgres',
               password='novedu112garagoz', dbname='polisem_check')


def main():
    conn = psycopg2.connect(**SRC_DSN)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    with schema_context('polisem'):
        from accounting.models import Counterparty, Account, TransactionLine, Product, WarehouseStock, Document

        # ── Document.total не забыт (баг 2026-07-27: bulk_create() в PHASE 3
        # не вызывает recalculate(), total/subtotal/total_profit остаются 0
        # у ВСЕХ перенесённых документов — ОСВ/сальдо это не ловят, т.к.
        # считаются по TransactionLine, а не по Document.total; ловит только
        # дашборд, который читает Document.total напрямую) ──────────────────
        print("=== Document.total (дашборд читает это поле напрямую) ===")
        pol_docs = Document.objects.filter(number__startswith='POL-')
        with_items = pol_docs.filter(items__isnull=False).distinct()
        zero_total_with_items = with_items.filter(total=0).count()
        print(f"POL-документов с DocumentItem: {with_items.count()}, из них total=0: {zero_total_with_items}")
        if zero_total_with_items:
            print("  ⚠️ ОШИБКА: recalculate() не был вызван после переноса — "
                  "дашборд покажет 0 выручки. См. migrate_polisem.py (вызов "
                  "doc.recalculate() в конце PHASE 3.2).")
        print()

        # ── баланс клиентов/поставщиков ────────────────────────────
        # ⚠️ store_partner.balance_usd в Polisem — НЕНАДЁЖНОЕ поле (не совпадает
        # с реальными store_entry даже внутри самого Polisem, проверено 2026-07-21
        # на нескольких контрагентах). Источник истины — прямой пересчёт по
        # store_entry (та же таблица, по которой уже точно сошлись обороты по
        # счетам 60/75 на уровне ОСВ).
        cur.execute("""
            SELECT p.id, p.name, p.type,
                   SUM(CASE WHEN e.debit<>0 THEN e.debit ELSE -e.credit END) AS net_balance
            FROM store_entry e
            JOIN store_account a ON a.id = e.account_id
            JOIN store_partner p ON p.id = e.partner_id
            WHERE a.number IN ('60','75')
            GROUP BY p.id, p.name, p.type
        """)
        src_partners = cur.fetchall()

        cp_by_name = {c.name.strip().lower(): c for c in Counterparty.objects.all()}

        acc60 = Account.objects.get(code='60')
        acc75 = Account.objects.get(code='75')
        lines = (TransactionLine.objects
                 .filter(journal_entry__number__startswith='POL-', account__in=[acc60, acc75])
                 .values_list('side', 'amount', 'subcontos'))
        myerp_balance = {}
        for side, amount, subcontos in lines:
            cp_id = subcontos.get('Klienty') or subcontos.get('uchrediteli')
            if not cp_id:
                continue
            delta = amount if side == 'debit' else -amount
            myerp_balance[cp_id] = myerp_balance.get(cp_id, Decimal('0')) + delta

        matched, ok, mismatch, no_match = 0, 0, 0, 0
        worst = []
        for p in src_partners:
            name_key = (p['name'] or '').strip().lower()
            cp = cp_by_name.get(name_key)
            if not cp:
                no_match += 1
                continue
            matched += 1
            src_bal = Decimal(p['net_balance'] or 0)
            my_bal = myerp_balance.get(cp.id, Decimal('0'))
            diff = (my_bal - src_bal).quantize(Decimal('0.01'))
            if abs(diff) <= Decimal('0.05'):
                ok += 1
            else:
                mismatch += 1
                worst.append((abs(diff), p['name'], src_bal, my_bal, diff))

        worst.sort(reverse=True)
        print(f"=== САЛЬДО КЛИЕНТОВ/ПОСТАВЩИКОВ (счета 60+75) ===")
        print(f"Всего партнёров в источнике: {len(src_partners)}, сматчено: {matched}, не найдено в MyERP: {no_match}")
        print(f"Сошлось (|diff|<=0.05): {ok}   Разошлось: {mismatch}")
        if worst:
            print("Топ-15 расхождений (|diff| убыв.):")
            for d, name, src_bal, my_bal, diff in worst[:15]:
                print(f"  {name[:40]:40s} polisem={src_bal:>14} myerp={my_bal:>14} diff={diff:>12}")

        # ── остатки товара ──────────────────────────────────────────
        print()
        print("=== ОСТАТКИ ТОВАРА (склад Sklad1) ===")
        cur.execute("SELECT product_id, quantity FROM store_warehouseproduct WHERE warehouse_id=1")
        src_stock = {r['product_id']: Decimal(r['quantity'] or 0) for r in cur.fetchall()}
        cur.execute("SELECT id, name FROM store_product")
        src_products = {r['id']: r['name'] for r in cur.fetchall()}

        prod_by_name = {p.name.strip().lower(): p for p in Product.objects.all()}
        myerp_stock = {ws.product_id: ws.quantity for ws in WarehouseStock.objects.filter(warehouse_id=6)}

        s_matched, s_ok, s_mismatch, s_no_match = 0, 0, 0, 0
        s_worst = []
        for src_pid, qty in src_stock.items():
            name = (src_products.get(src_pid) or '').strip().lower()
            p = prod_by_name.get(name)
            if not p:
                s_no_match += 1
                continue
            s_matched += 1
            my_qty = myerp_stock.get(p.id, Decimal('0'))
            diff = (my_qty - qty).quantize(Decimal('0.001'))
            if abs(diff) <= Decimal('0.001'):
                s_ok += 1
            else:
                s_mismatch += 1
                s_worst.append((abs(diff), src_products.get(src_pid), qty, my_qty, diff))

        s_worst.sort(reverse=True)
        print(f"Товаров с остатком в источнике: {len(src_stock)}, сматчено: {s_matched}, не найдено в MyERP: {s_no_match}")
        print(f"Сошлось: {s_ok}   Разошлось: {s_mismatch}")
        if s_worst:
            print("Топ-15 расхождений:")
            for d, name, src_q, my_q, diff in s_worst[:15]:
                print(f"  {(name or '')[:40]:40s} polisem={src_q:>12} myerp={my_q:>12} diff={diff:>10}")

    conn.close()


if __name__ == '__main__':
    main()
