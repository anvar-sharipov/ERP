# backend/users/permissions.py
from django.core.cache import cache
from rest_framework import permissions
from rest_framework.permissions import IsAuthenticated
from .models import UserRole


def HasPermission(resource: str, action: str):
    class PermissionClass(permissions.BasePermission):
        def has_permission(self, request, view):
            if not request.user or not request.user.is_authenticated:
                return False
            if request.user.is_superuser:
                return True

            cache_key = f"user_perms_{request.user.id}"
            user_perms = cache.get(cache_key)

            if not user_perms:
                user_perms = set(
                    UserRole.objects.filter(user=request.user)
                    .values_list(
                        'role__rolepermission__permission__resource',
                        'role__rolepermission__permission__action',
                    )
                )
                cache.set(cache_key, user_perms, 300)

            return (resource, action) in user_perms

    return PermissionClass


def _rbac(action: str, resource: str):
    """
    Маппинг DRF action → HTTP method.
    Кастомные экшены (@action) по умолчанию требуют POST → 'POST'.
    Если нужен другой метод — передавай явно через permission_map во вьюсете.
    """
    action_map = {
        # Стандартные
        'list':           'GET',
        'retrieve':       'GET',
        'create':         'POST',
        'update':         'PUT',
        'partial_update': 'PUT',
        'destroy':        'DELETE',
        # Кастомные общие
        'post_entry':     'POST',
        'unpost_entry':   'POST',
        'set_main':       'POST',
        'check':          'GET',
        'range_check':    'GET',
    }
    method = action_map.get(action, 'POST')  # неизвестные экшены → POST
    return [IsAuthenticated(), HasPermission(resource, method)()]

# # backend/users/permissions.py
# from django.core.cache import cache
# from rest_framework import permissions
# from .models import UserRole
# from rest_framework.permissions import IsAuthenticated

# def HasPermission(resource, action):
#     class PermissionClass(permissions.BasePermission):
#         def has_permission(self, request, view):
#             if not request.user or not request.user.is_authenticated:
#                 return False
#             if request.user.is_superuser:
#                 return True
            
#             # Кэшируем права пользователя на 5 минут
#             cache_key = f"user_perms_{request.user.id}"
#             user_perms = cache.get(cache_key)
            
#             if not user_perms:
#                 # Получаем все права одним запросом
#                 user_perms = set(
#                     UserRole.objects.filter(user=request.user)
#                     .values_list('role__rolepermission__permission__resource', 
#                                  'role__rolepermission__permission__action')
#                 )
#                 cache.set(cache_key, user_perms, 300)
            
#             return (resource, action) in user_perms
            
#     return PermissionClass


# def _rbac(action: str, resource: str):
#     action_map = {
#         "list": "GET", "retrieve": "GET",
#         "create": "POST",
#         "update": "PUT", "partial_update": "PUT",
#         "destroy": "DELETE",
#     }
#     method = action_map.get(action, "GET")
#     return [IsAuthenticated(), HasPermission(resource, method)()]