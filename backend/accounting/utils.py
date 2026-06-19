# accounting/utils.py
import datetime
from django.core.exceptions import ValidationError
from .models import ClosedPeriod


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