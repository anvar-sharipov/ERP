# backend/users/rbac_events.py
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django.core.cache import cache


def notify_users_permissions_changed(user_ids):
    """
    Отправляет уведомление об изменении прав конкретным пользователям
    и инвалидирует их кэш permissions.
    """
    channel_layer = get_channel_layer()

    for user_id in set(user_ids):
        # Инвалидация кэша прав - реальная защита обновляется немедленно
        cache.delete(f"user_perms_{user_id}")

        async_to_sync(channel_layer.group_send)(
            f"rbac_user_{user_id}",
            {
                "type": "permissions_changed",
            }
        )


def notify_role_permissions_changed(role_id):
    """
    Когда меняется RolePermission для роли — уведомляем всех юзеров с этой ролью.
    """
    from .models import UserRole

    user_ids = UserRole.objects.filter(role_id=role_id).values_list("user_id", flat=True)
    notify_users_permissions_changed(user_ids)
