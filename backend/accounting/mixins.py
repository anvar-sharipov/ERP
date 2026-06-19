# accounting/mixins.py
from django.contrib.contenttypes.models import ContentType
from .models import AuditLog


class AuditMixin:
    """
    Подключи к любому ViewSet — аудит пишется автоматически.

    class ProductViewSet(AuditMixin, ModelViewSet):
        ...
    """
    audit_fields_exclude = ['updated_at', 'created_at']

    def _get_ip(self, request):
        x_forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded:
            return x_forwarded.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR')

    def _snapshot(self, instance):
        """Снапшот полей объекта для сравнения."""
        from django.forms.models import model_to_dict
        data = model_to_dict(instance)
        for f in self.audit_fields_exclude:
            data.pop(f, None)
        # Преобразуем всё в строки для единообразия
        return {k: str(v) for k, v in data.items()}

    def _write_log(self, request, instance, action, changed_data=None):
        ct = ContentType.objects.get_for_model(instance)
        AuditLog.objects.create(
            content_type=ct,
            object_id=instance.pk,
            object_repr=str(instance)[:255],
            action=action,
            user=request.user if request.user.is_authenticated else None,
            ip_address=self._get_ip(request),
            changed_data=changed_data or {},
        )

    def perform_create(self, serializer):
        instance = serializer.save()
        self._write_log(self.request, instance, AuditLog.Action.CREATE)

    def perform_update(self, serializer):
        old = self._snapshot(serializer.instance)
        instance = serializer.save()
        new = self._snapshot(instance)
        # Пишем только изменившиеся поля
        diff = {
            k: [old.get(k), new.get(k)]
            for k in set(old) | set(new)
            if old.get(k) != new.get(k)
        }
        self._write_log(self.request, instance, AuditLog.Action.UPDATE, diff)

    def perform_destroy(self, instance):
        self._write_log(self.request, instance, AuditLog.Action.DELETE,
                        self._snapshot(instance))
        instance.delete()