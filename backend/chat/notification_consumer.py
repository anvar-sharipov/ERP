# backend/chat/notification_consumer.py
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Conversation
from django_tenants.utils import schema_context


class ChatNotificationConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        user = self.scope.get("user")
        if user is None or not getattr(user, "is_authenticated", False):
            await self.close()
            return

        self.user = user
        self.schema_name = self.scope.get("tenant_schema", "public")
        self.group_name = f"chat_notifications_{user.id}"

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        unread = await self.get_total_unread()
        await self.send(text_data=json.dumps({
            "type": "unread_count",
            "count": unread,
        }))

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    # ─── Events от channel layer ──────────────────────────────────────

    async def new_message(self, event):
        unread = await self.get_total_unread()
        conv_name = await self.get_conversation_name(event["conversation_id"])
        sender_photo = await self.get_sender_photo(event.get("sender_id"))  # ✅

        await self.send(text_data=json.dumps({
            "type": "new_message",
            "conversation_id": event["conversation_id"],
            "conversation_name": conv_name,
            "sender_id": event.get("sender_id"),
            "sender_username": event["sender_username"],
            "sender_first_name": event.get("sender_first_name", ""),
            "sender_last_name": event.get("sender_last_name", ""),
            "sender_photo_thumbnail": sender_photo,  # ✅
            "text": event["text"],
            "unread_count": unread,
        }))

    # ─── DB ──────────────────────────────────────────────────────────

    @database_sync_to_async
    def get_total_unread(self):
        with schema_context(self.schema_name):
            from .models import Message
            count = (
                Message.objects
                .filter(conversation__participants=self.user)
                .exclude(reads__user=self.user)
                .exclude(sender=self.user)
                .count()
            )
            print(f"[unread] schema={self.schema_name} user={self.user.id} count={count}")
            return count

    # ✅ Новый метод
    @database_sync_to_async
    def get_conversation_name(self, conv_id: int) -> str:
        with schema_context(self.schema_name):
            try:
                conv = Conversation.objects.prefetch_related("participants").get(id=conv_id)
                if conv.type == "group":
                    return conv.name or "Группа"
                other = conv.participants.exclude(id=self.user.id).first()
                if not other:
                    return "Чат"
                full = f"{other.first_name} {other.last_name}".strip()
                return full or other.username
            except Conversation.DoesNotExist:
                return "Чат"
            
            
    @database_sync_to_async
    def get_sender_photo(self, sender_id: int) -> str | None:
        with schema_context(self.schema_name):
            try:
                from django.contrib.auth import get_user_model
                User = get_user_model()
                user = User.objects.get(id=sender_id)
                return user.photo_thumbnail.url
            except Exception:
                return None
            
