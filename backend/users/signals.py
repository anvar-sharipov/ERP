# backend/users/signals.py
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from .models import UserRole
from .rbac_events import notify_users_permissions_changed


@receiver([post_save, post_delete], sender=UserRole)
def on_user_role_changed(sender, instance, **kwargs):
    notify_users_permissions_changed([instance.user_id])
    
# # backend/users/signals.py
# from django.db.models.signals import post_save, post_delete
# from django.dispatch import receiver

# from .models import UserRole, RolePermission
# from .rbac_events import notify_users_permissions_changed, notify_role_permissions_changed


# # Изменение ролей конкретного пользователя
# @receiver([post_save, post_delete], sender=UserRole)
# def on_user_role_changed(sender, instance, **kwargs):
#     notify_users_permissions_changed([instance.user_id])


# # Изменение прав роли -> уведомляем всех юзеров с этой ролью
# @receiver([post_save, post_delete], sender=RolePermission)
# def on_role_permission_changed(sender, instance, **kwargs):
#     notify_role_permissions_changed(instance.role_id)