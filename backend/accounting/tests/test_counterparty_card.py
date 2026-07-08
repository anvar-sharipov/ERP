# backend/accounting/tests/test_counterparty_card.py
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
from accounting.models import (
    Account, AccountSubconto, Branch, CompanyProfile, Counterparty, SubcontoType, Warehouse,
)
from accounting.models.transaction import JournalEntry, TransactionLine

User = get_user_model()

CARD_URL = '/api/accounting/documents/counterparty-card/'


class CounterpartyCardTest(TenantTestCase):
    """
    Проверяет GET /documents/counterparty-card/ — мини-карточка сальдо
    контрагента в сайдбаре формы накладной (DocumentFormPage.tsx):
    - RBAC (доступ по 'document'/GET — не 'journalentry', т.к. пользователь,
      создающий накладные, не обязан иметь доступ к журналу проводок);
    - счёт определяется по складу+типу документа (receivable для Расхода,
      payable для Прихода);
    - сальдо на начало дня документа + проводки этого дня + сальдо на конец;
    - available=False, если счёт склада не сконфигурирован или не отслеживает
      контрагентов через субконто (например MOVE — там нет ни receivable, ни
      payable вовсе).
    """

    def setUp(self):
        cache.clear()
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="CounterpartyCard Test Co", schema_name="counterpartycardtest")
        Domain.objects.create(domain='counterpartycardtest.localhost', tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            role = Role.objects.create(name="Viewer")
            perm, _ = Permission.objects.get_or_create(resource="document", action="GET")
            RolePermission.objects.create(role=role, permission=perm)

            self.user_with_access = User.objects.create_user(username="viewer", password="pass")
            UserRole.objects.create(user=self.user_with_access, role=role)

            self.user_no_access = User.objects.create_user(username="noaccess", password="pass")

            company_profile = CompanyProfile.objects.create()
            branch = Branch.objects.create(name="Main Branch", company_profile=company_profile)

            self.receivable_account = Account.objects.create(code="62", name="Klienty", is_group=False)
            self.other_account = Account.objects.create(code="90", name="Revenue", is_group=False)

            subconto_type = SubcontoType.objects.create(
                name="Klienty", slug="Klienty",
                content_type=ContentType.objects.get_for_model(Counterparty),
            )
            AccountSubconto.objects.create(account=self.receivable_account, subconto_type=subconto_type, order=1)

            self.warehouse_with_account = Warehouse.objects.create(name="WH1", branch=branch, receivable_account=self.receivable_account)
            self.warehouse_no_account = Warehouse.objects.create(name="WH2", branch=branch)

            self.client_a = Counterparty.objects.create(name="Client A", type="client")

            # До дня документа — 100 Дт (сальдо на начало)
            self._make_entry("PRE", "2026-01-05", self.client_a)
            # В день документа — ещё 30 Дт (входит в "проводки за день")
            self._make_entry("TODAY", "2026-01-10", self.client_a)

    def _make_entry(self, number, date_str, counterparty, amount=Decimal('30.00')):
        date = timezone.make_aware(datetime.datetime.strptime(date_str, "%Y-%m-%d"))
        entry = JournalEntry.objects.create(
            number=number, date=date, status=JournalEntry.Status.POSTED,
            warehouse=self.warehouse_with_account,
        )
        TransactionLine.objects.create(
            journal_entry=entry, order=1, side=TransactionLine.Side.DEBIT,
            account=self.receivable_account, amount=Decimal('100.00') if number == 'PRE' else amount,
            subcontos={"Klienty": counterparty.id},
        )
        TransactionLine.objects.create(
            journal_entry=entry, order=2, side=TransactionLine.Side.CREDIT,
            account=self.other_account, amount=Decimal('100.00') if number == 'PRE' else amount,
        )
        return entry

    def _client(self, user):
        client = APIClient()
        client.defaults['HTTP_HOST'] = 'counterpartycardtest.localhost'
        client.force_authenticate(user=user)
        return client

    def _card(self, user, **overrides):
        params = {
            'counterparty': self.client_a.id,
            'warehouse': self.warehouse_with_account.id,
            'document_type': 'out',
            'date': '2026-01-10',
        }
        params.update(overrides)
        return self._client(user).get(CARD_URL, params)

    # ── RBAC ─────────────────────────────────────────────────────────────────

    def test_rbac_denies_without_document_permission(self):
        response = self._card(self.user_no_access)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_rbac_allows_with_document_get_permission(self):
        response = self._card(self.user_with_access)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # ── Расчёт ───────────────────────────────────────────────────────────────

    def test_opening_and_closing_balance(self):
        response = self._card(self.user_with_access)
        data = response.data
        self.assertTrue(data['available'])
        self.assertEqual(Decimal(str(data['opening_balance'])), Decimal('100.00'))
        self.assertEqual(len(data['items']), 1)
        self.assertEqual(Decimal(str(data['closing_balance'])), Decimal('130.00'))

    def test_return_in_uses_receivable_account_same_as_out(self):
        response = self._card(self.user_with_access, document_type='return_in')
        data = response.data
        self.assertTrue(data['available'])
        self.assertEqual(Decimal(str(data['opening_balance'])), Decimal('100.00'))

    # ── Недоступность карточки ────────────────────────────────────────────────

    def test_unavailable_when_warehouse_has_no_account_configured(self):
        response = self._card(self.user_with_access, warehouse=self.warehouse_no_account.id)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['available'])

    def test_unavailable_for_move_document_type(self):
        response = self._card(self.user_with_access, document_type='move')
        self.assertFalse(response.data['available'])

    def test_missing_params_returns_400(self):
        response = self._client(self.user_with_access).get(CARD_URL, {'counterparty': self.client_a.id})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
