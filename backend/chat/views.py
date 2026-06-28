# backend/chat/views.py
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework.pagination import CursorPagination
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

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

