# backend/accounting/tests/test_document_filter_users.py
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connection
from django_tenants.test.cases import TenantTestCase
from django_tenants.utils import tenant_context
from rest_framework import status
from rest_framework.test import APIClient

from companies.models import Company, Domain
from users.models import Permission, Role, RolePermission, UserRole
from accounting.models import Branch, CompanyProfile, Document, UserScope, Warehouse

User = get_user_model()

LIST_URL = '/api/accounting/documents/'
FILTER_USERS_URL = '/api/accounting/documents/filter-users/'


class DocumentFilterUsersTest(TenantTestCase):
    """
    Проверяет /documents/filter-users/ и фильтры created_by/posted_by на списке
    документов (InvoicesPage.tsx):
    - RBAC (доступ по тому же 'document'/GET, что и list — без отдельного права 'user');
    - возвращаются ТОЛЬКО пользователи, реально фигурирующие как created_by/posted_by
      в документах текущего scope (не весь справочник пользователей);
    - Data Scoping — пользователь, ограниченный складом, не видит пользователей
      из документов на чужом складе;
    - фильтры created_by/posted_by на списке документов реально сужают выборку.
    """

    def setUp(self):
        cache.clear()
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="FilterUsers Test Co", schema_name="filteruserstest")
        Domain.objects.create(domain='filteruserstest.localhost', tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            role = Role.objects.create(name="Viewer")
            perm, _ = Permission.objects.get_or_create(resource="document", action="GET")
            RolePermission.objects.create(role=role, permission=perm)

            self.user_with_access = User.objects.create_user(username="viewer", password="pass")
            UserRole.objects.create(user=self.user_with_access, role=role)

            self.user_no_access = User.objects.create_user(username="noaccess", password="pass")

            company_profile = CompanyProfile.objects.create()
            self.branch1 = Branch.objects.create(name="Branch 1", company_profile=company_profile)
            self.branch2 = Branch.objects.create(name="Branch 2", company_profile=company_profile)
            self.wh1 = Warehouse.objects.create(name="WH1", branch=self.branch1)
            self.wh2 = Warehouse.objects.create(name="WH2", branch=self.branch2)

            self.scoped_user = User.objects.create_user(username="scoped", password="pass")
            UserRole.objects.create(user=self.scoped_user, role=role)
            UserScope.objects.create(user=self.scoped_user, branch=self.branch1, warehouse=self.wh1)

            # Авторы/провёдшие документы — не путать с user_with_access/scoped_user,
            # которые просто СМОТРЯТ список.
            self.author_a = User.objects.create_user(username="author_a", first_name="Alice", last_name="A")
            self.author_b = User.objects.create_user(username="author_b", first_name="Bob", last_name="B")

            # Документ на wh1: создан и проведён author_a
            self.doc1 = Document.objects.create(
                document_type='out', date='2026-01-05', warehouse=self.wh1, branch=self.branch1,
                created_by=self.author_a,
            )
            Document.objects.filter(pk=self.doc1.pk).update(status='posted', posted_by=self.author_a)

            # Документ на wh2: создан author_b, не проведён (posted_by пуст)
            self.doc2 = Document.objects.create(
                document_type='out', date='2026-01-06', warehouse=self.wh2, branch=self.branch2,
                created_by=self.author_b,
            )

    def _client(self, user):
        client = APIClient()
        client.defaults['HTTP_HOST'] = 'filteruserstest.localhost'
        client.force_authenticate(user=user)
        return client

    # ── RBAC ─────────────────────────────────────────────────────────────────

    def test_rbac_denies_without_document_permission(self):
        response = self._client(self.user_no_access).get(FILTER_USERS_URL)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_rbac_allows_with_document_get_permission(self):
        response = self._client(self.user_with_access).get(FILTER_USERS_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # ── Только пользователи, реально фигурирующие в документах ──────────────

    def test_returns_only_users_present_on_documents(self):
        response = self._client(self.user_with_access).get(FILTER_USERS_URL)
        ids = {u['id'] for u in response.data}
        self.assertEqual(ids, {self.author_a.id, self.author_b.id})
        # user_with_access/scoped_user/user_no_access сами документов не создавали —
        # не должны попадать в список.
        self.assertNotIn(self.user_with_access.id, ids)

    # ── Data Scoping ─────────────────────────────────────────────────────────

    def test_scope_restricts_users_to_own_warehouse(self):
        response = self._client(self.scoped_user).get(FILTER_USERS_URL)
        ids = {u['id'] for u in response.data}
        # scoped_user видит только wh1 -> только author_a (создатель+провёл doc1)
        self.assertEqual(ids, {self.author_a.id})
        self.assertNotIn(self.author_b.id, ids)

    # ── Фильтры created_by/posted_by на списке документов ────────────────────

    def test_created_by_filter_narrows_document_list(self):
        response = self._client(self.user_with_access).get(LIST_URL, {'created_by': self.author_b.id})
        results = response.data if isinstance(response.data, list) else response.data['results']
        self.assertEqual([r['id'] for r in results], [self.doc2.id])

    def test_posted_by_filter_narrows_document_list(self):
        response = self._client(self.user_with_access).get(LIST_URL, {'posted_by': self.author_a.id})
        results = response.data if isinstance(response.data, list) else response.data['results']
        self.assertEqual([r['id'] for r in results], [self.doc1.id])

    def test_posted_by_filter_excludes_unposted_document(self):
        # doc2 не проведён -> posted_by пуст, не должен попадать ни под какой posted_by фильтр
        response = self._client(self.user_with_access).get(LIST_URL, {'posted_by': self.author_b.id})
        results = response.data if isinstance(response.data, list) else response.data['results']
        self.assertEqual(results, [])
