# accounting/tasks.py
"""
Фоновые задачи Celery для приложения accounting. Celery сам находит этот файл
через app.autodiscover_tasks() (см. config/celery.py) — регистрировать задачи
где-то ещё дополнительно не нужно.

Периодичность запуска (расписание) настраивается через django-celery-beat
(модель PeriodicTask в public-схеме) — см. bootstrap_daily_checks_schedule.py
management-команду, которая создаёт запись расписания один раз.
"""
from decimal import Decimal

from celery import shared_task
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from django_tenants.utils import get_tenant_model, schema_context

from .warehouse_snapshot import compute_balances


def _resolve_alert(model_cls, alert_type, ct, object_id, is_problem, level, title, message, extra_data):
    """
    Общая дедупликация для любого типа алерта: если проблема есть — создать
    (если её ещё не было открытой) или обновить текст (если уже была); если
    проблемы больше нет — автоматически закрыть существующую запись (см.
    обсуждение: "если условие уже не выполняется — resolved автоматически").
    """
    existing = model_cls.objects.filter(
        type=alert_type, content_type=ct, object_id=object_id, is_resolved=False,
    ).first()

    if is_problem:
        if existing:
            existing.message = message
            existing.extra_data = extra_data
            existing.save(update_fields=['message', 'extra_data', 'updated_at'])
        else:
            model_cls.objects.create(
                type=alert_type, level=level, title=title, message=message,
                content_type=ct, object_id=object_id, extra_data=extra_data,
            )
    elif existing:
        existing.is_resolved = True
        existing.resolved_at = timezone.now()
        existing.save(update_fields=['is_resolved', 'resolved_at', 'updated_at'])


def _check_warehouse_snapshots():
    """
    Сверяет последний снапшот каждого склада (WarehouseProductSnapshot) с
    "контрольным" полным пересчётом остатка по проводкам на ту же дату —
    если где-то разошлось (например снапшот считался инкрементально и
    накопил ошибку, или кто-то напрямую поправил проводки в обход правильного
    пути) — заводит SystemAlert.
    """
    from .models import Warehouse, WarehouseProductSnapshot, SystemAlert

    ct = ContentType.objects.get_for_model(Warehouse)
    for warehouse in Warehouse.objects.all():
        last_date = (
            WarehouseProductSnapshot.objects
            .filter(warehouse=warehouse)
            .order_by('-date')
            .values_list('date', flat=True)
            .first()
        )
        if not last_date:
            continue  # склад ни разу не закрывали — сверять пока нечего

        fresh = compute_balances(warehouse.id, last_date)  # полный скан с нуля — контрольная сверка
        stored = {
            r.product_id: {'qty': r.quantity, 'value': r.value}
            for r in WarehouseProductSnapshot.objects.filter(warehouse=warehouse, date=last_date)
        }

        mismatches = []
        for pid in set(fresh) | set(stored):
            f = fresh.get(pid, {'qty': Decimal('0'), 'value': Decimal('0')})
            s = stored.get(pid, {'qty': Decimal('0'), 'value': Decimal('0')})
            # ✅ Сравниваем округлённо — снапшот хранится с округлением до 2
            # знаков (см. models/stock.py::WarehouseProductSnapshot.value), а
            # сырой скан может отличаться на доли копейки/грамма — это не
            # реальное расхождение, см. обсуждение при первой проверке.
            if round(f['qty'], 3) != round(s['qty'], 3) or round(f['value'], 2) != round(s['value'], 2):
                mismatches.append({
                    'product_id': pid,
                    'fresh_qty': str(f['qty']), 'stored_qty': str(s['qty']),
                    'fresh_value': str(f['value']), 'stored_value': str(s['value']),
                })

        title = f"Расхождение снапшота: {warehouse.name}"
        message = (
            f"Снапшот склада «{warehouse.name}» на {last_date.strftime('%d.%m.%Y')} "
            f"разошёлся с проводками по {len(mismatches)} товар(ам)."
        )
        _resolve_alert(
            SystemAlert, SystemAlert.Type.SNAPSHOT_MISMATCH, ct, warehouse.id,
            is_problem=bool(mismatches),
            level=SystemAlert.Level.CRITICAL, title=title, message=message,
            extra_data={'date': str(last_date), 'mismatches': mismatches[:50]},
        )


