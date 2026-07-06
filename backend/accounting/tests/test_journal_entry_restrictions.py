# backend/accounting/tests/test_journal_entry_restrictions.py
import datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.core.cache import cache
from django.db import connection
from django.utils import timezone
from django_tenants.test.cases import TenantTestCase
from django_tenants.utils import tenant_context
from rest_framework import status
from rest_framework.test import APIClient

from companies.models import Company, Domain
from users.models import Permission, Role, RolePermission, UserRole
from accounting.models import Account, Branch, CompanyProfile, UserScope, Warehouse
from accounting.models.transaction import JournalEntry, TransactionLine

User = get_user_model()

JOURNAL_URL = '/api/accounting/journal-entries/'


class JournalEntryRestrictionsTest(TenantTestCase):
    """
    Проверяет разделение "ручных" и "сгенерированных документом" проводок
    (см. JournalPage.tsx сайдбар-фильтр "Ручные/Документы/Все"):
    - фильтр ?entry_type=manual|document сужает список, без параметра — видно всё;
    - is_manual корректно вычисляется (source_document_id is None);
    - document-проводку нельзя провести/распровести/отредактировать/удалить
      напрямую из журнала (JournalEntryViewSet) — только через сам документ;
    - ручная проводка при этом продолжает работать как раньше;
    - Data Scoping (apply_scope) применяется одинаково к обоим типам проводок.
    """

    def setUp(self):
        cache.clear()
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="JE Restrictions Co", schema_name="jerestrict")
        Domain.objects.create(domain='jerestrict.localhost', tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            role = Role.objects.create(name="Accountant")
            for action in ['GET', 'POST', 'PUT', 'DELETE']:
                perm, _ = Permission.objects.get_or_create(resource="journalentry", action=action)
                RolePermission.objects.create(role=role, permission=perm)

            self.user = User.objects.create_user(username="accountant", password="pass")
            UserRole.objects.create(user=self.user, role=role)

            company_profile = CompanyProfile.objects.create()
            self.branch1 = Branch.objects.create(name="Branch 1", company_profile=company_profile)
            self.branch2 = Branch.objects.create(name="Branch 2", company_profile=company_profile)
            self.wh1 = Warehouse.objects.create(name="WH1", branch=self.branch1)
            self.wh2 = Warehouse.objects.create(name="WH2", branch=self.branch2)

            self.scoped_user = User.objects.create_user(username="scoped", password="pass")
            UserRole.objects.create(user=self.scoped_user, role=role)
            UserScope.objects.create(user=self.scoped_user, branch=self.branch1, warehouse=self.wh1)

            self.acc_dt = Account.objects.create(code="60", name="Клиент", is_group=False)
            self.acc_kt = Account.objects.create(code="90.1", name="Выручка", is_group=False)

            self.manual_entry = self._make_entry(
                "MANUAL-1", self.branch1, self.wh1, posted=False, source_document_id=None,
            )
            # ✅ Имитируем проводку, сгенерированную документом — для проверки
            # ограничений неважно, какая именно модель сослалась (source_document_type
            # тут условный ContentType), важно только что source_document_id задан.
            self.document_entry = self._make_entry(
                "DOC-1", self.branch1, self.wh1, posted=True,
                source_document_type=ContentType.objects.get_for_model(Account),
                source_document_id=999,
            )
            self.other_branch_entry = self._make_entry(
                "MANUAL-2", self.branch2, self.wh2, posted=False, source_document_id=None,
            )

    def _make_entry(self, number, branch, warehouse, posted, source_document_type=None, source_document_id=None):
        date = timezone.make_aware(datetime.datetime(2026, 1, 10))
        entry = JournalEntry.objects.create(
            number=number,
            date=date,
            status=JournalEntry.Status.POSTED if posted else JournalEntry.Status.DRAFT,
            branch=branch,
            warehouse=warehouse,
            source_document_type=source_document_type,
            source_document_id=source_document_id,
        )
        TransactionLine.objects.create(journal_entry=entry, order=1, side=TransactionLine.Side.DEBIT, account=self.acc_dt, amount=Decimal("10.00"))
        TransactionLine.objects.create(journal_entry=entry, order=2, side=TransactionLine.Side.CREDIT, account=self.acc_kt, amount=Decimal("10.00"))
        return entry

    def _client(self, user):
        client = APIClient()
        client.defaults['HTTP_HOST'] = 'jerestrict.localhost'
        client.force_authenticate(user=user)
        return client

    # ── Фильтр entry_type + is_manual ────────────────────────────────────────

    def test_list_without_entry_type_returns_all(self):
        response = self._client(self.user).get(JOURNAL_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        numbers = {row['number'] for row in response.data}
        self.assertIn("MANUAL-1", numbers)
        self.assertIn("DOC-1", numbers)

    def test_list_entry_type_manual_excludes_document_entries(self):
        response = self._client(self.user).get(JOURNAL_URL, {'entry_type': 'manual'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        numbers = {row['number'] for row in response.data}
        self.assertIn("MANUAL-1", numbers)
        self.assertNotIn("DOC-1", numbers)

    def test_list_entry_type_document_excludes_manual_entries(self):
        response = self._client(self.user).get(JOURNAL_URL, {'entry_type': 'document'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        numbers = {row['number'] for row in response.data}
        self.assertIn("DOC-1", numbers)
        self.assertNotIn("MANUAL-1", numbers)

    def test_is_manual_flag_correct_in_list(self):
        response = self._client(self.user).get(JOURNAL_URL)
        by_number = {row['number']: row for row in response.data}
        self.assertTrue(by_number["MANUAL-1"]['is_manual'])
        self.assertFalse(by_number["DOC-1"]['is_manual'])

    # ── Scope (apply_scope) — тот же фильтр должен сочетаться со scope ───────

    def test_scoped_user_does_not_see_other_branch_entries(self):
        response = self._client(self.scoped_user).get(JOURNAL_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        numbers = {row['number'] for row in response.data}
        self.assertIn("MANUAL-1", numbers)
        self.assertIn("DOC-1", numbers)
        self.assertNotIn("MANUAL-2", numbers, "scoped-пользователь не должен видеть проводки чужого филиала")

    # ── Document-проводку нельзя провести/распровести/редактировать/удалить ──

    def test_document_entry_cannot_be_posted_directly(self):
        # already posted, но проверяем что и на draft document-проводке пост тоже
        # заблокирован по source_document_id, а не только по статусу — переводим
        # эту же проводку в draft напрямую в БД (в обход API) для чистоты теста.
        with tenant_context(self.company):
            JournalEntry.objects.filter(pk=self.document_entry.pk).update(status=JournalEntry.Status.DRAFT)
        response = self._client(self.user).post(f"{JOURNAL_URL}{self.document_entry.pk}/post/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("документ", response.data['detail'].lower())

    def test_document_entry_cannot_be_unposted_directly(self):
        response = self._client(self.user).post(f"{JOURNAL_URL}{self.document_entry.pk}/unpost/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("документ", response.data['detail'].lower())
        with tenant_context(self.company):
            self.document_entry.refresh_from_db()
            self.assertEqual(self.document_entry.status, JournalEntry.Status.POSTED, "статус не должен был измениться")

    def test_document_entry_cannot_be_updated(self):
        payload = {
            'date': '2026-01-10',
            'description': 'hacked',
            'branch': self.branch1.id,
            'lines': [
                {'side': 'debit', 'account': self.acc_dt.id, 'amount': '20.00', 'subcontos': {}},
                {'side': 'credit', 'account': self.acc_kt.id, 'amount': '20.00', 'subcontos': {}},
            ],
        }
        response = self._client(self.user).put(f"{JOURNAL_URL}{self.document_entry.pk}/", payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        with tenant_context(self.company):
            self.document_entry.refresh_from_db()
            self.assertEqual(self.document_entry.description, "", "описание не должно было измениться")

    def test_document_entry_cannot_be_deleted(self):
        response = self._client(self.user).delete(f"{JOURNAL_URL}{self.document_entry.pk}/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        with tenant_context(self.company):
            self.assertTrue(JournalEntry.objects.filter(pk=self.document_entry.pk).exists())

    # ── Ручная проводка продолжает работать как раньше (контроль) ───────────

    def test_manual_entry_can_be_posted_and_unposted(self):
        client = self._client(self.user)
        response = client.post(f"{JOURNAL_URL}{self.manual_entry.pk}/post/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        with tenant_context(self.company):
            self.manual_entry.refresh_from_db()
            self.assertEqual(self.manual_entry.status, JournalEntry.Status.POSTED)

        response = client.post(f"{JOURNAL_URL}{self.manual_entry.pk}/unpost/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        with tenant_context(self.company):
            self.manual_entry.refresh_from_db()
            self.assertEqual(self.manual_entry.status, JournalEntry.Status.DRAFT)

    def test_manual_entry_can_be_deleted(self):
        response = self._client(self.user).delete(f"{JOURNAL_URL}{self.manual_entry.pk}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        with tenant_context(self.company):
            self.assertFalse(JournalEntry.objects.filter(pk=self.manual_entry.pk).exists())
