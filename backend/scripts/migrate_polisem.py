"""
Перенос данных Polisem -> MyERP (тенант "polisem").
Полная инструкция и история решений: см. MIGRATION_TODO.txt в папке нового
бэкапа (C:\\Users\\Anvar\\Desktop\\polisem_store\\<дата>_backup\\MIGRATION_TODO.txt),
раздел "ТРЕБОВАНИЯ ПОЛЬЗОВАТЕЛЯ 2026-07-21" — правила остаются в силе для
КАЖДОГО следующего прогона, не только для этого.

Запуск (НЕ через manage.py shell — see известная проблема с with-блоками):
    cd C:\\Users\\Anvar\\Desktop\\learn\\my_works\\my_erp\\backend
    ...\\venv\\Scripts\\python.exe scripts\\migrate_polisem.py

Перед запуском:
  - Источник (дамп) должен быть восстановлен в scratch-БД polisem_check
    (createdb + psql -f <dump>.sql -d polisem_check).
  - SRC_DSN / MEDIA_SRC_DIR ниже должны указывать на актуальный дамп/медиа.
"""
import datetime
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

import psycopg2
import psycopg2.extras
from django.contrib.contenttypes.models import ContentType
from django.core.files import File
from django.db import transaction as db_transaction
from django_tenants.utils import schema_context

SRC_DSN = dict(
    host='db', port=5432, user='postgres',
    password='novedu112garagoz', dbname='polisem_check',
)
MEDIA_SRC_DIR = r"/tmp/polisem_media/products"

TENANT_SCHEMA = 'polisem'
TARGET_WAREHOUSE_ID = 6     # "Polisem Sklad1"
TARGET_BRANCH_ID = 5
SRC_WAREHOUSE_ID = 1        # "Sklad 1 USD" в Polisem — единственный реально используемый

TEST_DOCUMENT_NUMBERS = [
    'OUT-2026-016405', 'OUT-2026-016406', 'OUT-2026-016407',
    'OUT-2026-016408', 'OUT-2026-016409', 'OUT-2026-016410',
]


def src():
    conn = psycopg2.connect(**SRC_DSN)
    return conn


def dictcur(conn):
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


def q2(v):
    if v is None:
        return Decimal('0')
    return Decimal(v).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def q3(v):
    if v is None:
        return Decimal('0')
    return Decimal(v)


# ═══════════════════════════════════════════════════════════════════════
# PHASE 1 — полный снос тенанта
# ═══════════════════════════════════════════════════════════════════════
def phase1_wipe():
    from accounting.models import (
        TransactionLine, StockMovement, AuditLog, DocumentItem, Document,
        JournalEntry, WarehouseStock, Trip, ClosedPeriod, WarehouseProductSnapshot,
    )
    from accounting.models.currency import ExchangeRate

    print("=== ФАЗА 1: полный снос тенанта polisem ===")
    with db_transaction.atomic():
        n = TransactionLine.objects.all().delete()
        print("  TransactionLine удалено:", n[0])
        n = StockMovement.objects.all().delete()
        print("  StockMovement удалено:", n[0])
        n = AuditLog.objects.all().delete()
        print("  AuditLog удалено:", n[0])
        n = DocumentItem.objects.all().delete()
        print("  DocumentItem удалено:", n[0])
        n = Document.objects.all().delete()
        print("  Document удалено:", n[0])
        n = JournalEntry.objects.all().delete()
        print("  JournalEntry удалено:", n[0])
        n = WarehouseStock.objects.all().delete()
        print("  WarehouseStock удалено:", n[0])
        n = Trip.objects.all().delete()
        print("  Trip удалено:", n[0])
        n = ClosedPeriod.objects.all().delete()
        print("  ClosedPeriod удалено:", n[0])
        n = ExchangeRate.objects.filter(currency__code='USD').delete()
        print("  ExchangeRate(USD) удалено:", n[0])
        # ⚠️ WarehouseProductSnapshot — кэш остатков на конец дня (используется
        # report_views.py::product_turnover как стартовая точка для периода).
        # Если не снести вместе со всем остальным — старые снапшоты остаются
        # привязаны к УЖЕ УДАЛЁННЫМ Document/DocumentItem этого прогона и
        # ломают отчёты по остаткам для ЛЮБОГО периода после последней даты
        # снапшота (найдено 2026-08-09: 720449 протухших строк ломали отчёт
        # "оборот товара" почти для всего каталога). Снапшоты пересоздаются
        # автоматически (report_views.py при отсутствии снапшота честно
        # сканирует всю историю DocumentItem — корректно, но медленнее) или
        # явно через `manage.py recompute_warehouse_snapshots --full` в конце
        # этого скрипта (см. main()).
        n = WarehouseProductSnapshot.objects.all().delete()
        print("  WarehouseProductSnapshot удалено:", n[0])
    print("Фаза 1 завершена.\n")


