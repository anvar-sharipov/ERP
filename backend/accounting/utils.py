# accounting/utils.py
import datetime
from django.core.exceptions import ValidationError
from .models import ClosedPeriod, JournalEntry
from django.utils.timezone import now



def check_period_open(date):
    """
    Принимает date (datetime, date или str).
    Бросает ValidationError если день закрыт.
    """
    if isinstance(date, datetime.datetime):
        date = date.date()
    elif isinstance(date, str):
        date = datetime.date.fromisoformat(date[:10])

    if ClosedPeriod.objects.filter(date=date).exists():
        raise ValidationError(
            f"Период {date.strftime('%d.%m.%Y')} закрыт — операции запрещены."
        )
        
        
def generate_journal_number():
    year = now().year

    last_entry = (
        JournalEntry.objects
        .filter(date__year=year)
        .order_by("-id")
        .first()
    )

    if not last_entry or not last_entry.number:
        seq = 1
    else:
        try:
            seq = int(last_entry.number.split("-")[-1]) + 1
        except:
            seq = 1

    return f"JV-{year}-{str(seq).zfill(6)}"