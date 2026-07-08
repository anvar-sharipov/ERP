# accounting/warehouse_snapshot.py
"""
Снапшот остатков склада на конец закрытого дня — см. WarehouseProductSnapshot
(models/stock.py). Общая логика "остаток товара на складе на дату" вынесена
сюда одним местом, чтобы report_views.py::product_turnover и создание снапшота
при закрытии дня (ClosedPeriodViewSet.perform_create) использовали ровно одну
и ту же бухгалтерскую логику (в/возврат прихода — плюс по факт. цене; расход —
минус по цене после скидки; возврат расхода — минус по полной цене; перемещение
— минус на складе-источнике, плюс на складе-назначении), а не две разошедшиеся
копии.
"""
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.db.models import Q

from .models import DocumentItem, WarehouseProductSnapshot

TURNOVER_TYPES = ['in', 'out', 'move', 'return_in', 'return_out']


def compute_balances(warehouse_id, as_of_date, since_date=None, base_balances=None):
    """
    {product_id: {'qty': Decimal, 'value': Decimal}} — остаток на конец as_of_date
    для склада warehouse_id.

    since_date=None → считает с нуля по всей истории документов до as_of_date
    включительно (полный скан — используется только когда для склада ещё нет ни
    одного снапшота, т.е. один раз на складе, при самом первом закрытии).

    since_date задан → берёт base_balances как стартовую точку и добавляет
    только движения от since_date до as_of_date включительно (используется для
    досчёта поверх предыдущего снапшота — узкое окно, а не вся история).
    """
    balances = defaultdict(lambda: {'qty': Decimal('0'), 'value': Decimal('0')})
    if base_balances:
        for pid, bal in base_balances.items():
            balances[pid]['qty'] = bal['qty']
            balances[pid]['value'] = bal['value']

    items_qs = (
        DocumentItem.objects
        .filter(
            document__status='posted',
            document__document_type__in=TURNOVER_TYPES,
            document__date__lte=as_of_date,
        )
        .filter(Q(document__warehouse_id=warehouse_id) | Q(document__warehouse_to_id=warehouse_id))
        .select_related('document')
    )
    if since_date:
        items_qs = items_qs.filter(document__date__gte=since_date)

    for item in items_qs.iterator(chunk_size=500):
        doc = item.document
        qty = item.quantity
        gross = qty * item.price
        cost_value = qty * item.cost_price
        pid = item.product_id

        # ✅ БАГ (см. обсуждение с пользователем: Z-40 qty=7 верно, сумма=-48.79):
        # для 'in'/'return_out' item.price — это ЦЕНА ЗАКУПКИ, она же себестоимость
        # на момент документа, поэтому gross (price×qty) корректно отражает
        # балансовую стоимость запаса. Но для 'out'/'return_in' item.price — это
        # ЦЕНА ПРОДАЖИ (обычно выше себестоимости) — списывать остаток по ней
        # неверно, накопленная ошибка уводит стоимость в минус при активных
        # продажах с наценкой. Нужно списывать/возвращать по item.cost_price
        # (себестоимость, зафиксированная на момент документа) — та же логика,
        # что уже используется в проводке (Document._generate_out_posting).
        if doc.document_type == 'in' and doc.warehouse_id == warehouse_id:
            balances[pid]['qty'] += qty
            balances[pid]['value'] += gross
        elif doc.document_type == 'return_out' and doc.warehouse_id == warehouse_id:
            balances[pid]['qty'] -= qty
            balances[pid]['value'] -= gross
        elif doc.document_type == 'out' and doc.warehouse_id == warehouse_id:
            balances[pid]['qty'] -= qty
            balances[pid]['value'] -= cost_value
        elif doc.document_type == 'return_in' and doc.warehouse_id == warehouse_id:
            balances[pid]['qty'] += qty
            balances[pid]['value'] += cost_value
        elif doc.document_type == 'move':
            if doc.warehouse_id == warehouse_id:
                balances[pid]['qty'] -= qty
                balances[pid]['value'] -= gross
            if doc.warehouse_to_id == warehouse_id:
                balances[pid]['qty'] += qty
                balances[pid]['value'] += gross

    return dict(balances)


def create_snapshot_for_closing(warehouse, date):
    """
    Создать/пересоздать WarehouseProductSnapshot для (warehouse, date) при
    закрытии дня. Благодаря жёсткому последовательному правилу закрытия (см.
    ClosedPeriodViewSet.perform_create — разрешена только дата "последний
    закрытый + 1") предыдущий снапшот, если он есть, всегда ровно на date - 1 —
    значит досчитывать нужно только движения ЗА САМ date, а не всю историю
    заново каждый раз.
    """
    prev_date = date - timedelta(days=1)
    prev_rows = WarehouseProductSnapshot.objects.filter(warehouse=warehouse, date=prev_date)

    if prev_rows.exists():
        base_balances = {r.product_id: {'qty': r.quantity, 'value': r.value} for r in prev_rows}
        balances = compute_balances(warehouse.id, date, since_date=date, base_balances=base_balances)
    else:
        # Первое закрытие для этого склада — снапшотов ещё не было, считаем
        # с нуля по всей истории (разовая стоимость, дальше только инкремент).
        balances = compute_balances(warehouse.id, date)

    WarehouseProductSnapshot.objects.filter(warehouse=warehouse, date=date).delete()
    WarehouseProductSnapshot.objects.bulk_create([
        WarehouseProductSnapshot(warehouse=warehouse, product_id=pid, date=date, quantity=bal['qty'], value=bal['value'])
        for pid, bal in balances.items()
    ])
