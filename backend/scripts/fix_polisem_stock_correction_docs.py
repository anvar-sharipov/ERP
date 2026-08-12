"""
Точечная коррекция бага 2026-08-10: migrate_polisem.py (PHASE 3.4/
phase3_stock_finalize) создаёт 108 "корректирующих" StockMovement — БЕЗ
привязанного Document/DocumentItem — чтобы свести реконструированный из
истории остаток с реальным store_warehouseproduct.quantity источника (см.
ТЕХ. НАХОДКИ п.5 в MIGRATION_TODO.txt, прогон 2026-07-21). Это верно для
WarehouseStock/итогового остатка (сверка "3101 из 3101 сошлось" не врёт),
но отчёт "Оборот товаров" (report_views.py::product_turnover,
_compute_product_card_rows) реконструирует Начало/Приход/Расход/Конец
ИСКЛЮЧИТЕЛЬНО из DocumentItem, а не из StockMovement — эти 108
"осиротевших" движений ему попросту не видны. Обнаружено пользователем:
Excel-выгрузка "Оборот товаров" за 10.08.2026-10.08.2026 (день, на который
и датированы все 108 корректировок) не сходится с тем же отчётом в
Polisem по 105 товарам (сумма разницы = ровно сумма корректировок).

ФИКС: для каждой корректирующей StockMovement создаём пару Document+
DocumentItem (price=0/cost_price=0 — это не реальная сделка, а факт
"остаток довели до значения источника", те же 0 суммы, что уже были у
самой StockMovement) с тем же product/warehouse/quantity/date/direction.
DocumentItem не проводится через Document.post() (просто ORM create) —
значит НЕ создаёт вторую StockMovement (та единственная, что уже есть,
остаётся как есть) — только делает поправку видимой для DocumentItem-based
отчётов. journal_entry не создаём (это не бухгалтерская проводка, только
факт остатка — не участвует ни в ОСВ, ни в сальдо, там сверка уже 100%).

Запуск: python scripts/fix_polisem_stock_correction_docs.py (внутри backend-контейнера).
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django_tenants.utils import schema_context

TENANT_SCHEMA = 'polisem'
TARGET_BRANCH_ID = 5

TYPE_BY_DIRECTION = {'in': 'in', 'out': 'out'}


def main():
    with schema_context(TENANT_SCHEMA):
        from accounting.models import Document, DocumentItem, StockMovement

        corrections = StockMovement.objects.filter(
            note__icontains='Корректировка при переносе',
        ).order_by('id')
        print(f"Корректирующих StockMovement: {corrections.count()}")

        # Идемпотентность: если скрипт уже прогоняли — не дублировать.
        already = Document.objects.filter(extra_data__row_type='stock_correction').count()
        if already:
            print(f"Уже есть {already} документов-корректировок — похоже, скрипт уже "
                  f"прогоняли. Прерываюсь, чтобы не задвоить.")
            return

        docs_to_create = []
        meta = []
        for sm in corrections:
            dtype = TYPE_BY_DIRECTION.get(sm.direction)
            if not dtype:
                print(f"  ПРОПУЩЕНО (неожиданное direction={sm.direction}): "
                      f"product_id={sm.product_id}")
                continue
            docs_to_create.append(Document(
                number=f"POL-CORR-{sm.product_id:06d}",
                document_type=dtype,
                status=Document.Status.POSTED,
                date=sm.date,
                warehouse_id=sm.warehouse_id,
                branch_id=TARGET_BRANCH_ID,
                note="Корректировка остатка при переносе данных из Polisem",
                extra_data={'row_type': 'stock_correction'},
            ))
            meta.append(sm)

        created_docs = Document.objects.bulk_create(docs_to_create)
        print(f"Document создано: {len(created_docs)}")

        items_to_create = [
            DocumentItem(
                document_id=doc.id, product_id=sm.product_id,
                quantity=sm.quantity, price=0, cost_price=0, line_no=1,
            )
            for doc, sm in zip(created_docs, meta)
        ]
        DocumentItem.objects.bulk_create(items_to_create)
        print(f"DocumentItem создано: {len(items_to_create)}")

        for doc in created_docs:
            doc.recalculate()
        print(f"Document.recalculate() выполнено для {len(created_docs)} документов "
              f"(должно быть total=0 у всех — price=0)")


if __name__ == '__main__':
    main()
