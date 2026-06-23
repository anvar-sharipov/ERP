# accounting/utils.py
import datetime
from django.core.exceptions import ValidationError
from .models import ClosedPeriod, JournalEntry
from django.utils.timezone import now

from accounting.models.audit import AuditLog
from django.contrib.contenttypes.models import ContentType



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





def log_audit(request, instance, action: str, changed_data: dict = None):
    AuditLog.objects.create(
        content_type=ContentType.objects.get_for_model(instance),
        object_id=instance.pk,
        object_repr=str(instance),
        action=action,
        user=request.user if request and request.user.is_authenticated else None,
        ip_address=(
            request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
            or request.META.get('REMOTE_ADDR')
        ) if request else None,
        changed_data=changed_data or {},
    )