# backend/accounting/views/revaluation_views.py
from django.db.models import Q
from rest_framework import mixins, viewsets

from accounting.models.revaluation import ProductRevaluation
from accounting.serializers.revaluation_serializers import ProductRevaluationSerializer
from accounting.views.report_views import _resolve_warehouse_ids
from users.permissions import _rbac

# ✅ Сортировка при клике на колонку (server-side пагинация, тот же паттерн, что
# и AUDIT_LOG_ORDERING_FIELDS в audit_views.py) — вычисляемые поля сериализатора
# (product_name/warehouse_name/...) сортируются вручную по реальным join-путям.
REVALUATION_ORDERING_FIELDS = {
    "date": ["date"],
    "product_name": ["product__name"],
    "warehouse_name": ["warehouse__name"],
    "branch_name": ["branch__name"],
    "quantity": ["quantity"],
    "old_cost_price": ["old_cost_price"],
    "new_cost_price": ["new_cost_price"],
    "diff_amount": ["diff_amount"],
    "document_number": ["document__number"],
}


class ProductRevaluationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    Отчёт "Переоценка товаров" — только чтение. Строки создаются исключительно
    системно из Document._update_product_cost_prices() при проведении "Прихода"
    (см. models/document.py) — здесь нет create/update/destroy намеренно.
    """
    serializer_class = ProductRevaluationSerializer

    def get_permissions(self):
        return _rbac(self.action, 'productrevaluation')

    def get_queryset(self):
        qs = (
            ProductRevaluation.objects
            .select_related('product', 'warehouse', 'branch', 'document', 'created_by')
            .all()
        )

        # ✅ Пересечение выбранного склада/филиала (WorkDateWidget) со scope
        # пользователя — тот же хелпер, что и в остальных отчётах (product_turnover,
        # ОСВ), см. CLAUDE.md: "все отчёты должны смотреть на branch/warehouse/period".
        warehouse_ids = _resolve_warehouse_ids(self.request)
        qs = qs.filter(warehouse_id__in=warehouse_ids)

        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(product__name__icontains=search)
                | Q(product__sku__icontains=search)
                | Q(document__number__icontains=search)
            )

        ordering_param = self.request.query_params.get('ordering')
        if ordering_param:
            desc = ordering_param.startswith('-')
            key = ordering_param[1:] if desc else ordering_param
            fields = REVALUATION_ORDERING_FIELDS.get(key)
            if fields:
                return qs.order_by(*[f"-{f}" if desc else f for f in fields])

        return qs.order_by('-date', '-id')
