from rest_framework import mixins, viewsets
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend

from accounting.models.audit import AuditLog
from accounting.serializers.audit_serializers import AuditLogSerializer
from users.permissions import _rbac




from accounting.filter.audit_filter import AuditLogFilter


# class AuditLogViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):

#     def get_permissions(self):
#         return _rbac(self.action, 'auditlog')

#     # filter_backends = [DjangoFilterBackend, OrderingFilter]
#     # filterset_fields = ['action', 'user']
#     # ordering_fields  = ['timestamp']
#     # ordering         = ['-timestamp']

#     def get_queryset(self):
#         return AuditLog.objects.select_related('user', 'content_type').all()

#     def get_serializer_class(self):
#         return AuditLogSerializer

# ✅ Сортировка при клике на колонку в AuditLogPage.tsx (server-side пагинация) —
# ключи совпадают 1:1 с accessor колонок там. user_display/action_display/model_name
# — вычисляемые поля сериализатора, поэтому не могут ходить через стандартный
# DRF OrderingFilter (он умеет валидировать только реальные имена полей ORM,
# а не переименовывать) — сортируем вручную в get_queryset() ниже, по тем же
# join-путям, из которых эти вычисляемые поля берутся.
AUDIT_LOG_ORDERING_FIELDS = {
    "timestamp": ["timestamp"],
    "user_display": ["user__last_name", "user__first_name", "user__username"],
    "action_display": ["action"],
    "model_name": ["content_type__model"],
    "object_repr": ["object_repr"],
    "ip_address": ["ip_address"],
}


class AuditLogViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = AuditLogSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_class = AuditLogFilter

    def get_permissions(self):
        return _rbac(self.action, "auditlog")

    def get_queryset(self):
        qs = (
            AuditLog.objects
            .select_related("user", "content_type")
            .all()
        )

        ordering_param = self.request.query_params.get("ordering")
        if ordering_param:
            desc = ordering_param.startswith("-")
            key = ordering_param[1:] if desc else ordering_param
            fields = AUDIT_LOG_ORDERING_FIELDS.get(key)
            if fields:
                return qs.order_by(*[f"-{f}" if desc else f for f in fields])

        return qs.order_by("-timestamp")