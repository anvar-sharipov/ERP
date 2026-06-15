# backend/users/permissions.py
from django.core.cache import cache
from rest_framework import permissions
from .models import UserRole

def HasPermission(resource, action):
    class PermissionClass(permissions.BasePermission):
        def has_permission(self, request, view):
            if not request.user or not request.user.is_authenticated:
                return False
            if request.user.is_superuser:
                return True
            
            # Кэшируем права пользователя на 5 минут
            cache_key = f"user_perms_{request.user.id}"
            user_perms = cache.get(cache_key)
            
            if not user_perms:
                # Получаем все права одним запросом
                user_perms = set(
                    UserRole.objects.filter(user=request.user)
                    .values_list('role__rolepermission__permission__resource', 
                                 'role__rolepermission__permission__action')
                )
                cache.set(cache_key, user_perms, 300)
            
            return (resource, action) in user_perms
            
    return PermissionClass