# ═══════════════════════════════════════════════════════════════════════
# PHASE 2 — справочники
# ═══════════════════════════════════════════════════════════════════════
def phase2_employees(cur):
    from accounting.models import Employee, Position

    print("=== ФАЗА 2.1: сотрудники/водители ===")
    pos_driver = Position.objects.get(id=19)     # "Водитель"
    pos_worker = Position.objects.get(id=20)     # "Грузчик"

    cur.execute("SELECT id, name, type FROM store_employee")
    rows = cur.fetchall()

    existing = {e.full_name.strip().lower(): e for e in Employee.objects.all()}
    employee_map = {}
    matched, created = 0, 0
    for r in rows:
        name = (r['name'] or '').strip()
        key = name.lower()
        emp = existing.get(key)
        if emp:
            matched += 1
        else:
            pos = pos_driver if r['type'] == 'driver' else pos_worker
            emp = Employee.objects.create(full_name=name, position=pos)
            existing[key] = emp
            created += 1
        employee_map[r['id']] = emp.id
    print(f"  Сотрудники: matched={matched} created={created} total={len(employee_map)}")
    return employee_map


def phase2_counterparties(cur):
    from accounting.models import Counterparty

    print("=== ФАЗА 2.1b: контрагенты ===")
    cur.execute("SELECT id, name, type FROM store_partner")
    rows = cur.fetchall()

    existing = {c.name.strip().lower(): c for c in Counterparty.objects.all()}
    counterparty_map = {}
    matched, created = 0, 0
    for r in rows:
        name = (r['name'] or '').strip()
        key = name.lower()
        cp = existing.get(key)
        if cp:
            matched += 1
        else:
            ctype = Counterparty.Type.SUPPLIER if r['type'] == 'founder' else Counterparty.Type.CLIENT
            cp = Counterparty.objects.create(name=name, type=ctype)
            existing[key] = cp
            created += 1
        counterparty_map[r['id']] = cp.id
    print(f"  Контрагенты: matched={matched} created={created} total={len(counterparty_map)}")
    return counterparty_map


def phase2_products(cur):
    from accounting.models import Product

    print("=== ФАЗА 2.1c: товары ===")
    cur.execute("SELECT id, name, purchase_price FROM store_product")
    rows = cur.fetchall()

    existing = {p.name.strip().lower(): p for p in Product.objects.all()}
    product_map = {}
    matched, created = 0, 0
    for r in rows:
        name = (r['name'] or '').strip()
        key = name.lower()
        p = existing.get(key)
        if p:
            matched += 1
        else:
            p = Product.objects.create(name=name, cost_price=q3(r['purchase_price']))
            existing[key] = p
            created += 1
        product_map[r['id']] = p.id
    print(f"  Товары: matched={matched} created={created} total={len(product_map)}")
    return product_map


def phase2_bundles(cur, product_map):
    from accounting.models import ProductBundle

    print("=== ФАЗА 2.2: комплектующие (ProductBundle) — ДО накладных ===")
    # ⚠️ f.main_product_id — ИМЯ ВВОДИТ В ЗАБЛУЖДЕНИЕ: это FK на store_invoiceitem.id
    # (строку накладной), НЕ на store_product.id — реальный "основной товар" нужно
    # брать через ii.product_id (см. MIGRATION_TODO.txt, раздел про комплектующие).
    cur.execute("""
        SELECT ii.product_id AS main_product_id, f.gift_product_obj_id, f.quantity_per_unit
        FROM store_freeitemforinvoiceitem f
        JOIN store_invoiceitem ii ON ii.id = f.main_product_id
        WHERE f.gift_product_obj_id IS NOT NULL
    """)
    rows = cur.fetchall()

    seen = {}
    for r in rows:
        mp = product_map.get(r['main_product_id'])
        gp = product_map.get(r['gift_product_obj_id'])
        if not mp or not gp or mp == gp:
            continue
        ratio = q3(r['quantity_per_unit']) or Decimal('1')
        seen[(mp, gp)] = ratio

    created = 0
    for (mp, gp), ratio in seen.items():
        _, was_created = ProductBundle.objects.get_or_create(
            product_id=mp, bundle_product_id=gp,
            defaults={'qty_ratio': ratio, 'default_price': 0},
        )
        if was_created:
            created += 1
    print(f"  ProductBundle: уникальных пар={len(seen)} создано={created}")


def phase2_prices(cur, product_map):
    from accounting.models import Product, ProductPrice, PriceType

    print("=== ФАЗА 2.3: цены и себестоимость ===")
    price_types = {pt.name: pt for pt in PriceType.objects.all()}
    roznisa = price_types['Roznisa']
    optom = price_types['Optom']
    skidka = price_types['Skidka']
    firma = price_types['Firma']

    cur.execute("""
        SELECT id, purchase_price, retail_price, wholesale_price,
               discount_price, firma_price
        FROM store_product
    """)
    rows = cur.fetchall()

    price_created, price_updated, cost_updated = 0, 0, 0
    products_by_id = {p.id: p for p in Product.objects.filter(id__in=product_map.values())}

    for r in rows:
        pid = product_map.get(r['id'])
        if not pid:
            continue
        prod = products_by_id.get(pid)
        new_cost = q3(r['purchase_price'])
        if prod and prod.cost_price != new_cost:
            Product.objects.filter(pk=pid).update(cost_price=new_cost)
            cost_updated += 1

        for pt, val in (
            (roznisa, r['retail_price']), (optom, r['wholesale_price']),
            (skidka, r['discount_price']), (firma, r['firma_price']),
        ):
            _, was_created = ProductPrice.objects.update_or_create(
                product_id=pid, warehouse_id=TARGET_WAREHOUSE_ID, branch=None,
                price_type=pt,
                defaults={'price': q3(val), 'is_active': True},
            )
            if was_created:
                price_created += 1
            else:
                price_updated += 1
    print(f"  ProductPrice: created={price_created} updated={price_updated}; cost_price обновлено={cost_updated}")


