# backend/chat/views.py
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from rest_framework.pagination import CursorPagination
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from utils.validators import validate_attachment_size
from .models import Conversation, Message, MessageRead
from .serializers import (
    ConversationSerializer,
    ConversationCreateSerializer,
    MessageSerializer,
)

User = get_user_model()


class ConversationListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Список моих бесед"""
        convs = Conversation.objects.filter(
            participants=request.user
        ).prefetch_related("participants", "messages__reads")
        serializer = ConversationSerializer(convs, many=True, context={"request": request})
        return Response(serializer.data)

    def post(self, request):
        """Создать беседу (direct или group)"""
        serializer = ConversationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        participant_ids = data["participant_ids"]
        participants = User.objects.filter(id__in=participant_ids)

        if data["type"] == "direct":
            if len(participant_ids) != 1:
                return Response(
                    {"detail": "Direct chat requires exactly 1 participant"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            other_user = participants.first()
            if not other_user:
                return Response({"detail": "User not found"}, status=404)

            # Ищем существующую личку между двумя юзерами
            existing = Conversation.objects.filter(
                type="direct",
                participants=request.user
            ).filter(
                participants=other_user
            ).first()

            if existing:
                return Response(
                    ConversationSerializer(existing, context={"request": request}).data
                )

            conv = Conversation.objects.create(type="direct")
            conv.participants.set([request.user, other_user])

        else:  # group
            conv = Conversation.objects.create(
                type="group",
                name=data.get("name", "")
            )
            conv.participants.set([request.user, *participants])

        return Response(
            ConversationSerializer(conv, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class MessageCursorPagination(CursorPagination):
    page_size = 30
    ordering = "-created_at"  # старые → новые
    cursor_query_param = "cursor"
    

class MessageListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = MessageSerializer
    pagination_class = MessageCursorPagination  # ✅

    def get_queryset(self):
        conv_id = self.kwargs["conv_id"]
        conv = Conversation.objects.filter(
            id=conv_id, participants=self.request.user
        ).first()
        if not conv:
            return Message.objects.none()
        return conv.messages.select_related("sender").prefetch_related("reads__user")





class MessageReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, conv_id):
        conv = Conversation.objects.filter(
            id=conv_id, participants=request.user
        ).first()
        if not conv:
            return Response({"detail": "Not found"}, status=404)

        unread_messages = conv.messages.exclude(
            reads__user=request.user
        ).exclude(sender=request.user)

        reads = [
            MessageRead(message=msg, user=request.user)
            for msg in unread_messages
        ]
        MessageRead.objects.bulk_create(reads, ignore_conflicts=True)

        # ✅ Отправляем WS событие для каждого прочитанного сообщения
        if reads:
            channel_layer = get_channel_layer()
            group_name = f"chat_{conv_id}"
            for read in reads:
                async_to_sync(channel_layer.group_send)(
                    group_name,
                    {
                        "type": "message_read",
                        "message_id": read.message.id,
                        "user_id": request.user.id,
                    }
                )

        return Response({"marked": len(reads)})


class MessageAttachmentUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, conv_id):
        conv = Conversation.objects.filter(
            id=conv_id, participants=request.user
        ).first()
        if not conv:
            return Response({"detail": "Not found"}, status=404)

        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "Файл обязателен"}, status=400)

        try:
            validate_attachment_size(file)
        except DjangoValidationError as e:
            return Response({"detail": e.messages[0]}, status=400)

        text = request.data.get("text", "").strip()

        message = Message.objects.create(
            conversation=conv,
            sender=request.user,
            text=text,
            attachment=file,
            attachment_name=file.name,
            attachment_size=file.size,
            attachment_content_type=getattr(file, "content_type", "") or "",
        )

        serializer = MessageSerializer(message, context={"request": request})
        data = serializer.data

        photo_thumbnail = None
        try:
            photo_thumbnail = request.user.photo_thumbnail.url
        except Exception:
            pass

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"chat_{conv_id}",
            {
                "type": "chat_message",
                "message_id": message.id,
                "conversation_id": int(conv_id),
                "sender_id": request.user.id,
                "sender_username": request.user.username,
                "sender_first_name": request.user.first_name,
                "sender_last_name": request.user.last_name,
                "sender_photo_thumbnail": photo_thumbnail,
                "text": message.text,
                "created_at": message.created_at.isoformat(),
                "attachment_url": data.get("attachment_url"),
                "attachment_name": message.attachment_name,
                "attachment_size": message.attachment_size,
                "attachment_content_type": message.attachment_content_type,
            }
        )

        participant_ids = list(conv.participants.exclude(id=request.user.id).values_list("id", flat=True))
        for user_id in participant_ids:
            async_to_sync(channel_layer.group_send)(
                f"chat_notifications_{user_id}",
                {
                    "type": "new_message",
                    "conversation_id": int(conv_id),
                    "sender_id": request.user.id,
                    "sender_username": request.user.username,
                    "sender_first_name": request.user.first_name,
                    "sender_last_name": request.user.last_name,
                    "sender_photo_thumbnail": photo_thumbnail,
                    "text": message.text or f"📎 {message.attachment_name}",
                }
            )

        return Response(data, status=status.HTTP_201_CREATED)

