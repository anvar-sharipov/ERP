# /backend/users/serializers.py
from rest_framework import serializers
from ..models import User, Role, RolePermission, UserRole
from django.contrib.auth.hashers import make_password
from django.contrib.auth import authenticate
from django.db import models
from django.db import transaction
from ..rbac_events import notify_role_permissions_changed




class RoleSerializer(serializers.ModelSerializer):
    permissions = serializers.ListField(child=serializers.IntegerField(), write_only=True, required=False)
    current_permissions = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Role
        fields = ['id', 'name', 'permissions', 'current_permissions']
        
    def get_current_permissions(self, obj):
        return list(obj.rolepermission_set.values_list('permission_id', flat=True))

    def create(self, validated_data):
        perms = validated_data.pop('permissions', [])
        role = Role.objects.create(**validated_data)
        # Сохраняем связи в RolePermission
        for perm_id in perms:
            RolePermission.objects.create(role=role, permission_id=perm_id)
        return role
    
    # def update(self, instance, validated_data):
    #     perms = validated_data.pop('permissions', None)
    #     instance.name = validated_data.get('name', instance.name)
    #     instance.save()
        
    #     if perms is not None:
    #         # Удаляем старые связи и создаем новые
    #         RolePermission.objects.filter(role=instance).delete()
    #         for perm_id in perms:
    #             RolePermission.objects.create(role=instance, permission_id=perm_id)
    #     return instance
    
    def update(self, instance, validated_data):
        perms = validated_data.pop('permissions', None)
        instance.name = validated_data.get('name', instance.name)
        instance.save()

        if perms is not None:
            with transaction.atomic():
                RolePermission.objects.filter(role=instance).delete()
                RolePermission.objects.bulk_create([
                    RolePermission(role=instance, permission_id=perm_id)
                    for perm_id in perms
                ])

            # Уведомляем один раз, после коммита транзакции
            transaction.on_commit(lambda: notify_role_permissions_changed(instance.id))

        return instance

# create update user for admin
class UserSerializer(serializers.ModelSerializer):
    # Добавляем поле password
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    
    roles = serializers.PrimaryKeyRelatedField(queryset=Role.objects.all(), many=True, write_only=True, required=False)
    
    # Поле для чтения (для ответа фронтенду)
    roles_data = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    
    photo_thumbnail = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()
    # roles_name = serializers.SerializerMethodField()
    
    def get_permissions(self, obj):
        permissions = set()

        for user_role in obj.userrole_set.all():
            for role_perm in user_role.role.rolepermission_set.all():
                permissions.add(
                    f"{role_perm.permission.resource}.{role_perm.permission.action}"
                )

        return sorted(list(permissions))
    
    
    
    def get_roles_data(self, obj):
        # Используем логику из вашего UserListSerializer
        return [{"id": ur.role.id, "name": ur.role.name} for ur in obj.userrole_set.all()]
  
    
    
    # 2. Реализуем метод формирования полного имени
    def get_full_name(self, obj):
        # Собираем имя и фамилию, убираем лишние пробелы
        name_parts = [obj.last_name, obj.first_name]
        full_name = " ".join([part for part in name_parts if part and part.strip()])
        return full_name.strip() if full_name else obj.username # Если пусто, вернем хотя бы username
    
    
    def get_photo_thumbnail(self, obj):
        if obj.photo:
            try:
                return obj.photo_thumbnail.url
            except Exception:
                return None
        return None
    
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'phone', 'photo', 'roles', 'first_name', 'last_name', 'position', 'is_active', 
                  'password', "photo_thumbnail", "full_name", "roles_data", "is_superuser", "permissions"]

    def create(self, validated_data):
        # Извлекаем пароль, если он есть
        password = validated_data.pop('password', None)
        # Создаем пользователя
        user = super().create(validated_data)
        # Хешируем и сохраняем пароль, если он был передан
        if password:
            user.password = make_password(password)
            user.save()
        return user

    def update(self, instance, validated_data):
        # Извлекаем пароль, если он есть
        password = validated_data.pop('password', None)
        # Обновляем остальные данные
        user = super().update(instance, validated_data)
        # Обновляем пароль только если он был передан
        if password:
            user.password = make_password(password)
            user.save()
        return user
    
    # def update(self, instance, validated_data):
    #     # 1. Извлекаем роли, если они были переданы
    #     roles = validated_data.pop('roles', None)
    #     password = validated_data.pop('password', None)
        
    #     # 2. Обновляем базовые поля пользователя
    #     user = super().update(instance, validated_data)
        
    #     # 3. Обновляем пароль
    #     if password:
    #         user.password = make_password(password)
    #         user.save()
            
    #     # 4. Обновляем роли (ВАЖНО!)
    #     if roles is not None:
    #         with transaction.atomic():
    #             # Удаляем старые связи
    #             instance.userrole_set.all().delete()
    #             # Создаем новые
    #             UserRole.objects.bulk_create([
    #                 UserRole(user=instance, role=role)
    #                 for role in roles
    #             ])
                
    #     return user
 

# profile update for user
class ProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'phone', 'photo', 'position']
        # Поля не обязательны, чтобы юзер мог менять только что-то одно
        extra_kwargs = {
            'first_name': {'required': False},
            'last_name': {'required': False},
            'phone': {'required': False},
            'photo': {'required': False},
            'position': {'required': False},
        }


# get
class UserListSerializer(serializers.ModelSerializer):
    # roles = RoleSerializer(source='userrole_set.role', many=True, read_only=True)
    roles = serializers.SerializerMethodField()
    photo = serializers.SerializerMethodField()
    photo_thumbnail = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()
    
    # 2. Реализуем метод формирования полного имени
    def get_full_name(self, obj):
        # Собираем имя и фамилию, убираем лишние пробелы
        name_parts = [obj.last_name, obj.first_name]
        full_name = " ".join([part for part in name_parts if part and part.strip()])
        return full_name.strip() if full_name else obj.username # Если пусто, вернем хотя бы username
    
    def get_photo(self, obj):
        if obj.photo:
            # Возвращаем относительный путь
            return obj.photo.url 
        return None
    
    # Добавляем метод для получения URL миниатюры
    def get_photo_thumbnail(self, obj):
        if obj.photo:
            try:
                return obj.photo_thumbnail.url
            except Exception:
                return None
        return None
    
    def get_roles(self, obj):
        # print("tutGGGGG")
        # НЕ используй RoleSerializer. 
        # Просто верни список простых объектов:
        return [{"id": ur.role.id, "name": ur.role.name} for ur in obj.userrole_set.all()]
 
    class Meta:
        model = User
        fields = ['id', 'username', 'full_name', 'first_name', 'last_name', 'phone', 'photo_thumbnail', 'photo', 'roles', 'position', 'is_active']
        
        