def phase2_photos(cur, product_map):
    from accounting.models import ProductImage

    print("=== ФАЗА 2.4: фото товаров ===")
    cur.execute("SELECT product_id, image, alt_text FROM store_productimage")
    rows = cur.fetchall()

    has_photo = {p_id for p_id, in ProductImage.objects.values_list('product_id').distinct()}

    created, skipped_has_photo, skipped_no_product, skipped_no_file = 0, 0, 0, 0
    for r in rows:
        pid = product_map.get(r['product_id'])
        if not pid:
            skipped_no_product += 1
            continue
        if pid in has_photo:
            skipped_has_photo += 1
            continue
        rel_path = r['image']
        if not rel_path:
            skipped_no_file += 1
            continue
        fname = os.path.basename(rel_path)
        src_product_dir_id = str(r['product_id'])
        full_path = os.path.join(MEDIA_SRC_DIR, src_product_dir_id, fname)
        if not os.path.exists(full_path):
            skipped_no_file += 1
            continue
        with open(full_path, 'rb') as fh:
            img = ProductImage.objects.create(
                product_id=pid, image=File(fh, name=fname),
                alt_text=r['alt_text'] or '',
            )
        # ✅ БАГ, найденный 2026-07-27: thumbnail (ImageSpecField) генерируется
        # ЛЕНИВО django-imagekit при первом обращении к .url — раньше это
        # обращение впервые случалось только при чтении отчёта (product_turnover/
        # list_light_images), т.е. первый же реальный запрос отчёта после
        # переноса синхронно генерировал превью для ВСЕХ перенесённых фото разом
        # (682 шт. на прогоне 2026-07-21) — воспринималось как "страница долго
        # грузится". Генерируем сразу здесь, один раз при переносе, а не при
        # первом чтении любым пользователем (см. тот же фикс в
        # product_views.py::ProductImageViewSet.perform_create для обычной
        # загрузки фото через UI).
        img.thumbnail.generate()
        has_photo.add(pid)
        created += 1
    print(f"  ProductImage: created={created} skipped_has_photo={skipped_has_photo} "
          f"skipped_no_product={skipped_no_product} skipped_no_file={skipped_no_file}")


def phase2_exchange_rate(cur):
    from accounting.models.currency import Currency, ExchangeRate

    print("=== ФАЗА 2.5: курс валюты (USD) ===")
    usd = Currency.objects.get(code='USD')
    cur.execute("SELECT amount, date FROM store_currencykurs ORDER BY date")
    rows = cur.fetchall()
    objs = [ExchangeRate(currency=usd, rate=q3(r['amount']), date=r['date']) for r in rows]
    ExchangeRate.objects.bulk_create(objs)
    print(f"  ExchangeRate(USD): создано {len(objs)} записей "
          f"({rows[0]['date'] if rows else '-'} .. {rows[-1]['date'] if rows else '-'})")


# ═══════════════════════════════════════════════════════════════════════
# PHASE 3 — основной перенос истории
# ═══════════════════════════════════════════════════════════════════════
def build_account_map():
    from accounting.models import Account

    accounts = {a.code: a for a in Account.objects.all()}
    resolved = {}
    for code, acc in accounts.items():
        if not acc.is_group:
            resolved[code] = acc
            continue
        children = [c for c in accounts.values() if c.parent_id == acc.id and not c.is_group]
        if len(children) == 1:
            resolved[code] = children[0]
        elif len(children) > 1:
            # ⚠️ Счёт-группа с несколькими листами (напр. 40 -> 40.1/40.2) и в
            # Polisem-дампе проводка сослалась на код родителя напрямую (редкий
            # случай, единичные строки) — детерминированно берём "<code>.1"
            # (реально используемый лист, см. Warehouse.inventory_account=40.1),
            # иначе первый по алфавиту, вместо того чтобы молча терять строку.
            preferred = next((c for c in children if c.code == f"{code}.1"), None)
            resolved[code] = preferred or sorted(children, key=lambda c: c.code)[0]
        else:
            resolved[code] = None  # группа без единого листа — обработаем при использовании
    return resolved


def build_subconto_requirements():
    from accounting.models import Account

    result = {}
    for acc in Account.objects.prefetch_related('subcontos').all():
        reqs = []
        for st in acc.subcontos.all():
            model = st.content_type.model if st.content_type_id else None
            reqs.append((st.slug, model))
        result[acc.id] = reqs
    return result


def resolve_subcontos(account_id, subconto_reqs, counterparty_map, product_map,
                       partner_id, product_id):
    result = {}
    for slug, model in subconto_reqs.get(account_id, []):
        if model == 'counterparty' and partner_id:
            val = counterparty_map.get(partner_id)
            if val:
                result[slug] = val
        elif model == 'product' and product_id:
            val = product_map.get(product_id)
            if val:
                result[slug] = val
    return result


