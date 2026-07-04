from django.urls import path
from .consumers import TestConsumer
from .rbac_consumer import RBACConsumer
from .scope_consumer import ScopeConsumer
from .closed_period_consumer import ClosedPeriodConsumer
from chat.consumers import ChatConsumer
from chat.notification_consumer import ChatNotificationConsumer

websocket_urlpatterns = [
    path("ws/test/", TestConsumer.as_asgi()),
    path("ws/rbac/", RBACConsumer.as_asgi()),
    path("ws/scope/", ScopeConsumer.as_asgi()),
    path("ws/closed-period/", ClosedPeriodConsumer.as_asgi()),
    path("ws/chat/notifications/", ChatNotificationConsumer.as_asgi()),
    path("ws/chat/<int:conv_id>/", ChatConsumer.as_asgi()),
]