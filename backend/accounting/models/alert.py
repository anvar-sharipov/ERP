# accounting/models/alert.py
from django.db import models


class SystemAlert(models.Model):
    """
    Универсальная модель критических системных уведомлений — не только для
    расхождения снапшота остатков с проводками (см. tasks.py::check_warehouse_snapshots),
    но и для остальных типов (остаток товара ниже min_stock_level, и что
    появится в будущем) — один и тот же механизм для всех.

    Дедупликация: на пару (type, content_type, object_id) в любой момент
    существует максимум одна "открытая" (is_resolved=False) запись — ежедневная
    проверка (accounting/tasks.py) либо обновляет её текст, если проблема всё
    ещё актуальна, либо помечает resolved автоматически, если условие перестало
    выполняться (склад/товар выровнялись) — не плодит дубли на каждый день.
    """
    class Type(models.TextChoices):
        SNAPSHOT_MISMATCH = 'snapshot_mismatch', 'Расхождение снапшота с проводками'
        LOW_STOCK = 'low_stock', 'Остаток ниже минимального'

    class Level(models.TextChoices):
        WARNING = 'warning', 'Предупреждение'
        CRITICAL = 'critical', 'Критично'

    type = models.CharField(max_length=30, choices=Type.choices, db_index=True)
    level = models.CharField(max_length=10, choices=Level.choices, default=Level.WARNING)
    title = models.CharField(max_length=255)
    message = models.TextField()

    # ✅ Универсальная ссылка на объект, к которому относится алерт (склад,
    # товар и т.д.) — тот же паттерн, что и AuditLog.content_type/object_id
    # (models/audit.py), не заводим новое поле под каждый новый тип алерта.
    content_type = models.ForeignKey(
        'contenttypes.ContentType', on_delete=models.CASCADE, null=True, blank=True
    )
    object_id = models.PositiveIntegerField(null=True, blank=True)

    # Доп. данные для отображения без похода в связанный объект — например
    # {"current_qty": "3", "min_stock_level": 10} для low_stock.
    extra_data = models.JSONField(default=dict, blank=True)

    is_resolved = models.BooleanField(default=False, db_index=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Системный алерт"
        verbose_name_plural = "Системные алерты"
        indexes = [
            models.Index(fields=['type', 'is_resolved']),
            models.Index(fields=['content_type', 'object_id']),
        ]

    def __str__(self):
        return f"[{self.get_level_display()}] {self.title}"
