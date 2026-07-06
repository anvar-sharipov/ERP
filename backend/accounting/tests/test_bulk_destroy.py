# backend/accounting/tests/test_bulk_destroy.py
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.core.cache import cache
from django.db import connection
from django_tenants.test.cases import TenantTestCase
from django_tenants.utils import tenant_context
from rest_framework import status
from rest_framework.test import APIClient

from companies.models import Company, Domain
from users.models import Permission, Role, RolePermission, UserRole
from accounting.models import AuditLog, Document, DocumentItem, Product

User = get_user_model()

BULK_URL = '/api/accounting/products/bulk-destroy/'


class BulkDestroyTest(TenantTestCase):
    """
    Проверяет accounting/mixins.py::BulkDestroyMixin (подключен к ProductViewSet):
    - RBAC — метод замаплен на DELETE (users/permissions.py::_rbac), а не POST;
    - каждая удалённая запись пишется в AuditLog отдельно (через perform_destroy,
      как и при одиночном удалении) — не queryset.delete() в обход аудита;
    - частичный отказ (запись защищена PROTECT-связью) не откатывает остальные —
      удаляются все, кроме защищённой, ошибка возвращается по конкретному id;
    - несуществующие id возвращаются в missing_ids, не ломая остальное удаление;
    - пустой/отсутствующий ids -> 400.
    """

    def setUp(self):
        cache.clear()
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="Bulk Destroy Co", schema_name="bulkdestroy")
        Domain.objects.create(domain='bulkdestroy.localhost', tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            role = Role.objects.create(name="ProductManager")
            for action in ['GET', 'POST', 'PUT', 'DELETE']:
                perm, _ = Permission.objects.get_or_create(resource="product", action=action)
                RolePermission.objects.create(role=role, permission=perm)

            self.user = User.objects.create_user(username="manager", password="pass")
            UserRole.objects.create(user=self.user, role=role)

            # Без права DELETE (только GET) — для RBAC-теста.
            view_role = Role.objects.create(name="ProductViewer")
            view_perm, _ = Permission.objects.get_or_create(resource="product", action="GET")
            RolePermission.objects.create(role=view_role, permission=view_perm)
            self.viewer = User.objects.create_user(username="viewer", password="pass")
            UserRole.objects.create(user=self.viewer, role=view_role)

            self.p1 = Product.objects.create(name="Product 1")
            self.p2 = Product.objects.create(name="Product 2")
            self.p3 = Product.objects.create(name="Product 3")

    def _client(self, user):
        client = APIClient()
        client.defaults['HTTP_HOST'] = 'bulkdestroy.localhost'
        client.force_authenticate(user=user)
        return client

    def test_rbac_denies_without_delete_permission(self):
        response = self._client(self.viewer).delete(BULK_URL, {'ids': [self.p1.id]}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        with tenant_context(self.company):
            self.assertTrue(Product.objects.filter(pk=self.p1.id).exists())

    def test_requires_ids_list(self):
        response = self._client(self.user).delete(BULK_URL, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response2 = self._client(self.user).delete(BULK_URL, {'ids': []}, format='json')
        self.assertEqual(response2.status_code, status.HTTP_400_BAD_REQUEST)

    def test_bulk_destroy_deletes_all_and_writes_audit_log(self):
        with tenant_context(self.company):
            self.assertEqual(AuditLog.objects.count(), 0)

        ids = [self.p1.id, self.p2.id, self.p3.id]
        response = self._client(self.user).delete(BULK_URL, {'ids': ids}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertCountEqual(response.data['deleted_ids'], ids)
        self.assertEqual(response.data['errors'], [])

        with tenant_context(self.company):
            self.assertEqual(Product.objects.count(), 0)
            logs = AuditLog.objects.filter(
                content_type=ContentType.objects.get_for_model(Product),
                action=AuditLog.Action.DELETE,
            )
            self.assertEqual(logs.count(), 3, "каждая запись должна быть аудирована отдельно")
            self.assertCountEqual(list(logs.values_list('object_id', flat=True)), ids)
            self.assertTrue(all(log.user_id == self.user.id for log in logs))

    def test_bulk_destroy_partial_failure_keeps_other_deletions(self):
        with tenant_context(self.company):
            doc = Document.objects.create(document_type='out')
            DocumentItem.objects.create(document=doc, product=self.p2, quantity=1)

        ids = [self.p1.id, self.p2.id, self.p3.id]
        response = self._client(self.user).delete(BULK_URL, {'ids': ids}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertCountEqual(response.data['deleted_ids'], [self.p1.id, self.p3.id])
        self.assertEqual(len(response.data['errors']), 1)
        self.assertEqual(response.data['errors'][0]['id'], self.p2.id)

        with tenant_context(self.company):
            self.assertFalse(Product.objects.filter(pk=self.p1.id).exists())
            self.assertTrue(Product.objects.filter(pk=self.p2.id).exists(), "защищённая запись не должна удалиться")
            self.assertFalse(Product.objects.filter(pk=self.p3.id).exists())

            logs = AuditLog.objects.filter(
                content_type=ContentType.objects.get_for_model(Product),
                action=AuditLog.Action.DELETE,
            )
            self.assertEqual(logs.count(), 2, "на неудачное удаление аудит-лог писаться не должен")

    def test_bulk_destroy_reports_missing_ids(self):
        missing_id = 999999
        response = self._client(self.user).delete(BULK_URL, {'ids': [self.p1.id, missing_id]}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['deleted_ids'], [self.p1.id])
        self.assertEqual(response.data['missing_ids'], [missing_id])

        with tenant_context(self.company):
            self.assertFalse(Product.objects.filter(pk=self.p1.id).exists())