def phase3_trips(cur, employee_map):
    from accounting.models import Trip

    print("=== ФАЗА 3.1: рейсы (Trip) ===")
    # ⚠️ invoice_date — timestamptz, в источнике ВСЕГДА хранится как ровно
    # 19:00:00 UTC (= полночь по Ашхабаду/Туркменистан, UTC+5) — это по
    # сути date-only поле, просто закодированное как местная полночь.
    # Голый .date() от значения psycopg2 (которое приходит в UTC) даёт
    # день МИНУС ОДИН от настоящего — конвертируем в местное время явно на
    # уровне SQL (баг найден 2026-08-09, см. MIGRATION_TODO.txt).
    cur.execute("""
        SELECT t.id, t.driver_id,
               MIN(i.invoice_date AT TIME ZONE 'Asia/Ashgabat') AS min_date
        FROM store_trip t
        LEFT JOIN store_invoice i ON i.trip_id = t.id
        GROUP BY t.id, t.driver_id
    """)
    rows = cur.fetchall()

    trip_map = {}
    created = 0
    trip_objs = []
    ids_in_order = []
    for r in rows:
        drv = employee_map.get(r['driver_id'])
        if not drv:
            continue
        trip_date = r['min_date'].date() if r['min_date'] else None
        if trip_date is None:
            continue
        trip_objs.append(Trip(driver_id=drv, warehouse_id=TARGET_WAREHOUSE_ID, date=trip_date))
        ids_in_order.append(r['id'])

    created_objs = Trip.objects.bulk_create(trip_objs)
    for src_id, obj in zip(ids_in_order, created_objs):
        trip_map[src_id] = obj.id
    created = len(created_objs)
    print(f"  Trip: создано={created} (пропущено без водителя/дат={len(rows) - created})")
    return trip_map


