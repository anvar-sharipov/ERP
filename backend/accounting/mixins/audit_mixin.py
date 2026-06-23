from accounting.services.audit import log_action, get_changed_data


class AuditLogMixin:
    """
    Универсальный mixin для DRF ViewSet
    Автоматически логирует create/update/delete
    """

    audit_enabled = True
    audit_resource = None  # можно переопределить вручную

    def get_audit_resource(self):
        return self.audit_resource or self.queryset.model._meta.model_name

    # =========================
    # CREATE
    # =========================
    def perform_create(self, serializer):
        instance = serializer.save()

        if not self.audit_enabled:
            return instance

        log_action(
            user=self.request.user,
            instance=instance,
            action="create",
            request=self.request,
        )

        return instance

    # =========================
    # UPDATE
    # =========================
    def perform_update(self, serializer):
        old_instance = self.get_object()
        new_instance = serializer.save()

        if not self.audit_enabled:
            return new_instance

        changed_data = get_changed_data(old_instance, new_instance)

        log_action(
            user=self.request.user,
            instance=new_instance,
            action="update",
            changed_data=changed_data,
            request=self.request,
        )

        return new_instance

    # =========================
    # DELETE
    # =========================
    def perform_destroy(self, instance):
        if self.audit_enabled:
            log_action(
                user=self.request.user,
                instance=instance,
                action="delete",
                request=self.request,
            )

        instance.delete()