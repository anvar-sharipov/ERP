from rest_framework import mixins, viewsets
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import OrderingFilter

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

class AuditLogViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = AuditLogSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_class = AuditLogFilter
    ordering_fields = ["timestamp"]
    ordering = ["-timestamp"]

    def get_permissions(self):
        return _rbac(self.action, "auditlog")

    def get_queryset(self):
        return (
            AuditLog.objects
            .select_related("user", "content_type")
            .all()
        )