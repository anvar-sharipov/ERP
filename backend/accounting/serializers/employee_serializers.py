# backend/accounting/serializers/employee_serializers.py
from rest_framework import serializers
from ..models import Position, Employee


class PositionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Position
        fields = "__all__"
        
        
        
class EmployeeSerializer(serializers.ModelSerializer):
    position_name = serializers.CharField(source="position.name", read_only=True)
    user_username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = Employee
        fields = [
            "id",
            "employee_no",
            "full_name",
            "position",
            "position_name",
            "phone",
            "hire_date",
            "dismiss_date",
            "user",
            "user_username",
            "note",
            "is_active",
            "created_at",
            "updated_at",
        ]