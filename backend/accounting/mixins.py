# accounting/mixins.py
from django.contrib.contenttypes.models import ContentType
from .models import AuditLog


class AuditMixin:
    audit_fields_exclude = ['updated_at', 'created_at']

    def _get_ip(self, request):
        x_forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded:
            return x_forwarded.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR')

    def _snapshot(self, instance):
        data = {}
        for field in instance._meta.concrete_fields:
            if field.name in self.audit_fields_exclude:
                continue
            data[field.name] = str(getattr(instance, field.name, ''))
        return data

    def _write_log(self, request, instance, action, changed_data=None):
        AuditLog.objects.create(
            content_type=ContentType.objects.get_for_model(instance),
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
        diff = {
            k: {'before': old.get(k), 'after': new.get(k)}
            for k in set(old) | set(new)
            if old.get(k) != new.get(k)
        }
        self._write_log(self.request, instance, AuditLog.Action.UPDATE, diff)

    def perform_destroy(self, instance):
        self._write_log(self.request, instance, AuditLog.Action.DELETE,
                        {'snapshot': self._snapshot(instance)})
        instance.delete()