def _check_low_stock():
    """
    Остаток товара НА КАЖДОМ СКЛАДЕ отдельно ниже Product.min_stock_level
    ("Мин. остаток для заказа") — заводит SystemAlert для каждой пары
    склад+товар, где не хватает, даже если суммарно по компании товара
    достаточно (дефицит на конкретном складе всё равно требует дозаказа
    именно туда — реальный кейс: Z-40 Adapter d.63, 7 шт. на одном складе
    при min_stock=11, но 141 шт. суммарно по всем складам).

    ✅ Проверяются ТОЛЬКО склады, где у товара УЖЕ есть строка WarehouseStock
    (т.е. товар там хоть раз появлялся — приход/продажа/перемещение; строки
    WarehouseStock никогда не удаляются, см. models/stock.py, значит наличие
    строки = "здесь товар когда-то был", независимо от текущего количества).
    Сознательно НЕ проверяем склад+товар, если товара там никогда не было —
    иначе для товаров, заведённых не на всех складах (обычная ситуация при
    специализации складов по ассортименту), сыпется огромный шум "0 < min_stock"
    по складам, которые этот товар вообще не должны держать (проверено на
    реальных тестовых данных: полный перебор склад×товар дал 4226 алертов
    вместо ожидаемых — решили вернуться к варианту "только там, где товар был").
    """
    from .models import WarehouseStock, SystemAlert

    ct = ContentType.objects.get_for_model(WarehouseStock)

    # ✅ Тут НЕ фильтруем по product__is_active=True — иначе товар, у которого
    # уже открыт алерт, а потом стал неактивным, вообще выпадает из перебора
    # и его алерт никогда не перепроверяется/не закрывается (_resolve_alert
    # закрывает алерт только когда сама проверка ЗАХОДИТ на этот товар и видит
    # is_problem=False — реальный баг: Z-90 остался в уведомлениях навсегда
    # после деактивации). Вместо этого is_active проверяем прямо в is_low.
    stocks = (
        WarehouseStock.objects
        .filter(product__min_stock_level__gt=0)
        .select_related('product', 'warehouse')
        .iterator(chunk_size=500)
    )

    for stock in stocks:
        is_low = stock.product.is_active and stock.quantity < stock.product.min_stock_level

        title = f"Мало товара: {stock.product.name}"
        message = (
            f"Остаток товара «{stock.product.name}» на складе «{stock.warehouse.name}» — "
            f"{stock.quantity}, ниже минимального ({stock.product.min_stock_level})."
        )
        _resolve_alert(
            SystemAlert, SystemAlert.Type.LOW_STOCK, ct, stock.id,
            is_problem=is_low,
            level=SystemAlert.Level.WARNING, title=title, message=message,
            extra_data={
                'product_id': stock.product_id,
                'warehouse_id': stock.warehouse_id,
                'warehouse': stock.warehouse.name,
                'current_qty': str(stock.quantity),
                'min_stock_level': stock.product.min_stock_level,
            },
        )


@shared_task(name='accounting.run_daily_checks')
def run_daily_checks(schema_name=None):
    """
    Ежедневная фоновая проверка по всем tenant-схемам (или одной, если передан
    schema_name — удобно для ручного запуска/теста): 1) снапшот остатков
    совпадает с проводками, 2) остаток товара не ниже min_stock_level.
    Расписание — см. django-celery-beat (PeriodicTask), настраивается через
    bootstrap_daily_checks_schedule.py один раз.
    """
    TenantModel = get_tenant_model()
    tenants = (
        TenantModel.objects.filter(schema_name=schema_name)
        if schema_name else
        TenantModel.objects.exclude(schema_name='public')
    )

    for tenant in tenants:
        with schema_context(tenant.schema_name):
            _check_warehouse_snapshots()
            _check_low_stock()
