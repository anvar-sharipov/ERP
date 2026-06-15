# backend/utils/ws/jwt_auth_middleware.py
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from django_tenants.utils import schema_context
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import TokenError


@database_sync_to_async
def get_user_from_token(token, schema_name):
    from django.contrib.auth import get_user_model

    User = get_user_model()

    try:
        access_token = AccessToken(token)
        user_id = access_token["user_id"]
    except (TokenError, KeyError):
        return AnonymousUser()

    try:
        with schema_context(schema_name):
            return User.objects.get(id=user_id)
    except User.DoesNotExist:
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    """
    Достаёт JWT из query string (?token=...) и определяет пользователя.
    Также определяет schema_name тенанта по hostname (Host header),
    т.к. django_tenants.middleware не работает для ASGI websocket scope.
    """

    async def __call__(self, scope, receive, send):
        query_string = scope.get("query_string", b"").decode()
        params = parse_qs(query_string)
        token = params.get("token", [None])[0]

        headers = dict(scope.get("headers", []))
        host_header = headers.get(b"host", b"").decode()
        hostname = host_header.split(":")[0]

        schema_name = await self.get_schema_name(hostname)
        scope["tenant_schema"] = schema_name

        if token:
            scope["user"] = await get_user_from_token(token, schema_name)
        else:
            scope["user"] = AnonymousUser()

        return await super().__call__(scope, receive, send)

    @database_sync_to_async
    def get_schema_name(self, hostname):
        from companies.models import Domain

        try:
            domain = Domain.objects.select_related("tenant").get(domain=hostname)
            return domain.tenant.schema_name
        except Domain.DoesNotExist:
            return "public"