# backend/chat/tests.py
from django_tenants.test.cases import TenantTestCase
from django_tenants.utils import tenant_context
from companies.models import Company, Domain
from django.contrib.auth import get_user_model
from django.db import connection
from rest_framework.test import APIClient
from rest_framework import status

from .models import Conversation, Message

User = get_user_model()


class MessageDeleteTest(TenantTestCase):
    """
    python manage.py test chat.tests.MessageDeleteTest
    """

    def setUp(self):
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="Test Company", schema_name="chattenant")
        Domain.objects.create(domain="chattenant.localhost", tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            self.author = User.objects.create_user(username="author", password="pass")
            self.other = User.objects.create_user(username="other", password="pass")
            self.stranger = User.objects.create_user(username="stranger", password="pass")

            self.conv = Conversation.objects.create(type="direct")
            self.conv.participants.set([self.author, self.other])

            self.message = Message.objects.create(
                conversation=self.conv, sender=self.author, text="Привет",
            )

    def _client(self, user) -> APIClient:
        client = APIClient()
        client.defaults["HTTP_HOST"] = "chattenant.localhost"
        client.force_authenticate(user=user)
        return client

    def _url(self, message_id=None):
        return f"/api/chat/conversations/{self.conv.id}/messages/{message_id or self.message.id}/"

    def test_author_can_delete_own_message(self):
        response = self._client(self.author).delete(self._url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["is_deleted"])
        self.assertEqual(response.data["text"], "")
        self.assertIsNone(response.data["attachment_url"])

        with tenant_context(self.company):
            self.message.refresh_from_db()
        self.assertTrue(self.message.is_deleted)
        self.assertEqual(self.message.text, "")

    def test_other_participant_cannot_delete_foreign_message(self):
        response = self._client(self.other).delete(self._url())
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        with tenant_context(self.company):
            self.message.refresh_from_db()
        self.assertFalse(self.message.is_deleted)

    def test_non_participant_gets_404(self):
        response = self._client(self.stranger).delete(self._url())
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_deleting_twice_is_idempotent(self):
        client = self._client(self.author)
        first = client.delete(self._url())
        second = client.delete(self._url())
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertTrue(second.data["is_deleted"])
