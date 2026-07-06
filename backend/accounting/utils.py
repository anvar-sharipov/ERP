# accounting/utils.py
import datetime
from django.core.exceptions import ValidationError
from .models import ClosedPeriod, JournalEntry
from django.utils.timezone import now

from accounting.models.audit import AuditLog
from django.contrib.contenttypes.models import ContentType



def get_last_closed_date(warehouse_id):
    """
    Последняя закрытая дата конкретного склада, либо None если по этому складу
    ещё ни разу не закрывали ни один день.
    """
    from accounting.models import ClosedPeriod

    if not warehouse_id:
        return None
    last = ClosedPeriod.objects.filter(warehouse_id=warehouse_id).order_by('-date').first()
    return last.date if last else None


def check_period_open(date, branch_id=None, warehouse_id=None):
    """
    Проверяет что период открыт для данной даты.
    Бросает ValidationError если день закрыт.
    """
    if isinstance(date, datetime.datetime):
        date = date.date()
    elif isinstance(date, str):
        date = datetime.date.fromisoformat(date[:10])

    from django.db.models import Q
    from accounting.models import ClosedPeriod, Warehouse

    # Глобальное закрытие — блокирует всех
    q = Q(date=date, branch__isnull=True, warehouse__isnull=True)

    if branch_id and warehouse_id:
        # Точное совпадение branch + warehouse
        q |= Q(date=date, branch_id=branch_id, warehouse_id=warehouse_id)

    if branch_id:
        # Весь филиал закрыт
        q |= Q(date=date, branch_id=branch_id, warehouse__isnull=True)

    if warehouse_id:
        # Конкретный склад закрыт
        q |= Q(date=date, warehouse_id=warehouse_id, branch__isnull=True)
        # Если филиал этого склада закрыт — тоже блокируем
        wh = Warehouse.objects.filter(pk=warehouse_id).first()
        if wh and wh.branch_id:
            q |= Q(date=date, branch_id=wh.branch_id, warehouse__isnull=True)

    if ClosedPeriod.objects.filter(q).exists():
        raise ValidationError(
            f"Операция запрещена: день {date.strftime('%d.%m.%Y')} закрыт — период закрыт для проведения операций."
        )

    # ✅ Жёсткое последовательное правило по складу (см. CLAUDE.md / обсуждение
    # с пользователем): операции разрешены ТОЛЬКО датой "последний закрытый день
    # склада + 1" — не раньше (нельзя задним числом) и не позже (нельзя наперёд).
    # Если по складу ещё ни разу не закрывали ни один день — разрешена любая дата.
    # Сообщение объясняет причину явно, а не просто "запрещено" — см. просьбу
    # пользователя про понятный UX.
    if warehouse_id:
        last_closed = get_last_closed_date(warehouse_id)
        if last_closed is not None:
            required_date = last_closed + datetime.timedelta(days=1)
            if date != required_date:
                wh = Warehouse.objects.filter(pk=warehouse_id).first()
                wh_name = wh.name if wh else f"#{warehouse_id}"
                raise ValidationError(
                    f"Операция запрещена: склад «{wh_name}» закрыт по {last_closed.strftime('%d.%m.%Y')} включительно. "
                    f"Разрешена только дата {required_date.strftime('%d.%m.%Y')} (день, следующий за последним закрытым). "
                    f"Вы указали {date.strftime('%d.%m.%Y')}."
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
    
    
def resolve_product_price(product_id, warehouse_id, price_type_id):
    """
    Резолвит актуальную цену товара для склада по цепочке приоритетов:
    warehouse -> branch (склада) -> global
    Возвращает ProductPrice или None.
    """
    from .models import ProductPrice, Warehouse

    warehouse = Warehouse.objects.select_related("branch").filter(pk=warehouse_id).first()
    branch_id = warehouse.branch_id if warehouse else None

    qs = ProductPrice.objects.filter(
        product_id=product_id,
        price_type_id=price_type_id,
        is_active=True,
    )

    # 1. цена конкретного склада
    price = qs.filter(warehouse_id=warehouse_id).first()
    if price:
        return price

    # 2. цена филиала (если склад принадлежит филиалу)
    if branch_id:
        price = qs.filter(warehouse__isnull=True, branch_id=branch_id).first()
        if price:
            return price

    # 3. глобальная цена
    price = qs.filter(warehouse__isnull=True, branch__isnull=True).first()
    return price
    
    