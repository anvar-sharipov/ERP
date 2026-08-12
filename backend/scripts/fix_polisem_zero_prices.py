"""
Точечная коррекция бага 2026-08-09: migrate_polisem.py трактовал
selected_price/price_after_discount==0 как валидную цену (фолбэк на
retail_price срабатывал только при NULL, а в источнике эти поля NOT NULL —
0 там означает "не задано"). Правит уже перенесённые DocumentItem.price
(и cost_price, где 0) для строк, где в источнике есть реальная ненулевая
retail_price/purchase_price, но перенеслась цена 0. Пересчитывает
Document.total на затронутых документах.

Запуск: python scripts/fix_polisem_zero_prices.py (внутри backend-контейнера).
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from decimal import Decimal, ROUND_HALF_UP

import psycopg2
import psycopg2.extras
from django_tenants.utils import schema_context

SRC_DSN = dict(host='db', port=5432, user='postgres',
               password='novedu112garagoz', dbname='polisem_check')
TENANT_SCHEMA = 'polisem'
SRC_WAREHOUSE_ID = 1

TYPE_PREFIX_BY_DIR = {
    'prihod': 'POL-IN-',
    'rashod': 'POL-OUT-',
}


def q2(v):
    if v is None:
        return Decimal('0')
    return Decimal(v).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def main():
    conn = psycopg2.connect(**SRC_DSN)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("""
        SELECT ii.invoice_id, ii.product_id, ii.price_after_discount, ii.retail_price,
               ii.purchase_price, i.wozwrat_or_prihod, i.partner_id, p.type AS partner_type
        FROM store_invoiceitem ii
        JOIN store_invoice i ON i.id = ii.invoice_id
        LEFT JOIN store_partner p ON p.id = i.partner_id
        WHERE i.warehouse_id = %s AND i.canceled_at IS NULL
          AND ii.selected_price = 0
          AND (COALESCE(ii.price_after_discount, 0) > 0
               OR COALESCE(ii.retail_price, 0) > 0
               OR COALESCE(ii.purchase_price, 0) > 0)
    """, (SRC_WAREHOUSE_ID,))
    rows = cur.fetchall()
    print(f"Строк-кандидатов на исправление в источнике: {len(rows)}")

    cur.execute("SELECT id, name FROM store_product")
    src_products = cur.fetchall()

    with schema_context(TENANT_SCHEMA):
        from accounting.models import Document, DocumentItem, Product

        existing = {p.name.strip().lower(): p.id for p in Product.objects.all()}
        product_map = {}
        for r in src_products:
            key = (r['name'] or '').strip().lower()
            pid = existing.get(key)
            if pid:
                product_map[r['id']] = pid

        fixed = 0
        not_found_doc = 0
        not_found_item = 0
        affected_doc_ids = set()

        for r in rows:
            w2p = r['wozwrat_or_prihod']
            if w2p == 'wozwrat':
                # RETURN_IN/RETURN_OUT префиксы — редкий кейс среди нулевых цен,
                # определяем как в migrate_polisem.py.
                prefix = 'POL-ROUT-' if r['partner_type'] == 'founder' else 'POL-RIN-'
            else:
                prefix = TYPE_PREFIX_BY_DIR.get(w2p)
            if not prefix:
                not_found_doc += 1
                continue
            number = f"{prefix}{r['invoice_id']:06d}"
            prod_id = product_map.get(r['product_id'])
            if not prod_id:
                not_found_doc += 1
                continue

            doc = Document.objects.filter(number=number).first()
            if not doc:
                not_found_doc += 1
                continue

            item = DocumentItem.objects.filter(document_id=doc.id, product_id=prod_id, price=0).first()
            if not item:
                not_found_item += 1
                continue

            corrected = q2(r['price_after_discount'] or r['retail_price'] or r['purchase_price'])
            if corrected <= 0:
                continue
            # DocumentItem.save() запрещает править строки проведённого
            # документа (нормальное бизнес-правило для UI) — здесь это
            # правка данных миграции, а не пользовательское редактирование,
            # поэтому обходим его через queryset.update(), как и остальные
            # точечные фиксы миграции (см. паттерн в MIGRATION_TODO.txt).
            DocumentItem.objects.filter(pk=item.pk).update(price=corrected)
            affected_doc_ids.add(doc.id)
            fixed += 1

        print(f"DocumentItem.price исправлено: {fixed} "
              f"(документ не найден/тип неизвестен={not_found_doc}, строка не найдена={not_found_item})")

        recalced = 0
        for doc in Document.objects.filter(id__in=affected_doc_ids):
            doc.recalculate()
            recalced += 1
        print(f"Document.recalculate() выполнено для {recalced} документов")

    conn.close()


if __name__ == '__main__':
    main()
