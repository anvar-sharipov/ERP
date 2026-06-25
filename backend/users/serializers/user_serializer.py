# /backend/users/serializers.py
from rest_framework import serializers
from ..models import User, Role, RolePermission, UserRole
from django.contrib.auth.hashers import make_password
from django.contrib.auth import authenticate
from django.db import models
from django.db import transaction
from ..rbac_events import notify_role_permissions_changed

class RoleSerializer(serializers.ModelSerializer):
    permissions = serializers.ListField(
        child=serializers.IntegerField(), 
        write_only=True, 
        required=False
    )
    current_permissions = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Role
        fields = ['id', 'name', 'permissions', 'current_permissions']
        
    def get_current_permissions(self, obj):
        return list(obj.rolepermission_set.values_list('permission_id', flat=True))

    def create(self, validated_data):
        perms = validated_data.pop('permissions', [])
        role = Role.objects.create(**validated_data)
        for perm_id in perms:
            RolePermission.objects.create(role=role, permission_id=perm_id)
        return role
    
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
            transaction.on_commit(
                lambda: notify_role_permissions_changed(instance.id)
            )
        return instance


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True, 
        required=False, 
        allow_blank=True
    )
    roles = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.all(), 
        many=True, 
        write_only=True, 
        required=False
    )
    roles_data = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    photo_thumbnail = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()

    def get_permissions(self, obj):
        permissions = set()
        for user_role in obj.userrole_set.all():
            for role_perm in user_role.role.rolepermission_set.all():
                permissions.add(
                    f"{role_perm.permission.resource}.{role_perm.permission.action}"
                )
        return sorted(list(permissions))
    
    def get_roles_data(self, obj):
        return [
            {"id": ur.role.id, "name": ur.role.name} 
            for ur in obj.userrole_set.all()
        ]
    
    def get_full_name(self, obj):
        name_parts = [obj.last_name, obj.first_name]
        full_name = " ".join([part for part in name_parts if part and part.strip()])
        return full_name.strip() if full_name else obj.username
    
    def get_photo_thumbnail(self, obj):
        if obj.photo:
            try:
                return obj.photo_thumbnail.url
            except Exception:
                return None
        return None
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'phone', 'photo', 'roles', 
            'first_name', 'last_name', 'position', 'is_active', 
            'password', "photo_thumbnail", "full_name", "roles_data", 
            "is_superuser", "permissions"
        ]

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        user = super().create(validated_data)
        if password:
            user.password = make_password(password)
            user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        user = super().update(instance, validated_data)
        if password:
            user.password = make_password(password)
            user.save()
        return user


class ProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'phone', 'photo', 'position']
        extra_kwargs = {
            'first_name': {'required': False},
            'last_name': {'required': False},
            'phone': {'required': False},
            'photo': {'required': False},
            'position': {'required': False},
        }


class UserListSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    photo = serializers.SerializerMethodField()
    photo_thumbnail = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()
    
    def get_full_name(self, obj):
        name_parts = [obj.last_name, obj.first_name]
        full_name = " ".join([part for part in name_parts if part and part.strip()])
        return full_name.strip() if full_name else obj.username
    
    def get_photo(self, obj):
        if obj.photo:
            return obj.photo.url 
        return None
    
    def get_photo_thumbnail(self, obj):
        if obj.photo:
            try:
                return obj.photo_thumbnail.url
            except Exception:
                return None
        return None
    
    def get_roles(self, obj):
        return [
            {"id": ur.role.id, "name": ur.role.name} 
            for ur in obj.userrole_set.all()
        ]
 
    class Meta:
        model = User
        fields = [
            'id', 'username', 'full_name', 'first_name', 'last_name', 
            'phone', 'photo_thumbnail', 'photo', 'roles', 'position', 
            'is_active'
        ]


class UserLookupSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "full_name")

    def get_full_name(self, obj):
        name = f"{obj.last_name or ''} {obj.first_name or ''}".strip()
        return name or obj.username