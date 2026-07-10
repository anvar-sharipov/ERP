from django.urls import path
from .views import (
    ConversationListCreateView,
    MessageListView,
    MessageReadView,
    MessageAttachmentUploadView,
    MessageDeleteView,
)

urlpatterns = [
    path("conversations/", ConversationListCreateView.as_view()),
    path("conversations/<int:conv_id>/messages/", MessageListView.as_view()),
    path("conversations/<int:conv_id>/messages/read/", MessageReadView.as_view()),
    path("conversations/<int:conv_id>/messages/upload/", MessageAttachmentUploadView.as_view()),
    path("conversations/<int:conv_id>/messages/<int:message_id>/", MessageDeleteView.as_view()),
]