from rest_framework import serializers
from accounting.models.audit import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    user_display   = serializers.CharField(source='user.get_full_name', read_only=True)
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    model_name     = serializers.CharField(source='content_type.model', read_only=True)
    
    user_display = serializers.SerializerMethodField()

    def get_user_display(self, obj):
        if not obj.user:
            return 'Система'
        return obj.user.get_full_name() or obj.user.username

    class Meta:
        model  = AuditLog
        fields = [
            'id', 'user', 'user_display',
            'action', 'action_display',
            'model_name', 'object_id', 'object_repr',
            'changed_data', 'ip_address', 'timestamp',
        ]