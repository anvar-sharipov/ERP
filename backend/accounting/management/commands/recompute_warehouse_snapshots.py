# accounting/management/commands/recompute_warehouse_snapshots.py
"""
Разовая утилита: пересчитывает WarehouseProductSnapshot склада заново по всем
уже закрытым датам подряд (в хронологическом порядке). Нужна, когда проводки
за уже закрытые периоды были поправлены напрямую в обход Document.post()/
unpost() (см. SystemAlert SNAPSHOT_MISMATCH) — тогда старые снапшоты
расходятся с текущим состоянием документов.

Два режима:
  - обычный (по умолчанию): цепочкой день-за-днём через
    create_snapshot_for_closing (быстро, но снапшот хранится с округлением
    до копейки на КАЖДОМ дне — за сотни дней подряд это накапливает
    заметный дрейф округления, который затем сама ежедневная проверка
    находит как "расхождение");
  - --full: каждую дату пересчитывает С НУЛЯ (compute_balances без
    since_date — полный скан истории на эту дату, ровно так же, как это
    делает сама проверка расхождений), без промежуточных округлений —
    медленнее, но результат гарантированно не расходится с проверкой.

    python manage.py recompute_warehouse_snapshots --schema polisem --warehouse 6 --full
"""
from django.core.management.base import BaseCommand, CommandError
from django_tenants.utils import schema_context

from accounting.models import ClosedPeriod, Warehouse, WarehouseProductSnapshot
from accounting.warehouse_snapshot import compute_balances, create_snapshot_for_closing


class Command(BaseCommand):
    help = 'Пересчитывает WarehouseProductSnapshot склада заново по всем закрытым датам подряд.'

    def add_arguments(self, parser):
        parser.add_argument('--schema', required=True, help='Схема тенанта, например polisem')
        parser.add_argument('--warehouse', required=True, type=int, help='ID склада')
        parser.add_argument('--full', action='store_true', help='Пересчитывать каждую дату с нуля, без цепочки (без накопления округления)')

    def handle(self, *args, **options):
        schema = options['schema']
        warehouse_id = options['warehouse']
        full = options['full']

        with schema_context(schema):
            try:
                warehouse = Warehouse.objects.get(pk=warehouse_id)
            except Warehouse.DoesNotExist:
                raise CommandError(f'Склад #{warehouse_id} не найден в схеме {schema}')

            dates = list(
                ClosedPeriod.objects.filter(warehouse=warehouse)
                .order_by('date').values_list('date', flat=True)
            )
            if not dates:
                self.stdout.write(self.style.WARNING(f'По складу «{warehouse.name}» нет закрытых периодов.'))
                return

            mode = 'с нуля на каждую дату' if full else 'цепочкой'
            self.stdout.write(f'Склад «{warehouse.name}»: пересчитываем {len(dates)} дат ({dates[0]} … {dates[-1]}), режим: {mode}')
            for i, date in enumerate(dates, 1):
                if full:
                    balances = compute_balances(warehouse.id, date)
                    WarehouseProductSnapshot.objects.filter(warehouse=warehouse, date=date).delete()
                    WarehouseProductSnapshot.objects.bulk_create([
                        WarehouseProductSnapshot(warehouse=warehouse, product_id=pid, date=date, quantity=bal['qty'], value=bal['value'])
                        for pid, bal in balances.items()
                    ])
                else:
                    create_snapshot_for_closing(warehouse, date)
                if i % 30 == 0:
                    self.stdout.write(f'  … {i}/{len(dates)} ({date})')

            self.stdout.write(self.style.SUCCESS(f'Готово: пересчитано {len(dates)} снапшотов по складу «{warehouse.name}».'))
