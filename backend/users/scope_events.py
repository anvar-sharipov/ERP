# backend/users/scope_events.py
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django.core.cache import cache


def notify_users_scope_changed(user_ids):
    """
    Отправляет уведомление об изменении scope конкретным пользователям
    и инвалидирует их кэш.
    """
    channel_layer = get_channel_layer()
    for user_id in set(user_ids):
        cache.delete(f"user_scope_{user_id}")
        async_to_sync(channel_layer.group_send)(
            f"scope_user_{user_id}",
            {
                "type": "scope_changed",
            }
        )


def notify_scope_changed_for_user(user_id):
    """
    Уведомляет одного конкретного пользователя об изменении его scope.
    """
    notify_users_scope_changed([user_id])