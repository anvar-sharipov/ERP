# backend/chat/consumers.py
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django_tenants.utils import schema_context
from django.core.cache import cache
from .models import Conversation, Message, MessageRead

User = get_user_model()


class ChatConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        user = self.scope.get("user")
        if user is None or not getattr(user, "is_authenticated", False):
            await self.close()
            return

        self.user = user
        self.conv_id = self.scope["url_route"]["kwargs"]["conv_id"]
        self.group_name = f"chat_{self.conv_id}"
        self.schema_name = self.scope.get("tenant_schema", "public")

        is_participant = await self.check_participant()
        if not is_participant:
            await self.close()
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.set_online(True)

        online_ids = await self.get_online_participants()
        await self.send(text_data=json.dumps({
            "type": "online_list",
            "user_ids": online_ids,
        }))

        await self.channel_layer.group_send(
            self.group_name,
            {"type": "user_online", "user_id": self.user.id}
        )

    async def disconnect(self, close_code):
        if not hasattr(self, "group_name"):
            return
        await self.set_online(False)
        # ✅ Убираем typing при дисконнекте
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "user_typing",
                "user_id": self.user.id,
                "username": self.user.username,
                "first_name": self.user.first_name,
                "last_name": self.user.last_name,
                "is_typing": False,
            }
        )
        await self.channel_layer.group_send(
            self.group_name,
            {"type": "user_offline", "user_id": self.user.id}
        )
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        msg_type = data.get("type")
        if msg_type == "message":
            await self.handle_message(data)
        elif msg_type == "read":
            await self.handle_read(data)
        elif msg_type == "typing":  # ✅
            await self.handle_typing(data)

    # ─── Handlers ────────────────────────────────────────────────────

    async def handle_message(self, data):
        text = data.get("text", "").strip()
        if not text:
            return

        message = await self.save_message(text)
        if not message:
            return

        participant_ids = await self.get_participant_ids()
        photo_thumbnail = await self.get_user_photo(self.user)  # ✅

        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "chat_message",
                "message_id": message.id,
                "conversation_id": int(self.conv_id),
                "sender_id": self.user.id,
                "sender_username": self.user.username,
                "sender_first_name": self.user.first_name,
                "sender_last_name": self.user.last_name,
                "sender_photo_thumbnail": photo_thumbnail,  # ✅
                "text": message.text,
                "created_at": message.created_at.isoformat(),
            }
        )

        for user_id in participant_ids:
            if user_id == self.user.id:
                continue
            await self.channel_layer.group_send(
                f"chat_notifications_{user_id}",
                {
                    "type": "new_message",
                    "conversation_id": int(self.conv_id),
                    "sender_id": self.user.id,
                    "sender_username": self.user.username,
                    "sender_first_name": self.user.first_name,
                    "sender_last_name": self.user.last_name,
                    "sender_photo_thumbnail": photo_thumbnail,  # ✅ это есть?
                    "text": message.text,
                }
            )


    # async def handle_read(self, data):
    #     message_id = data.get("message_id")
    #     if not message_id:
    #         return
    #     await self.mark_read(message_id)
    #     print(f"[ws_read] user={self.user.id} message={message_id}")
    #     await self.channel_layer.group_send(
    #         self.group_name,
    #         {
    #             "type": "message_read",
    #             "message_id": message_id,
    #             "user_id": self.user.id,
    #         }
    #     )
    
    async def handle_read(self, data):
        message_id = data.get("message_id")
        if not message_id:
            return
        await self.mark_read(message_id)
        print(f"[ws_read] user={self.user.id} message={message_id}")
        
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "message_read",
                "message_id": message_id,
                "user_id": self.user.id,
            }
        )
        
        # ✅ сбрасываем счётчик в notification consumer
        unread = await self.get_unread_count()
        print(f"[ws_read_after] user={self.user.id} unread_after={unread}")
        await self.channel_layer.group_send(
            f"chat_notifications_{self.user.id}",
            {
                "type": "unread_count_update",
                "count": unread,
            }
        )

    # ✅ Новый handler
    async def handle_typing(self, data):
        is_typing = bool(data.get("is_typing", False))
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "user_typing",
                "user_id": self.user.id,
                "username": self.user.username,
                "first_name": self.user.first_name,
                "last_name": self.user.last_name,
                "is_typing": is_typing,
            }
        )

    # ─── Channel layer events ─────────────────────────────────────────

    async def chat_message(self, event):
        try:
            await self.send(text_data=json.dumps({
                "type": "message",
                "message_id": event["message_id"],
                "conversation_id": event["conversation_id"],
                "sender_id": event["sender_id"],
                "sender_username": event["sender_username"],
                "sender_first_name": event.get("sender_first_name", ""),
                "sender_last_name": event.get("sender_last_name", ""),
                "sender_photo_thumbnail": event.get("sender_photo_thumbnail"),  # ✅
                "text": event["text"],
                "created_at": event["created_at"],
            }))
        except Exception:
            pass

    async def message_read(self, event):
        try:
            await self.send(text_data=json.dumps({
                "type": "read",
                "message_id": event["message_id"],
                "user_id": event["user_id"],
            }))
        except Exception:
            pass

    async def user_online(self, event):
        try:
            await self.send(text_data=json.dumps({
                "type": "online",
                "user_id": event["user_id"],
            }))
        except Exception:
            pass

    async def user_offline(self, event):
        try:
            await self.send(text_data=json.dumps({
                "type": "offline",
                "user_id": event["user_id"],
            }))
        except Exception:
            pass

    # ✅ Новый channel layer event
    async def user_typing(self, event):
        # Не отправляем самому себе
        if event["user_id"] == self.user.id:
            return
        try:
            await self.send(text_data=json.dumps({
                "type": "typing",
                "user_id": event["user_id"],
                "username": event.get("username", ""),
                "first_name": event.get("first_name", ""),
                "last_name": event.get("last_name", ""),
                "is_typing": event["is_typing"],
            }))
        except Exception:
            pass

    # ─── DB ──────────────────────────────────────────────────────────

    @database_sync_to_async
    def check_participant(self):
        with schema_context(self.schema_name):
            return Conversation.objects.filter(
                id=self.conv_id, participants=self.user
            ).exists()

    @database_sync_to_async
    def save_message(self, text):
        with schema_context(self.schema_name):
            return Message.objects.create(
                conversation_id=self.conv_id,
                sender=self.user,
                text=text,
            )

    @database_sync_to_async
    def mark_read(self, message_id):
        with schema_context(self.schema_name):
            MessageRead.objects.get_or_create(
                message_id=message_id,
                user=self.user,
            )

    @database_sync_to_async
    def get_participant_ids(self):
        with schema_context(self.schema_name):
            return list(
                Conversation.objects.get(id=self.conv_id)
                .participants.values_list("id", flat=True)
            )

    @database_sync_to_async
    def get_online_participants(self):
        with schema_context(self.schema_name):
            participant_ids = list(
                Conversation.objects.get(id=self.conv_id)
                .participants.values_list("id", flat=True)
            )
        online = []
        for uid in participant_ids:
            if cache.get(f"chat_online_{self.schema_name}_{uid}"):
                online.append(uid)
        return online

    @database_sync_to_async
    def set_online(self, is_online: bool):
        key = f"chat_online_{self.schema_name}_{self.user.id}"
        if is_online:
            cache.set(key, True, timeout=60 * 60)
        else:
            cache.delete(key)
            
            
    # @database_sync_to_async
    # def get_user_photo(self, user):
    #     try:
    #         return user.photo_thumbnail.url
    #     except Exception:
    #         return None
    
    @database_sync_to_async
    def get_user_photo(self, user):
        try:
            return user.photo_thumbnail.url  # оставляем как есть → /media/CACHE/...
        except Exception:
            return None
        
        
    @database_sync_to_async
    def get_unread_count(self):
        with schema_context(self.schema_name):
            from .models import Message
            return (
                Message.objects
                .filter(conversation__participants=self.user)
                .exclude(reads__user=self.user)
                .exclude(sender=self.user)
                .count()
            )

