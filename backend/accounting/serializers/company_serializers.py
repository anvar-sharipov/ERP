# backend/accounting/serializers/company_serializers.py
from rest_framework import serializers
from ..models import CompanyProfile, Branch, UserScope



        

# 2. Урезанный доступ для обычного пользователя (только чтение)
class CompanyProfileUserSerializer(serializers.ModelSerializer):
    
    logo = serializers.SerializerMethodField()
    logo_thumbnail= serializers.SerializerMethodField()
    logo2 = serializers.SerializerMethodField()
    logo2_thumbnail = serializers.SerializerMethodField()
    stamp_image = serializers.SerializerMethodField()
    stamp_image_thumbnail =  serializers.SerializerMethodField()
    signature_image = serializers.SerializerMethodField()
    signature_image_thumbnail = serializers.SerializerMethodField()
   
    class Meta:
        model = CompanyProfile
        # Исключаем чувствительные реквизиты (например, банк, МФО, налоговые данные)
        exclude = ['bank_account', 'mfo', 'tax_id'] 
        
    # Универсальные методы для получения относительных путей
    def get_logo(self, obj):
        return obj.logo.url if obj.logo else None

    def get_logo_thumbnail(self, obj):
        return obj.logo_thumbnail.url if obj.logo_thumbnail else None

    def get_logo2(self, obj):
        return obj.logo2.url if obj.logo2 else None

    def get_logo2_thumbnail(self, obj):
        return obj.logo2_thumbnail.url if obj.logo2_thumbnail else None

    def get_stamp_image(self, obj):
        return obj.stamp_image.url if obj.stamp_image else None

    def get_stamp_image_thumbnail(self, obj):
        return obj.stamp_image_thumbnail.url if obj.stamp_image_thumbnail else None

    def get_signature_image(self, obj):
        return obj.signature_image.url if obj.signature_image else None

    def get_signature_image_thumbnail(self, obj):
        return obj.signature_image_thumbnail.url if obj.signature_image_thumbnail else None


        


class BranchAdminSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(required=False, allow_blank=True)
    website = serializers.URLField(required=False, allow_blank=True)
    
    # ← убираем SerializerMethodField, ставим ImageField для записи
    logo = serializers.ImageField(required=False, allow_null=True)
    signature_image = serializers.ImageField(required=False, allow_null=True)
    logo_thumbnail = serializers.SerializerMethodField()
    signature_image_thumbnail = serializers.SerializerMethodField()

    class Meta:
        model = Branch
        fields = '__all__'

    def get_logo_thumbnail(self, obj):
        return obj.logo_thumbnail.url if obj.logo_thumbnail else None

    def get_signature_image_thumbnail(self, obj):
        return obj.signature_image_thumbnail.url if obj.signature_image_thumbnail else None

    # ← добавляем to_representation для чтения (как у CompanyProfile)
    def to_representation(self, instance):
        representation = super().to_representation(instance)
        for field in ['logo', 'signature_image']:
            field_obj = getattr(instance, field, None)
            if field_obj and hasattr(field_obj, 'url'):
                representation[field] = field_obj.url
        return representation

    # ← добавляем update для обработки очистки файлов
    def update(self, instance, validated_data):
        image_fields = ["logo", "signature_image"]
        for field in image_fields:
            raw = self.context["request"].data.get(field, None)
            if raw == "":
                file_field = getattr(instance, field)
                if file_field:
                    file_field.delete(save=False)
                setattr(instance, field, None)
                validated_data.pop(field, None)
        return super().update(instance, validated_data)
    

    


class BranchUserSerializer(serializers.ModelSerializer):
  
    
    # Принудительно переопределяем поля, чтобы они отдавали относительный путь
    logo = serializers.SerializerMethodField()
    signature_image = serializers.SerializerMethodField()
    logo_thumbnail = serializers.SerializerMethodField()
    signature_image_thumbnail = serializers.SerializerMethodField()

    class Meta:
        model = Branch
        fields = ['id', 'name', 'address', 'city', 'phone', 'email', 'website', 
                  'manager_name', 'is_head_office', 'is_active',
                  'logo', 'logo_thumbnail', 'signature_image', 'signature_image_thumbnail']
        
    def get_logo(self, obj):
        return obj.logo.url if obj.logo else None

    def get_signature_image(self, obj):
        return obj.signature_image.url if obj.signature_image else None

    def get_logo_thumbnail(self, obj):
        return obj.logo_thumbnail.url if obj.logo_thumbnail else None

    def get_signature_image_thumbnail(self, obj):
        return obj.signature_image_thumbnail.url if obj.signature_image_thumbnail else None





# 1. Полный доступ для администратора (GET, POST, PUT)
class CompanyProfileAdminSerializer(serializers.ModelSerializer):
    email_official = serializers.EmailField(required=False, allow_blank=True)
    email_official2 = serializers.EmailField(required=False, allow_blank=True)
    website = serializers.URLField(required=False, allow_blank=True)
    website2 = serializers.URLField(required=False, allow_blank=True)

    # ↓ добавь это
    logo = serializers.ImageField(required=False, allow_null=True)
    logo2 = serializers.ImageField(required=False, allow_null=True)
    stamp_image = serializers.ImageField(required=False, allow_null=True)
    signature_image = serializers.ImageField(required=False, allow_null=True)

    branches = BranchAdminSerializer(many=True, read_only=True)

    class Meta:
        model = CompanyProfile
        fields = '__all__'
        read_only_fields = ['logo_thumbnail', 'logo2_thumbnail', 'stamp_image_thumbnail', 'signature_image_thumbnail']
        
    # Метод to_representation позволяет изменить то, как данные отдаются клиенту (на чтение)
    def to_representation(self, instance):
        representation = super().to_representation(instance)
        
        # Список полей, которые нужно принудительно сделать относительными
        image_fields = [
            'logo', 'logo2', 'stamp_image', 'signature_image', 
            'logo_thumbnail', 'logo2_thumbnail', 'stamp_image_thumbnail', 'signature_image_thumbnail'
        ]
        
        request = self.context.get('request')
        
        for field in image_fields:
            # Получаем значение поля
            field_obj = getattr(instance, field, None)
            # Если это объект файла и у него есть URL, принудительно возвращаем путь без домена
            if field_obj and hasattr(field_obj, 'url'):
                # url самого Django обычно относительный, 
                # но если он вдруг стал абсолютным, мы его "обрезаем"
                representation[field] = field_obj.url
                
        return representation

    # ↓ и это
    def update(self, instance, validated_data):
        image_fields = ["logo", "logo2", "stamp_image", "signature_image"]
        for field in image_fields:
            raw = self.context["request"].data.get(field, None)
            if raw == "":
                file_field = getattr(instance, field)
                if file_field:
                    file_field.delete(save=False)
                setattr(instance, field, None)
                validated_data.pop(field, None)
        return super().update(instance, validated_data)




class UserScopeSerializer(serializers.ModelSerializer):
    branch_name   = serializers.CharField(source='branch.name',   read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
 
    class Meta:
        model  = UserScope
        fields = [
            'id', 'user',
            'branch', 'branch_name',
            'warehouse', 'warehouse_name',
        ]
 
    def validate(self, attrs):
        from django.core.exceptions import ValidationError as DjangoValidationError
        if not attrs.get('branch') and not attrs.get('warehouse'):
            raise serializers.ValidationError("Укажите хотя бы филиал или склад.")
        return attrs