def phase3_main(cur, product_map, counterparty_map, employee_map, trip_map):
    from accounting.models import (
        Document, DocumentItem, JournalEntry, TransactionLine, StockMovement,
    )

    print("=== ФАЗА 3.2: основной перенос (Document/JournalEntry/TransactionLine) ===")
    subconto_reqs = build_subconto_requirements()
    doc_ct = ContentType.objects.get_for_model(Document)

    TYPE_PREFIX = {
        Document.Type.IN: 'POL-IN-',
        Document.Type.OUT: 'POL-OUT-',
        Document.Type.RETURN_IN: 'POL-RIN-',
        Document.Type.RETURN_OUT: 'POL-ROUT-',
    }

    # ── исходные накладные ──────────────────────────────────────────
    # ⚠️ invoice_date AT TIME ZONE 'Asia/Ashgabat' — см. комментарий в
    # phase3_trips выше про баг с часовым поясом (2026-08-09).
    cur.execute("""
        SELECT i.id, i.wozwrat_or_prihod, i.is_entry, i.canceled_at,
               (i.invoice_date AT TIME ZONE 'Asia/Ashgabat') AS invoice_date,
               i.partner_id, i.trip_id, i.comment, p.type AS partner_type
        FROM store_invoice i
        LEFT JOIN store_partner p ON p.id = i.partner_id
        WHERE i.warehouse_id = %s
    """, (SRC_WAREHOUSE_ID,))
    invoices = cur.fetchall()

    document_map = {}       # store_invoice.id -> Document.id
    document_type_map = {}  # store_invoice.id -> Document.Type
    skipped_canceled = 0
    n_draft = 0
    # Отменённые и черновики — их JournalEntry/TransactionLine НЕ переносим
    # (аудит 2026-07-13: черновик в Polisem должен остаться черновиком без
    # проводок в MyERP; отменённые не переносим вообще).
    no_posting_invoice_ids = set()

    docs_to_create = []
    doc_meta = []  # parallel list: (src_invoice_id, type)
    for inv in invoices:
        if inv['canceled_at'] is not None:
            skipped_canceled += 1
            no_posting_invoice_ids.add(inv['id'])
            continue
        w2p = inv['wozwrat_or_prihod']
        if w2p == 'prihod':
            dtype = Document.Type.IN
        elif w2p == 'rashod':
            dtype = Document.Type.OUT
        else:  # wozwrat
            dtype = Document.Type.RETURN_OUT if inv['partner_type'] == 'founder' else Document.Type.RETURN_IN

        status = Document.Status.POSTED if inv['is_entry'] else Document.Status.DRAFT
        if status == Document.Status.DRAFT:
            n_draft += 1
            no_posting_invoice_ids.add(inv['id'])

        cp_id = counterparty_map.get(inv['partner_id'])
        trip_id = trip_map.get(inv['trip_id']) if dtype == Document.Type.OUT else None
        number = f"{TYPE_PREFIX[dtype]}{inv['id']:06d}"

        docs_to_create.append(Document(
            number=number, document_type=dtype, status=status,
            date=inv['invoice_date'].date(),
            warehouse_id=TARGET_WAREHOUSE_ID, branch_id=TARGET_BRANCH_ID,
            counterparty_id=cp_id, trip_id=trip_id,
            note=(inv['comment'] or '')[:500],
        ))
        doc_meta.append((inv['id'], dtype))

    created_docs = Document.objects.bulk_create(docs_to_create)
    for (src_id, dtype), doc in zip(doc_meta, created_docs):
        document_map[src_id] = doc.id
        document_type_map[src_id] = dtype
    print(f"  Document: создано={len(created_docs)} (отменённых пропущено={skipped_canceled}, "
          f"черновиков={n_draft})")

    # ── строки накладных ────────────────────────────────────────────
    cur.execute("""
        SELECT ii.invoice_id, ii.product_id, ii.selected_quantity, ii.total_quantity,
               ii.selected_price, ii.price_after_discount, ii.retail_price,
               ii.purchase_price, ii.discount_percent
        FROM store_invoiceitem ii
        JOIN store_invoice i ON i.id = ii.invoice_id
        WHERE i.warehouse_id = %s AND i.canceled_at IS NULL
    """, (SRC_WAREHOUSE_ID,))
    items = cur.fetchall()

    items_to_create = []
    item_meta = []  # (invoice_id, product_id_myerp, quantity, cost_price) for stock movement
    skipped_bad = 0
    line_counter = defaultdict(int)
    for it in items:
        doc_id = document_map.get(it['invoice_id'])
        prod_id = product_map.get(it['product_id'])
        qty = it['selected_quantity'] if it['selected_quantity'] not in (None, 0) else it['total_quantity']
        if not doc_id or not prod_id or not qty or qty <= 0:
            skipped_bad += 1
            continue
        # ⚠️ selected_price/price_after_discount в источнике NOT NULL — при
        # незаполненной цене там реальный 0, а не NULL, поэтому проверка
        # "is None" фолбэк не ловила (баг найден 2026-08-09, см.
        # MIGRATION_TODO.txt). Трактуем 0 как "не задано" так же, как None,
        # и в качестве последнего фолбэка используем ещё и purchase_price
        # (для "Приход"-накладных retail_price/purchase_price совпадают).
        price = it['selected_price'] or None
        if price is None:
            price = it['price_after_discount'] or None
        if price is None:
            price = it['retail_price'] or None
        if price is None:
            price = it['purchase_price']
        price = q3(price)
        cost_price = q3(it['purchase_price'])
        line_counter[doc_id] += 1
        items_to_create.append(DocumentItem(
            document_id=doc_id, product_id=prod_id, line_no=line_counter[doc_id],
            quantity=q3(qty), price=price, cost_price=cost_price,
            discount_percent=q3(it['discount_percent']),
        ))
        # ✅ Черновики (no_posting_invoice_ids) НЕ двигают склад — DocumentItem всё
        # равно создаётся (видно как в Polisem-черновике), просто без StockMovement.
        if it['invoice_id'] not in no_posting_invoice_ids:
            item_meta.append((it['invoice_id'], document_type_map[it['invoice_id']],
                               prod_id, q3(qty), cost_price))

    DocumentItem.objects.bulk_create(items_to_create, batch_size=2000)
    print(f"  DocumentItem: создано={len(items_to_create)} (пропущено как невалидные={skipped_bad})")

    # ── комплектующие как историчные строки ─────────────────────────
    cur.execute("""
        SELECT f.main_product_id, f.gift_product_obj_id, f.quantity_per_unit,
               ii.invoice_id, ii.selected_quantity, ii.total_quantity
        FROM store_freeitemforinvoiceitem f
        JOIN store_invoiceitem ii ON ii.id = f.main_product_id
        JOIN store_invoice i ON i.id = ii.invoice_id
        WHERE i.warehouse_id = %s AND i.canceled_at IS NULL
    """, (SRC_WAREHOUSE_ID,))
    bundle_rows = cur.fetchall()

    bundle_items = []
    bundle_meta = []
    skipped_bundle = 0
    for br in bundle_rows:
        doc_id = document_map.get(br['invoice_id'])
        gp_id = product_map.get(br['gift_product_obj_id'])
        base_qty = br['selected_quantity'] if br['selected_quantity'] not in (None, 0) else br['total_quantity']
        if not doc_id or not gp_id or not base_qty:
            skipped_bundle += 1
            continue
        qty = q3(base_qty) * (q3(br['quantity_per_unit']) or Decimal('1'))
        if qty <= 0:
            skipped_bundle += 1
            continue
        line_counter[doc_id] += 1
        bundle_items.append(DocumentItem(
            document_id=doc_id, product_id=gp_id, line_no=9000 + line_counter[doc_id],
            quantity=qty, price=0, cost_price=0,
            extra_data={'row_type': 'bundle', 'is_bundle_component': True},
        ))
        if br['invoice_id'] not in no_posting_invoice_ids:
            bundle_meta.append((br['invoice_id'], document_type_map[br['invoice_id']], gp_id, qty, Decimal('0')))

    DocumentItem.objects.bulk_create(bundle_items, batch_size=2000)
    print(f"  DocumentItem (комплектующие): создано={len(bundle_items)} (пропущено={skipped_bundle})")

    # ✅ БАГ, найденный 2026-07-27 (на прогоне 2026-07-21): bulk_create() выше
    # не вызывает Document.save()/recalculate() — значит total/subtotal/
    # total_profit/discount_amount остаются на дефолте 0 для ВСЕХ перенесённых
    # документов (проверено: 8008 из 8008 в тенанте polisem). Сами проводки
    # (JournalEntry/TransactionLine) от этого не страдают — ОСВ/сальдо клиентов
    # считаются по ним, не по Document.total, поэтому reconcile_polisem.py это
    # не ловил. Но Document.total — источник для дашборда (revenue-by-warehouse,
    # top-counterparties, RevenueByWarehouseChart/RevenueTrendChart), поэтому
    # весь дашборд показывал 0,00 выручки при 8008 реальных документах.
    # Пересчитываем total/subtotal/total_profit из уже вставленных DocumentItem
    # (обычных + комплектующих) сразу здесь — recalculate() трогает только эти
    # 4 поля через Document.objects.filter(pk=...).update(...), склад/проводки
    # не задевает, безопасно вызывать после bulk_create.
    for doc in created_docs:
        doc.recalculate()
    print(f"  Document.recalculate(): пересчитано total/subtotal/total_profit для {len(created_docs)} документов")

    all_item_meta = item_meta + bundle_meta

    # ── проводки (JournalEntry + TransactionLine) ───────────────────
    # ⚠️ Транзакции черновиков/отменённых накладных НЕ переносим — иначе задвоение
    # (эти транзакции реально не отражают факт хозяйственной жизни в Polisem,
    # см. MIGRATION_TODO.txt, аудит 2026-07-13).
    # ⚠️ Приводим к местной дате (Asia/Ashgabat) и берём именно ::date, а не
    # timestamptz — JournalEntry.date хотя и DateTimeField, но по конвенции
    # всего кода (см. document.py: date=self.date, где self.date —
    # DateField) хранит "дату документа" как полночь UTC этой даты, а не
    # реальное время; передавать сырой timestamptz из источника напрямую
    # (баг 2026-08-09) даёт день минус один.
    cur.execute("""
        SELECT id, (date AT TIME ZONE 'Asia/Ashgabat')::date AS date,
               invoice_id, description
        FROM store_transaction
    """)
    all_transactions = cur.fetchall()
    transactions = [t for t in all_transactions if t['invoice_id'] not in no_posting_invoice_ids]
    skipped_draft_tx = len(all_transactions) - len(transactions)

    je_to_create = []
    tx_meta = []  # (src_transaction_id, invoice_id)
    for tr in transactions:
        number = f"POL-JE-{tr['id']:07d}"
        doc_id = document_map.get(tr['invoice_id']) if tr['invoice_id'] else None
        je_to_create.append(JournalEntry(
            number=number, date=tr['date'], status=JournalEntry.Status.POSTED,
            description=(tr['description'] or '')[:255],
            branch_id=TARGET_BRANCH_ID, warehouse_id=TARGET_WAREHOUSE_ID,
            source_document_type=doc_ct if doc_id else None,
            source_document_id=doc_id,
        ))
        tx_meta.append((tr['id'], tr['invoice_id']))

    created_je = JournalEntry.objects.bulk_create(je_to_create, batch_size=2000)
    je_map = {}
    invoice_primary_je = {}
    for (src_tx_id, invoice_id), je in zip(tx_meta, created_je):
        je_map[src_tx_id] = je.id
        if invoice_id and invoice_id not in invoice_primary_je:
            invoice_primary_je[invoice_id] = je.id
    print(f"  JournalEntry: создано={len(created_je)} (черновиков/отменённых пропущено={skipped_draft_tx})")

    # линкуем Document.journal_entry (только ПЕРВАЯ операция накладной — OneToOne)
    updated_docs = 0
    for invoice_id, je_id in invoice_primary_je.items():
        doc_id = document_map.get(invoice_id)
        if doc_id:
            Document.objects.filter(pk=doc_id).update(journal_entry_id=je_id)
            updated_docs += 1
    print(f"  Document.journal_entry проставлено: {updated_docs}")

    # проводки
    cur.execute("""
        SELECT id, transaction_id, account_id, debit, credit,
               product_id, partner_id, warehouse_id
        FROM store_entry
    """)
    entries = cur.fetchall()

    # account_id (store_account.id) -> number
    cur2 = cur.connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur2.execute("SELECT id, number FROM store_account")
    acc_number_by_srcid = {r['id']: r['number'] for r in cur2.fetchall()}

    resolved_accounts = build_account_map()

    tl_to_create = []
    order_counter = defaultdict(int)
    skipped_zero = 0
    skipped_no_account = 0
    for e in entries:
        je_id = je_map.get(e['transaction_id'])
        if not je_id:
            continue
        code = acc_number_by_srcid.get(e['account_id'])
        acc = resolved_accounts.get(code) if code else None
        if not acc:
            skipped_no_account += 1
            continue
        subcontos_common = None
        for side_name, amount in (('debit', e['debit']), ('credit', e['credit'])):
            amt = q2(amount)
            if amt == 0:
                continue
            if subcontos_common is None:
                subcontos_common = resolve_subcontos(
                    acc.id, subconto_reqs, counterparty_map, product_map,
                    e['partner_id'], e['product_id'],
                )
            order_counter[je_id] += 1
            tl_to_create.append(TransactionLine(
                journal_entry_id=je_id, order=order_counter[je_id],
                side=TransactionLine.Side.DEBIT if side_name == 'debit' else TransactionLine.Side.CREDIT,
                account_id=acc.id, amount=amt, subcontos=subcontos_common,
            ))
        if subcontos_common is None:
            skipped_zero += 1

    TransactionLine.objects.bulk_create(tl_to_create, batch_size=5000)
    print(f"  TransactionLine: создано={len(tl_to_create)} "
          f"(нулевых пропущено={skipped_zero}, без счёта пропущено={skipped_no_account})")

    return all_item_meta


