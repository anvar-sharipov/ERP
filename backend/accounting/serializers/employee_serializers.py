# backend/accounting/serializers/employee_serializers.py
from rest_framework import serializers
from ..models import Position, Employee, Agent


class PositionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Position
        fields = "__all__"


class EmployeeSerializer(serializers.ModelSerializer):
    position_name = serializers.CharField(source="position.name", read_only=True)
    user_username = serializers.CharField(source="user.username", read_only=True)
    branch_name   = serializers.CharField(source="branch.name",   read_only=True)
    photo = serializers.ImageField(required=False, allow_null=True)
    photo_thumbnail = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        fields = [
            "id",
            "employee_no",
            "full_name",
            "position",
            "position_name",
            "branch",
            "branch_name",
            "phone",
            "hire_date",
            "dismiss_date",
            "user",
            "user_username",
            "note",
            "is_active",
            "photo",
            "photo_thumbnail",
            "created_at",
            "updated_at",
        ]

    def get_photo_thumbnail(self, obj):
        return obj.photo_thumbnail.url if obj.photo_thumbnail else None

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        if instance.photo and hasattr(instance.photo, 'url'):
            representation['photo'] = instance.photo.url
        return representation

    def update(self, instance, validated_data):
        request = self.context.get("request")
        if request is not None and request.data.get("photo", None) == "":
            if instance.photo:
                instance.photo.delete(save=False)
            instance.photo = None
            validated_data.pop("photo", None)
        return super().update(instance, validated_data)


# ── Короткий сериализатор для выбора в документах ─────────────────────────────

class EmployeeShortSerializer(serializers.ModelSerializer):
    position_name = serializers.CharField(source="position.name", read_only=True)
    branch_name   = serializers.CharField(source="branch.name",   read_only=True)

    class Meta:
        model = Employee
        fields = ["id", "full_name", "employee_no", "position", "position_name", "branch", "branch_name"]


# ── Agent (профиль агента: Employee + район) ──────────────────────────────────

class AgentSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = Agent
        fields = ["id", "employee", "employee_name", "district", "is_active", "display_name", "created_at"]
        read_only_fields = ["created_at"]

    def get_display_name(self, obj):
        return str(obj)


class AgentShortSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = Agent
        fields = ["id", "employee", "employee_name", "district", "display_name"]

    def get_display_name(self, obj):
        return str(obj)