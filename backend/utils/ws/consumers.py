# backend/utils/ws/consumers.py
from channels.generic.websocket import AsyncWebsocketConsumer
import json

class TestConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        print("CONNECT CALLED")
        await self.accept()

        print("ACCEPTED")

        await self.send(text_data=json.dumps({
            "message": "connected"
        }))

        print("MESSAGE SENT")

    async def receive(self, text_data):
        print("RECEIVED:", text_data)

        await self.send(text_data=json.dumps({
            "echo": text_data
        }))