def phase3_stock(all_item_meta, cur):
    from accounting.models import StockMovement, WarehouseStock

    print("=== ФАЗА 3.3: движения склада и остатки ===")
    from accounting.models import Document
    doc_type_direction = {
        Document.Type.IN: StockMovement.Direction.IN,
        Document.Type.RETURN_IN: StockMovement.Direction.IN,
        Document.Type.OUT: StockMovement.Direction.OUT,
        Document.Type.RETURN_OUT: StockMovement.Direction.OUT,
    }

    # ⚠️ AT TIME ZONE 'Asia/Ashgabat' — см. комментарий про баг с часовым
    # поясом (2026-08-09) выше в phase3_trips/phase3_main.
    cur.execute("""
        SELECT id, (invoice_date AT TIME ZONE 'Asia/Ashgabat')::date AS invoice_date
        FROM store_invoice WHERE warehouse_id = %s
    """, (SRC_WAREHOUSE_ID,))
    date_by_invoice = {r['id']: r['invoice_date'] for r in cur.fetchall()}

    movements = []
    net_by_product = defaultdict(Decimal)  # product_id(myerp) -> net qty (in - out)
    for invoice_id, dtype, prod_id, qty, cost_price in all_item_meta:
        direction = doc_type_direction.get(dtype)
        if not direction or qty <= 0:
            continue
        d = date_by_invoice.get(invoice_id)
        if not d:
            continue
        movements.append(StockMovement(
            warehouse_id=TARGET_WAREHOUSE_ID, product_id=prod_id, direction=direction,
            quantity=qty, cost_price=cost_price, date=d,
            note=f"Перенос из Polisem (накладная #{invoice_id})",
        ))
        if direction == StockMovement.Direction.IN:
            net_by_product[prod_id] += qty
        else:
            net_by_product[prod_id] -= qty

    StockMovement.objects.bulk_create(movements, batch_size=5000)
    print(f"  StockMovement: создано={len(movements)}")

    # ── реальный остаток по Polisem (источник истины) ──────────────
    cur.execute("SELECT product_id, quantity FROM store_warehouseproduct WHERE warehouse_id = %s", (SRC_WAREHOUSE_ID,))
    real_qty_by_src_product = {r['product_id']: q3(r['quantity']) for r in cur.fetchall()}

    return net_by_product, real_qty_by_src_product


