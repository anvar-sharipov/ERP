# backend/accounting/serializers/account_serializers.py
from rest_framework import serializers
from ..models import Account


class AccountChildSerializer(serializers.ModelSerializer):
    """Лёгкий сериализатор для дочерних счетов (без рекурсии)"""
    class Meta:
        model = Account
        fields = ['id', 'code', 'name', 'is_group', 'is_active']


class AccountSerializer(serializers.ModelSerializer):
    """Полный сериализатор с вложенными детьми (для дерева)"""
    children = serializers.SerializerMethodField()
    parent_code = serializers.CharField(source='parent.code', read_only=True)
    account_type_display = serializers.CharField(source='get_account_type_display', read_only=True)

    class Meta:
        model = Account
        fields = [
            'id', 'code', 'name', 'is_group', 'is_active',
            'parent', 'parent_code', 'children', 'account_type_display'
        ]

    def get_children(self, obj):
        qs = obj.subaccounts.all().order_by('code')
        return AccountChildSerializer(qs, many=True).data


class AccountWriteSerializer(serializers.ModelSerializer):
    """Сериализатор для создания/редактирования"""
    class Meta:
        model = Account
        fields = ['id', 'code', 'name', 'is_group', 'parent', 'account_type', 'is_active']

    def validate_code(self, value):
        # Уникальность кода при создании и редактировании
        qs = Account.objects.filter(code=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                f"Счёт с кодом '{value}' уже существует."
            )
        return value

    def validate(self, data):
        parent = data.get('parent', self.instance.parent if self.instance else None)
        is_group = data.get('is_group', self.instance.is_group if self.instance else False)

        # Нельзя назначить родителем не-группу
        if parent and not parent.is_group:
            raise serializers.ValidationError(
                "Родительский счёт должен быть группой (is_group=True)."
            )

        # Нельзя снять флаг группы, если есть субсчета
        if self.instance and not is_group:
            if self.instance.subaccounts.exists():
                raise serializers.ValidationError(
                    "Нельзя снять флаг группы — у счёта есть субсчета."
                )

        return data