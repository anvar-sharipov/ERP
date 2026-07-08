# accounting/serializers/alert_serializers.py
from rest_framework import serializers
from accounting.models import SystemAlert


class SystemAlertSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source='get_type_display', read_only=True)
    level_display = serializers.CharField(source='get_level_display', read_only=True)
    model_name = serializers.CharField(source='content_type.model', read_only=True, default=None)

    class Meta:
        model = SystemAlert
        fields = [
            'id', 'type', 'type_display', 'level', 'level_display',
            'title', 'message', 'model_name', 'object_id', 'extra_data',
            'is_resolved', 'resolved_at', 'created_at', 'updated_at',
        ]
        # ✅ Полностью read-only с фронта — записи создаёт/обновляет только
        # фоновая задача (accounting/tasks.py). Единственное разрешённое
        # действие с фронта — пометить решённым вручную (см.
        # SystemAlertViewSet.resolve), не через сериализатор.
        read_only_fields = fields