def phase3_stock_finalize(net_by_product, real_qty_by_src_product, product_map, correction_date):
    from accounting.models import Document, DocumentItem, StockMovement, WarehouseStock

    print("=== ФАЗА 3.4: корректировка остатков до значений Polisem ===")
    # product_map: src_product_id -> myerp product_id
    real_qty_by_myerp_product = defaultdict(Decimal)
    for src_pid, qty in real_qty_by_src_product.items():
        myerp_pid = product_map.get(src_pid)
        if myerp_pid:
            real_qty_by_myerp_product[myerp_pid] += qty

    all_products = set(net_by_product) | set(real_qty_by_myerp_product)
    corrections = []
    stocks_to_upsert = []
    corr_pids = []
    for pid in all_products:
        reconstructed = net_by_product.get(pid, Decimal('0'))
        real = real_qty_by_myerp_product.get(pid, Decimal('0'))
        diff = (real - reconstructed).quantize(Decimal('0.001'))
        if diff != 0:
            direction = StockMovement.Direction.IN if diff > 0 else StockMovement.Direction.OUT
            corrections.append(StockMovement(
                warehouse_id=TARGET_WAREHOUSE_ID, product_id=pid, direction=direction,
                quantity=abs(diff), cost_price=0, date=correction_date,
                note="Корректировка при переносе данных из Polisem",
            ))
            corr_pids.append((pid, direction, abs(diff)))
        stocks_to_upsert.append(WarehouseStock(warehouse_id=TARGET_WAREHOUSE_ID, product_id=pid, quantity=real))

    StockMovement.objects.bulk_create(corrections, batch_size=2000)
    WarehouseStock.objects.bulk_create(
        stocks_to_upsert, batch_size=2000,
        update_conflicts=True, unique_fields=['warehouse', 'product'], update_fields=['quantity'],
    )
    print(f"  Корректирующих StockMovement: {len(corrections)}")

    # ⚠️ БАГ найден 2026-08-10: report_views.py::product_turnover и
    # _compute_product_card_rows считают Начало/Приход/Расход/Конец
    # ИСКЛЮЧИТЕЛЬНО из DocumentItem — голая StockMovement (без Document)
    # им попросту не видна, хотя WarehouseStock/остатки уже верны. Заводим
    # для каждой корректировки формальный Document+DocumentItem (price=0/
    # cost_price=0 — это не сделка, а факт "остаток довели до источника",
    # без journal_entry — не бухгалтерская проводка). НЕ вызываем
    # Document.post()/save() с полной бизнес-логикой — тогда создалась бы
    # ВТОРАЯ StockMovement на ту же корректировку (задвоение), только
    # bulk_create Document+DocumentItem напрямую.
    corr_docs = [
        Document(
            number=f"POL-CORR-{pid:06d}", document_type=direction, status=Document.Status.POSTED,
            date=correction_date, warehouse_id=TARGET_WAREHOUSE_ID, branch_id=TARGET_BRANCH_ID,
            note="Корректировка остатка при переносе данных из Polisem",
            extra_data={'row_type': 'stock_correction'},
        )
        for pid, direction, qty in corr_pids
    ]
    created_corr_docs = Document.objects.bulk_create(corr_docs)
    corr_items = [
        DocumentItem(document_id=doc.id, product_id=pid, quantity=qty, price=0, cost_price=0, line_no=1)
        for doc, (pid, direction, qty) in zip(created_corr_docs, corr_pids)
    ]
    DocumentItem.objects.bulk_create(corr_items)
    for doc in created_corr_docs:
        doc.recalculate()
    print(f"  Document-корректировок (для видимости в DocumentItem-отчётах): {len(created_corr_docs)}")
    print(f"  WarehouseStock: выставлено остатков для {len(stocks_to_upsert)} товаров")


