"""
Точечная коррекция бага 2026-08-09: migrate_polisem.py брал .date() от
timestamptz-полей источника (invoice_date/store_transaction.date) БЕЗ
перевода из UTC в местный часовой пояс (Asia/Ashgabat, UTC+5). В источнике
ВСЕ такие timestamptz хранятся как ровно 19:00:00 UTC (= полночь по
Ашхабаду) — т.е. 100% дат уходили на 1 календарный день РАНЬШЕ реальной.
Затронуты: Document.date, JournalEntry.date, StockMovement.date, Trip.date
(все переносятся из invoice_date/store_transaction.date). НЕ затронуты:
ClosedPeriod.date, ExchangeRate.date — в источнике это plain `date`,
без времени/часового пояса.

Т.к. смещение подтверждено СТРОГО равномерным (проверено: 100% строк
store_invoice/store_transaction имеют время ровно 19:00:00 UTC), фикс —
простой сдвиг уже перенесённых дат, без пере-матчинга по источнику:
  - Document.date (DateField)          -> +1 день
  - StockMovement.date (DateField)     -> +1 день
  - Trip.date (DateField)              -> +1 день
  - JournalEntry.date (DateTimeField)  -> +5 часов (19:00 UTC -> 00:00 UTC
    следующего дня — та же дата, что и у Document, в конвенции "дата
    документа = полночь UTC этой даты", см. document.py: date=self.date)

Запуск: python scripts/fix_polisem_timezone.py (внутри backend-контейнера).
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

import datetime

from django.db.models import F
from django_tenants.utils import schema_context

TENANT_SCHEMA = 'polisem'


def main():
    with schema_context(TENANT_SCHEMA):
        from accounting.models import Document, JournalEntry, StockMovement, Trip

        doc_qs = Document.objects.filter(number__startswith='POL-')
        je_qs = JournalEntry.objects.filter(number__startswith='POL-')
        sm_qs = StockMovement.objects.all()
        trip_qs = Trip.objects.all()

        print(f"Document(POL-*): {doc_qs.count()}")
        print(f"JournalEntry(POL-*): {je_qs.count()}")
        print(f"StockMovement(все, тенант только что полностью перенесён): {sm_qs.count()}")
        print(f"Trip(все, тенант только что полностью перенесён): {trip_qs.count()}")

        n = doc_qs.update(date=F('date') + datetime.timedelta(days=1))
        print(f"Document.date сдвинуто на +1 день: {n}")

        n = je_qs.update(date=F('date') + datetime.timedelta(hours=5))
        print(f"JournalEntry.date сдвинуто на +5 часов: {n}")

        n = sm_qs.update(date=F('date') + datetime.timedelta(days=1))
        print(f"StockMovement.date сдвинуто на +1 день: {n}")

        n = trip_qs.update(date=F('date') + datetime.timedelta(days=1))
        print(f"Trip.date сдвинуто на +1 день: {n}")


if __name__ == '__main__':
    main()
