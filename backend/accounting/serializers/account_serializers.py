# backend/accounting/serializers/account_serializers.py
from rest_framework import serializers
from ..models import Account, SubcontoType, AccountSubconto
from django.contrib.contenttypes.models import ContentType



class AccountChildSerializer(serializers.ModelSerializer):
    """Лёгкий сериализатор для дочерних счетов (без рекурсии)"""
    class Meta:
        model = Account
        fields = ['id', 'code', 'name', 'is_group', 'is_active']




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
    
    
    
    

class ContentTypeSerializer(serializers.ModelSerializer):
    label = serializers.SerializerMethodField()
    
    class Meta:
        model = ContentType
        fields = ['id', 'app_label', 'model', 'label']
    
    def get_label(self, obj):
        return str(obj)


class SubcontoTypeSerializer(serializers.ModelSerializer):
    content_type_detail = ContentTypeSerializer(source='content_type', read_only=True)
    directory_name = serializers.CharField(source='directory.name', read_only=True)
    
    class Meta:
        model = SubcontoType
        fields = ['id', 'name', 'slug', 'directory', 'directory_name', 'content_type', 'content_type_detail']

    def validate(self, data):
        ct = data.get('content_type')
        directory = data.get('directory')
        if not ct and not directory:
            raise serializers.ValidationError(
                "Укажите либо системную модель, либо справочник."
            )
        if ct and directory:
            raise serializers.ValidationError(
                "Укажите что-то одно: либо модель, либо справочник."
            )
        return data

class AccountSubcontoSerializer(serializers.ModelSerializer):
    subconto_type_detail = SubcontoTypeSerializer(source='subconto_type', read_only=True)
    
    class Meta:
        model = AccountSubconto
        fields = ['id', 'account', 'subconto_type', 'subconto_type_detail', 'order']
        
        
        
class AccountSerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()
    parent_code = serializers.CharField(source='parent.code', read_only=True)
    account_type_display = serializers.CharField(source='get_account_type_display', read_only=True)
    # добавить:
    account_subcontos = AccountSubcontoSerializer(many=True, read_only=True)

    class Meta:
        model = Account
        fields = [
            'id', 'code', 'name', 'is_group', 'is_active',
            'parent', 'parent_code', 'children',
            'account_type', 'account_type_display',
            'account_subcontos',  # добавить
        ]

    def get_children(self, obj):
        qs = obj.subaccounts.all().order_by('code')
        return AccountChildSerializer(qs, many=True).data
