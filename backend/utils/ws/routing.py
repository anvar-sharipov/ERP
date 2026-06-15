# backend/utils/ws/routing.py
from django.urls import path
from .consumers import TestConsumer
from .rbac_consumer import RBACConsumer

websocket_urlpatterns = [
    path("ws/test/", TestConsumer.as_asgi()),
    path("ws/rbac/", RBACConsumer.as_asgi())
]