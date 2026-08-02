# backend/accounting/views/price_change_history_views.py
from django.db.models import Q
from rest_framework import mixins, viewsets

from accounting.models.price_change_history import PriceChangeHistory
from accounting.models.stock import Warehouse
from accounting.serializers.price_change_history_serializers import PriceChangeHistorySerializer
from accounting.views.report_views import _resolve_warehouse_ids
from users.permissions import _rbac

PRICE_HISTORY_ORDERING_FIELDS = {
    "date": ["date"],
    "product_name": ["product__name"],
    "price_type_name": ["price_type__name"],
    "warehouse_name": ["warehouse__name"],
    "branch_name": ["branch__name"],
    "old_price": ["old_price"],
    "new_price": ["new_price"],
    "quantity_at_change": ["quantity_at_change"],
    "old_sum": ["old_sum"],
    "new_sum": ["new_sum"],
    "diff_amount": ["diff_amount"],
}


class PriceChangeHistoryViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    Отчёт "История изменения цен" — только чтение. Строки создаются исключительно
    системно (см. accounting/utils.py::record_price_change), из
    ProductPriceViewSet.perform_update (каталожные цены) и
    Document._update_product_cost_prices (себестоимость) — здесь нет
    create/update/destroy намеренно.
    """
    serializer_class = PriceChangeHistorySerializer

    def get_permissions(self):
        return _rbac(self.action, 'pricechangehistory')

    def get_queryset(self):
        qs = (
            PriceChangeHistory.objects
            .select_related('product', 'product__unit', 'price_type', 'warehouse', 'branch', 'document', 'created_by')
            .all()
        )

        # ✅ Scope по филиалу/складу (WorkDateWidget + RBAC UserScope) — строки без
        # склада/филиала (себестоимость, глобальные цены) считаются относящимися
        # ко всей компании и видны всем, кто вообще имеет доступ к отчёту; строки
        # с конкретным складом/филиалом — только если он входит в пересечение
        # выбора и scope пользователя. Один OR покрывает все случаи разом:
        # при пустом scope и отсутствии ?warehouse=/?branch= _resolve_warehouse_ids
        # возвращает ВСЕ склады, так что фильтр не сужает ничего.
        accessible_warehouse_ids = _resolve_warehouse_ids(self.request)
        accessible_branch_ids = set(
            Warehouse.objects.filter(id__in=accessible_warehouse_ids).values_list('branch_id', flat=True)
        )
        qs = qs.filter(
            Q(warehouse_id__in=accessible_warehouse_ids)
            | Q(warehouse__isnull=True, branch_id__in=accessible_branch_ids)
            | Q(warehouse__isnull=True, branch__isnull=True)
        )

        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)

        price_type_param = self.request.query_params.get('price_type')
        if price_type_param == 'cost_price':
            qs = qs.filter(price_type__isnull=True)
        elif price_type_param:
            qs = qs.filter(price_type_id=price_type_param)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(Q(product__name__icontains=search) | Q(product__sku__icontains=search))

        ordering_param = self.request.query_params.get('ordering')
        if ordering_param:
            desc = ordering_param.startswith('-')
            key = ordering_param[1:] if desc else ordering_param
            fields = PRICE_HISTORY_ORDERING_FIELDS.get(key)
            if fields:
                return qs.order_by(*[f"-{f}" if desc else f for f in fields])

        return qs.order_by('-date', '-id')
