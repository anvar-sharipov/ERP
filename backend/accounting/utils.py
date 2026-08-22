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


def is_period_closed(date, branch_id=None, warehouse_id=None) -> bool:
    """
    Булева обёртка над check_period_open — для мест, которым нужно просто узнать
    "закрыт ли период" (например disabled-состояние кнопок Изменить/Удалить в
    JournalPage.tsx), а не среагировать на исключение. Намеренно переиспользует
    ту же проверку целиком (включая последовательное правило "последний закрытый
    день склада + 1" ниже), а не только явные записи ClosedPeriod — иначе эти два
    места могли бы разойтись в том, что считается "закрытым днём".
    """
    try:
        check_period_open(date, branch_id=branch_id, warehouse_id=warehouse_id)
    except ValidationError:
        return True
    return False


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
        
def check_stock_availability(warehouse_id, product, quantity, exclude_document_id=None):
    """
    Запрещает сохранять/проводить строку документа, если запрошенное
    количество превышает физический остаток на складе за вычетом того, что уже
    "занято" ДРУГИМИ непроведёнными документами того же рода (Расход/Возврат
    поставщику/Перемещение — все три списывают товар со склада-источника при
    проведении, см. Document._stock_direction) на этом же складе. exclude_document_id
    исключает из подсчёта резерва сам документ, чья строка сейчас проверяется —
    иначе документ конкурировал бы сам с собой за собственный резерв.

    ✅ "Резерв" считается ЖИВЫМ запросом по черновикам (тот же принцип, что и в
    product_views.py::stocks_map/report_views.py::stock_balance) — НЕ через
    WarehouseStock.reserved_quantity, это поле нигде в коде не пишется и всегда
    равно 0 (см. комментарий в product_views.py::stocks_map).
    """
    from decimal import Decimal
    from django.db.models import Sum
    from accounting.models import WarehouseStock, DocumentItem

    if not warehouse_id:
        return

    stock_qty = (
        WarehouseStock.objects
        .filter(warehouse_id=warehouse_id, product_id=product.id)
        .values_list('quantity', flat=True)
        .first()
    ) or Decimal('0')

    reserved_qs = DocumentItem.objects.filter(
        document__status='draft',
        document__document_type__in=['out', 'return_out', 'move'],
        document__warehouse_id=warehouse_id,
        product_id=product.id,
    )
    if exclude_document_id:
        reserved_qs = reserved_qs.exclude(document_id=exclude_document_id)
    reserved = reserved_qs.aggregate(s=Sum('quantity'))['s'] or Decimal('0')

    available = stock_qty - reserved
    if available < quantity:
        raise ValidationError(
            f"Недостаточно товара «{product}» на складе. Остаток: {stock_qty}, "
            f"занято другими черновиками (Расход/Возврат поставщику/Перемещение): {reserved}, "
            f"доступно: {available}, запрошено: {quantity}."
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


def resolve_price_scope_quantity(product_id, warehouse_id=None, branch_id=None):
    """
    Остаток товара в охвате цены — используется отчётом "История изменения цен"
    (PriceChangeHistory): указан склад — остаток по нему; указан только филиал —
    сумма по складам филиала; ничего не указано (глобальная цена/себестоимость) —
    сумма по всем складам компании. Возвращает (quantity, resolved_branch_id) —
    resolved_branch_id пробрасывается на склад, если он был передан, иначе как есть.
    """
    from decimal import Decimal
    from django.db.models import Sum
    from .models import WarehouseStock, Warehouse

    if warehouse_id:
        qty = (
            WarehouseStock.objects
            .filter(warehouse_id=warehouse_id, product_id=product_id)
            .aggregate(total=Sum('quantity'))['total']
        ) or Decimal('0')
        wh = Warehouse.objects.filter(pk=warehouse_id).only('branch_id').first()
        return qty, wh.branch_id if wh else None

    if branch_id:
        qty = (
            WarehouseStock.objects
            .filter(warehouse__branch_id=branch_id, product_id=product_id)
            .aggregate(total=Sum('quantity'))['total']
        ) or Decimal('0')
        return qty, branch_id

    qty = (
        WarehouseStock.objects
        .filter(product_id=product_id)
        .aggregate(total=Sum('quantity'))['total']
    ) or Decimal('0')
    return qty, None


def record_price_change(
    *, product_id, old_price, new_price, quantity,
    price_type_id=None, product_price=None, warehouse_id=None, branch_id=None,
    document=None, user=None, date=None,
):
    """
    Пишет одну строку в PriceChangeHistory (отчёт "История изменения цен") —
    единая точка для ЛЮБОГО типа цены: ProductPrice (см. ProductPriceViewSet.
    perform_update) и себестоимости (см. Document._update_product_cost_prices).
    Ничего не делает, если цена фактически не изменилась.
    """
    from decimal import Decimal
    from django.utils import timezone
    from .models import PriceChangeHistory

    if old_price == new_price:
        return None

    old_sum = (quantity * old_price).quantize(Decimal('0.01'))
    new_sum = (quantity * new_price).quantize(Decimal('0.01'))

    return PriceChangeHistory.objects.create(
        product_id=product_id,
        price_type_id=price_type_id,
        product_price=product_price,
        warehouse_id=warehouse_id,
        branch_id=branch_id,
        document=document,
        date=date or timezone.now().date(),
        old_price=old_price,
        new_price=new_price,
        quantity_at_change=quantity,
        old_sum=old_sum,
        new_sum=new_sum,
        diff_amount=new_sum - old_sum,
        created_by=user if user and getattr(user, 'is_authenticated', False) else None,
    )
