# accounting/models/audit.py
from django.contrib.contenttypes.models import ContentType
from django.contrib.postgres.indexes import GinIndex
from django.db import models


class AuditLog(models.Model):
    class Action(models.TextChoices):
        CREATE = 'create', 'Создание'
        UPDATE = 'update', 'Изменение'
        DELETE = 'delete', 'Удаление'
        POST = 'post', 'Проведение'
        UNPOST = 'unpost', 'Отмена проведения'

    content_type = models.ForeignKey(
        'contenttypes.ContentType',  # ✅ ПРАВИЛЬНАЯ ССЫЛКА
        on_delete=models.CASCADE
    )
    object_id = models.PositiveIntegerField()
    object_repr = models.CharField(max_length=255)
    action = models.CharField(max_length=10, choices=Action.choices, db_index=True)
    user = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='audit_logs'
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    changed_data = models.JSONField(default=dict, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-timestamp']
        verbose_name = "Запись аудита"
        verbose_name_plural = "Журнал аудита"
        # indexes = [
        #     models.Index(fields=['content_type', 'object_id']),
        #     models.Index(fields=['user', 'timestamp']),
        #     GinIndex(fields=['changed_data'], name='audit_changed_data_gin'),
        # ]
        indexes = [
            models.Index(fields=["timestamp"]),
            models.Index(fields=["user", "timestamp"]),
            models.Index(fields=["action", "timestamp"]),
            models.Index(fields=["content_type", "object_id"]),
        ]

    def __str__(self):
        return f"{self.get_action_display()} {self.object_repr} — {self.timestamp:%d.%m.%Y %H:%M}"