# backend/chat/models.py
import uuid
from django.db import connection, models
from django.conf import settings

from utils.validators import validate_attachment_size

User = settings.AUTH_USER_MODEL


def message_attachment_path(instance, filename):
    ext = filename.split('.')[-1].lower() if '.' in filename else ''
    new_filename = f"{uuid.uuid4()}.{ext}" if ext else str(uuid.uuid4())
    return f"{connection.schema_name}/chat_attachments/{instance.conversation_id}/{new_filename}"


class Conversation(models.Model):
    TYPE_DIRECT = "direct"
    TYPE_GROUP = "group"
    TYPE_CHOICES = [
        (TYPE_DIRECT, "Direct"),
        (TYPE_GROUP, "Group"),
    ]

    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    name = models.CharField(max_length=255, blank=True)  # только для group
    participants = models.ManyToManyField(User, related_name="conversations")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name or f"Direct #{self.pk}"


class Message(models.Model):
    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="messages"
    )
    sender = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="sent_messages"
    )
    text = models.TextField(blank=True)
    attachment = models.FileField(
        upload_to=message_attachment_path, blank=True, null=True,
        validators=[validate_attachment_size]
    )
    attachment_name = models.CharField(max_length=255, blank=True)
    attachment_size = models.PositiveIntegerField(null=True, blank=True)
    attachment_content_type = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Message #{self.pk} in Conversation #{self.conversation_id}"


class MessageRead(models.Model):
    message = models.ForeignKey(
        Message, on_delete=models.CASCADE, related_name="reads"
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="read_messages"
    )
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("message", "user")