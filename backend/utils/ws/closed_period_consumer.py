# backend/utils/ws/closed_period_consumer.py
import json
from channels.generic.websocket import AsyncWebsocketConsumer


class ClosedPeriodConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if user is None or not getattr(user, "is_authenticated", False):
            await self.close()
            return

        tenant_schema = self.scope.get("tenant_schema", "public")
        self.group_name = f"closed_period_{tenant_schema}"

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send(text_data=json.dumps({"type": "connected"}))

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def closed_period_changed(self, event):
        await self.send(text_data=json.dumps({
            "type": "closed_period_changed",
            "date": event.get("date"),
            "warehouse": event.get("warehouse"),
            "action": event.get("action"),  # "closed" | "reopened"
        }))