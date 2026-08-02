# accounting/management/commands/backfill_close_periods.py
"""
Разовый бэкфилл: последовательно закрывает дни задним числом по одному складу
за период, когда день ещё ни разу не закрывали (см. CLAUDE.md — отчёт
product_turnover без снапшотов сканирует всю историю DocumentItem заново при
каждом запросе, это и есть причина медленной загрузки).

Повторяет ТОЧНО ту же бизнес-логику, что и ClosedPeriodViewSet.perform_create
(transaction_views.py) — закрытие можно делать только по порядку, без
пропусков, поэтому день за днём в цикле, а не одним bulk-запросом:
  - жёсткое правило "последний закрытый + 1" (одна и та же проверка);
  - перенос черновиков с датой <= закрываемого дня на следующий день;
  - AuditLog на каждое закрытие (человекочитаемый changed_data, не bulk);
  - создание WarehouseProductSnapshot (warehouse_snapshot.py::create_snapshot_for_closing).
WS-broadcast сознательно не шлём на каждый день — это исторический бэкфилл,
а не событие, на которое сейчас смотрит живой пользователь.

    python manage.py backfill_close_periods --schema polisem --warehouse 6 --user admin
    python manage.py backfill_close_periods --schema polisem --warehouse 6 --user admin --up-to 2026-06-30 --dry-run
"""
import datetime

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q
from django.contrib.contenttypes.models import ContentType
from django_tenants.utils import schema_context

from accounting.models import Document, JournalEntry, ClosedPeriod, Warehouse
from accounting.models.audit import AuditLog
from accounting.warehouse_snapshot import create_snapshot_for_closing


class Command(BaseCommand):
    help = 'Последовательно закрывает дни задним числом по одному складу (бэкфилл для ускорения отчётов).'

    def add_arguments(self, parser):
        parser.add_argument('--schema', required=True, help='Схема тенанта, например polisem')
        parser.add_argument('--warehouse', required=True, type=int, help='ID склада')
        parser.add_argument('--user', required=True, help='username пользователя, от чьего имени закрывать (closed_by в AuditLog)')
        parser.add_argument('--up-to', type=str, default=None, help='Последняя закрываемая дата YYYY-MM-DD (по умолчанию — вчера)')
        parser.add_argument('--note', type=str, default='Автоматическое закрытие (бэкфилл истории)')
        parser.add_argument('--dry-run', action='store_true', help='Только посчитать количество дней, ничего не писать')

    def handle(self, *args, **options):
        schema = options['schema']
        warehouse_id = options['warehouse']
        username = options['user']
        note = options['note']
        dry_run = options['dry_run']
        up_to = (
            datetime.date.fromisoformat(options['up_to']) if options['up_to']
            else datetime.date.today() - datetime.timedelta(days=1)
        )

        with schema_context(schema):
            from users.models import User

            try:
                warehouse = Warehouse.objects.get(pk=warehouse_id)
            except Warehouse.DoesNotExist:
                raise CommandError(f'Склад #{warehouse_id} не найден в схеме {schema}')

            try:
                user = User.objects.get(username=username)
            except User.DoesNotExist:
                raise CommandError(f'Пользователь "{username}" не найден в схеме {schema}')

            last_closed = ClosedPeriod.objects.filter(warehouse=warehouse).order_by('-date').first()
            if last_closed:
                start_date = last_closed.date + datetime.timedelta(days=1)
            else:
                start_date = (
                    Document.objects
                    .filter(status='posted')
                    .filter(Q(warehouse_id=warehouse_id) | Q(warehouse_to_id=warehouse_id))
                    .order_by('date')
                    .values_list('date', flat=True)
                    .first()
                )
                if start_date is None:
                    self.stdout.write(self.style.WARNING(f'По складу «{warehouse.name}» нет проведённых документов — закрывать нечего.'))
                    return

            if start_date > up_to:
                self.stdout.write(self.style.WARNING(f'Склад «{warehouse.name}» уже закрыт по {last_closed.date if last_closed else "—"} — закрывать дальше нечего (до {up_to}).'))
                return

            total_days = (up_to - start_date).days + 1
            self.stdout.write(f'Склад «{warehouse.name}»: закрываем {start_date} … {up_to} ({total_days} дн.)')

            if dry_run:
                self.stdout.write(self.style.SUCCESS(f'[dry-run] Ничего не записано, дней к закрытию: {total_days}'))
                return

            content_type = ContentType.objects.get_for_model(ClosedPeriod)
            date = start_date
            closed_count = 0
            while date <= up_to:
                next_date = date + datetime.timedelta(days=1)

                instance = ClosedPeriod.objects.create(
                    date=date, warehouse=warehouse, branch=None,
                    closed_by=user, note=note,
                )
                AuditLog.objects.create(
                    content_type=content_type, object_id=instance.pk,
                    object_repr=str(instance)[:255], action=AuditLog.Action.CREATE,
                    user=user, ip_address=None,
                    changed_data={
                        'период': {'before': 'Открыт', 'after': f'Закрыт ({date.strftime("%d.%m.%Y")})'},
                        'склад': warehouse.name,
                        'примечание': note,
                    },
                )

                stale_docs = Document.objects.filter(
                    status=Document.Status.DRAFT, date__lte=date,
                ).filter(Q(warehouse=warehouse) | Q(warehouse_to=warehouse))
                for doc in stale_docs:
                    old_date = doc.date
                    doc.date = next_date
                    doc.save(update_fields=['date'])
                    AuditLog.objects.create(
                        content_type=ContentType.objects.get_for_model(doc), object_id=doc.pk,
                        object_repr=str(doc)[:255], action=AuditLog.Action.UPDATE,
                        user=user, ip_address=None,
                        changed_data={'date': {'before': str(old_date), 'after': str(next_date)}, 'reason': f'Закрытие дня склада «{warehouse.name}» (бэкфилл)'},
                    )

                stale_entries = JournalEntry.objects.filter(
                    status=JournalEntry.Status.DRAFT, warehouse=warehouse, date__date__lte=date,
                )
                for entry in stale_entries:
                    old_date = entry.date
                    entry.date = next_date
                    entry.save(update_fields=['date'])
                    AuditLog.objects.create(
                        content_type=ContentType.objects.get_for_model(entry), object_id=entry.pk,
                        object_repr=str(entry)[:255], action=AuditLog.Action.UPDATE,
                        user=user, ip_address=None,
                        changed_data={'date': {'before': str(old_date), 'after': str(next_date)}, 'reason': f'Закрытие дня склада «{warehouse.name}» (бэкфилл)'},
                    )

                create_snapshot_for_closing(warehouse, date)

                closed_count += 1
                if closed_count % 30 == 0:
                    self.stdout.write(f'  … закрыто {closed_count}/{total_days} ({date})')

                date = next_date

            self.stdout.write(self.style.SUCCESS(f'Готово: закрыто {closed_count} дн. по складу «{warehouse.name}», последняя закрытая дата {up_to}.'))
