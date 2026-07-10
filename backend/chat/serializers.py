from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Conversation, Message, MessageRead

User = get_user_model()
# pagination_class = None


class UserShortSerializer(serializers.ModelSerializer):
    photo_thumbnail = serializers.SerializerMethodField()
    photo = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "photo", "photo_thumbnail"]

    def get_photo_thumbnail(self, obj):
        try:
            url = obj.photo_thumbnail.url
            # Проверяем что url не пустой и содержит имя файла
            if url and url != "/media/" and len(url) > 10:
                return url
            return None
        except Exception:
            return None

    def get_photo(self, obj):
        try:
            url = obj.photo.url
            if url and url != "/media/" and len(url) > 10:
                return url
            return None
        except Exception:
            return None


class MessageReadSerializer(serializers.ModelSerializer):
    user = UserShortSerializer(read_only=True)

    class Meta:
        model = MessageRead
        fields = ["user", "read_at"]


class MessageSerializer(serializers.ModelSerializer):
    sender = UserShortSerializer(read_only=True)
    reads = MessageReadSerializer(many=True, read_only=True)
    is_read_by_me = serializers.SerializerMethodField()
    attachment_url = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            "id", "conversation", "sender", "text", "created_at", "reads", "is_read_by_me",
            "attachment_url", "attachment_name", "attachment_size", "attachment_content_type",
            "is_deleted",
        ]
        read_only_fields = [
            "id", "sender", "created_at", "reads", "is_read_by_me",
            "attachment_url", "attachment_name", "attachment_size", "attachment_content_type",
            "is_deleted",
        ]

    def get_is_read_by_me(self, obj):
        request = self.context.get("request")
        if not request:
            return False
        return obj.reads.filter(user=request.user).exists()

    def get_attachment_url(self, obj):
        return obj.attachment.url if obj.attachment and not obj.is_deleted else None


class ConversationSerializer(serializers.ModelSerializer):
    participants = UserShortSerializer(many=True, read_only=True)
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = ["id", "type", "name", "participants", "created_at", "last_message", "unread_count"]

    def get_last_message(self, obj):
        msg = obj.messages.last()
        if not msg:
            return None
        return MessageSerializer(msg, context=self.context).data

    def get_unread_count(self, obj):
        request = self.context.get("request")
        if not request:
            return 0
        return obj.messages.exclude(reads__user=request.user).exclude(sender=request.user).count()


class ConversationCreateSerializer(serializers.Serializer):
    """Для создания беседы"""
    type = serializers.ChoiceField(choices=["direct", "group"])
    name = serializers.CharField(required=False, allow_blank=True)
    participant_ids = serializers.ListField(
        child=serializers.IntegerField(), min_length=1
    )

    def validate(self, attrs):
        if attrs["type"] == "group" and not attrs.get("name"):
            raise serializers.ValidationError({"name": "Name is required for group chat"})
        return attrs