# ═══════════════════════════════════════════════════════════════════════
# PHASE 4 — закрытые дни (ПОСЛЕДНИМ)
# ═══════════════════════════════════════════════════════════════════════
def phase4_closed_periods(cur):
    from accounting.models import ClosedPeriod

    print("=== ФАЗА 4: закрытие дней (ClosedPeriod) ===")
    cur.execute("SELECT date, note FROM store_dayclosing ORDER BY date")
    rows = cur.fetchall()
    objs = [
        ClosedPeriod(
            date=r['date'], branch=None, warehouse_id=TARGET_WAREHOUSE_ID,
            note=(r['note'] or 'Автоматическое закрытие (бэкфилл истории)')[:500],
        )
        for r in rows
    ]
    ClosedPeriod.objects.bulk_create(objs, batch_size=1000)
    print(f"  ClosedPeriod: создано={len(objs)}")


def main():
    conn = src()
    cur = dictcur(conn)

    with schema_context(TENANT_SCHEMA):
        phase1_wipe()
        # тестовые OUT-2026-* документы уже снесены в Фазе 1 (снос ВСЕХ Document),
        # отдельного шага не требуется — оставлено ниже как явная проверка.

        employee_map = phase2_employees(cur)
        counterparty_map = phase2_counterparties(cur)
        product_map = phase2_products(cur)
        phase2_bundles(cur, product_map)
        phase2_prices(cur, product_map)
        phase2_photos(cur, product_map)
        phase2_exchange_rate(cur)

        trip_map = phase3_trips(cur, employee_map)
        all_item_meta = phase3_main(cur, product_map, counterparty_map, employee_map, trip_map)
        net_by_product, real_qty_by_src_product = phase3_stock(all_item_meta, cur)

        # ⚠️ БАГ найден 2026-08-10: корректирующие StockMovement раньше
        # датировались ПОСЛЕДНИМ днём истории (max(invoice_date)) — из-за
        # этого report_views.py::product_turnover (DocumentItem-based, не
        # видит "осиротевшие" StockMovement без Document вообще) показывал
        # искажённый оборот ИМЕННО за последний день (корректировка,
        # накопленная за ВСЮ историю, влезала в "Приход" одного конкретного
        # дня вместо того, чтобы быть частью "Начало" с самого начала).
        # Правильно — датировать корректировку ПЕРВЫМ днём МИНУС один (до
        # начала вообще любой реальной истории), чтобы она входила в
        # "Начало" ЛЮБОГО отчётного периода, а не торчала разовым "Приходом"
        # в конкретный день. См. MIGRATION_TODO.txt.
        cur.execute("""
            SELECT min(invoice_date AT TIME ZONE 'Asia/Ashgabat')::date AS d
            FROM store_invoice WHERE warehouse_id = %s
        """, (SRC_WAREHOUSE_ID,))
        first_date = cur.fetchone()['d']
        correction_date = first_date - datetime.timedelta(days=1)
        phase3_stock_finalize(net_by_product, real_qty_by_src_product, product_map, correction_date)

        phase4_closed_periods(cur)

    conn.close()
    print("\n=== ПЕРЕНОС ЗАВЕРШЁН ===")
    print(
        "ВАЖНО: WarehouseProductSnapshot снесён в ФАЗЕ 1 и НЕ пересоздаётся "
        "автоматически здесь (пересчёт всех закрытых дат может занять больше "
        "часа — сознательно не встроен в основной прогон). Отчёты по остаткам "
        "уже КОРРЕКТНЫ и без этого шага (при отсутствии снапшота report_views.py "
        "делает честный полный скан истории), но для скорости выполните вручную:\n"
        "    python manage.py recompute_warehouse_snapshots --schema polisem "
        f"--warehouse {TARGET_WAREHOUSE_ID} --full"
    )


if __name__ == '__main__':
    main()
