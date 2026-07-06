# accounting/mixins.py
from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from rest_framework.decorators import action
from rest_framework.response import Response
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


class BulkDestroyMixin:
    """
    Массовое удаление — DELETE /<resource>/bulk-destroy/ с телом {"ids": [1,2,3]}
    (см. Table.tsx: чекбоксы + кнопка "Удалить выбранные").

    ✅ Обязательно вызывает self.perform_destroy(instance) ПООЧЕРЁДНО для каждой
    записи — если ViewSet подключает AuditMixin, каждое удаление аудируется
    отдельно (тот же perform_destroy, что и при одиночном DELETE), а не одним
    queryset.filter(...).delete(), который обошёл бы аудит целиком (см. CLAUDE.md:
    QuerySet.update()/bulk-операции не проходят через AuditMixin — сюда это тоже
    относится, поэтому bulk_destroy НЕ должен звать queryset.delete() напрямую).

    Каждая запись удаляется в своей транзакции — если один объект не удалился
    (например защищён PROTECT-связью), остальные всё равно удаляются, а причина
    возвращается в errors.

    RBAC: см. users/permissions.py::_rbac — 'bulk_destroy' замаплен на DELETE,
    так что право требуется то же самое, что и на обычное удаление.
    Scope: self.get_queryset() уже содержит apply_scope(...) конкретного ViewSet'а,
    поэтому массово удалить чужую (вне scope) запись через bulk-destroy нельзя —
    filter(pk__in=ids) применяется поверх уже отфильтрованного queryset.
    """

    @action(detail=False, methods=['delete'], url_path='bulk-destroy')
    def bulk_destroy(self, request):
        ids = request.data.get('ids')
        if not ids or not isinstance(ids, list):
            return Response({'detail': 'Укажите ids — непустой список идентификаторов.'}, status=400)

        qs = self.filter_queryset(self.get_queryset()).filter(pk__in=ids)
        found_ids = set(qs.values_list('pk', flat=True))
        missing_ids = [i for i in ids if i not in found_ids]

        deleted_ids = []
        errors = []
        for instance in qs:
            pk = instance.pk
            try:
                with transaction.atomic():
                    self.perform_destroy(instance)
                deleted_ids.append(pk)
            except Exception as e:
                errors.append({'id': pk, 'detail': str(e)})

        return Response({
            'deleted_ids': deleted_ids,
            'errors': errors,
            'missing_ids': missing_ids,
        }, status=200)