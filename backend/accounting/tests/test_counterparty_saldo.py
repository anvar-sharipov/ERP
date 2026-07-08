# backend/accounting/tests/test_counterparty_saldo.py
import datetime
import json
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
from accounting.models import Account, AccountSubconto, Counterparty, SubcontoType
from accounting.models.transaction import JournalEntry, TransactionLine

User = get_user_model()


class CounterpartySaldoTest(TenantTestCase):
    """
    Проверяет GET /counterparties/<id>/saldo/ — сальдо контрагента за период для
    модалки по двойному клику/Enter на строке в CounterpartiesPage.tsx (вместо
    формы редактирования). В отличие от counterparty-card (день+счёт конкретного
    документа), здесь диапазон дат и ВСЕ счета, где у контрагента настроено
    субконто "Контрагенты" — обычно один (62 "Клиенты"), но проверяем, что
    находится по конфигурации, а не хардкодом.
    """

    def setUp(self):
        cache.clear()
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="CounterpartySaldo Test Co", schema_name="counterpartysaldotest")
        Domain.objects.create(domain='counterpartysaldotest.localhost', tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            role = Role.objects.create(name="Viewer")
            perm, _ = Permission.objects.get_or_create(resource="counterparty", action="GET")
            RolePermission.objects.create(role=role, permission=perm)

            self.user_with_access = User.objects.create_user(username="viewer", password="pass")
            UserRole.objects.create(user=self.user_with_access, role=role)

            self.user_no_access = User.objects.create_user(username="noaccess", password="pass")

            self.receivable_account = Account.objects.create(code="62", name="Klienty", is_group=False)
            self.other_account = Account.objects.create(code="90", name="Revenue", is_group=False)

            subconto_type = SubcontoType.objects.create(
                name="Klienty", slug="Klienty",
                content_type=ContentType.objects.get_for_model(Counterparty),
            )
            AccountSubconto.objects.create(account=self.receivable_account, subconto_type=subconto_type, order=1)

            self.client_a = Counterparty.objects.create(name="Client A", type="client")
            self.client_b = Counterparty.objects.create(name="Client B", type="client")
            self.client_no_activity = Counterparty.objects.create(name="Client No Activity", type="client")

            self._make_entry("PRE", "2026-01-01", self.client_a, Decimal('100.00'))
            self._make_entry("IN_RANGE", "2026-01-10", self.client_a, Decimal('30.00'))
            self._make_entry("OTHER_CLIENT", "2026-01-10", self.client_b, Decimal('50.00'))

    def _make_entry(self, number, date_str, counterparty, amount):
        date = timezone.make_aware(datetime.datetime.strptime(date_str, "%Y-%m-%d"))
        entry = JournalEntry.objects.create(number=number, date=date, status=JournalEntry.Status.POSTED)
        TransactionLine.objects.create(
            journal_entry=entry, order=1, side=TransactionLine.Side.DEBIT,
            account=self.receivable_account, amount=amount,
            subcontos={"Klienty": counterparty.id},
        )
        TransactionLine.objects.create(
            journal_entry=entry, order=2, side=TransactionLine.Side.CREDIT,
            account=self.other_account, amount=amount,
        )
        return entry

    def _client(self, user):
        client = APIClient()
        client.defaults['HTTP_HOST'] = 'counterpartysaldotest.localhost'
        client.force_authenticate(user=user)
        return client

    def _saldo(self, user, counterparty_id, **params):
        params.setdefault('date_from', '2026-01-02')
        params.setdefault('date_to', '2026-01-31')
        return self._client(user).get(f'/api/accounting/counterparties/{counterparty_id}/saldo/', params)

    def test_rbac_denies_without_counterparty_permission(self):
        response = self._saldo(self.user_no_access, self.client_a.id)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_missing_dates_returns_400(self):
        response = self._client(self.user_with_access).get(f'/api/accounting/counterparties/{self.client_a.id}/saldo/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_finds_configured_account_and_computes_balance(self):
        response = self._saldo(self.user_with_access, self.client_a.id)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data['counterparty_name'], 'Client A')
        self.assertEqual(len(data['accounts']), 1)
        acc = data['accounts'][0]
        self.assertEqual(acc['account_code'], '62')
        self.assertEqual(Decimal(str(acc['opening_balance'])), Decimal('100.00'))
        self.assertEqual(len(acc['items']), 1)
        self.assertEqual(Decimal(str(acc['closing_balance'])), Decimal('130.00'))

    def test_only_this_counterpartys_entries_counted(self):
        response = self._saldo(self.user_with_access, self.client_b.id, date_from='2026-01-02', date_to='2026-01-31')
        acc = response.data['accounts'][0]
        # У Client B нет проводок до 2026-01-02, только одна в диапазоне (50.00)
        self.assertEqual(Decimal(str(acc['opening_balance'])), Decimal('0'))
        self.assertEqual(len(acc['items']), 1)
        self.assertEqual(Decimal(str(acc['closing_balance'])), Decimal('50.00'))


class CounterpartyBulkSaldoTest(TenantTestCase):
    """
    Проверяет GET /counterparties/bulk-saldo/ — массовое сальдо ВСЕХ контрагентов
    за период одним запросом (для мини-колонки "Сальдо" в CounterpartiesPage.tsx,
    тот же паттерн, что и ProductsListPage.tsx::Turnovers).
    """

    def setUp(self):
        cache.clear()
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="BulkSaldo Test Co", schema_name="bulksaldotest")
        Domain.objects.create(domain='bulksaldotest.localhost', tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            role = Role.objects.create(name="Viewer")
            perm, _ = Permission.objects.get_or_create(resource="counterparty", action="GET")
            RolePermission.objects.create(role=role, permission=perm)

            self.user_with_access = User.objects.create_user(username="viewer", password="pass")
            UserRole.objects.create(user=self.user_with_access, role=role)

            self.user_no_access = User.objects.create_user(username="noaccess", password="pass")

            self.receivable_account = Account.objects.create(code="62", name="Klienty", is_group=False)
            self.other_account = Account.objects.create(code="90", name="Revenue", is_group=False)

            subconto_type = SubcontoType.objects.create(
                name="Klienty", slug="Klienty",
                content_type=ContentType.objects.get_for_model(Counterparty),
            )
            AccountSubconto.objects.create(account=self.receivable_account, subconto_type=subconto_type, order=1)

            self.client_a = Counterparty.objects.create(name="Client A", type="client")
            self.client_b = Counterparty.objects.create(name="Client B", type="client")
            self.client_no_activity = Counterparty.objects.create(name="Client No Activity", type="client")

            self._make_entry("A_PRE", "2026-01-01", self.client_a, Decimal('100.00'))
            self._make_entry("A_IN_RANGE", "2026-01-10", self.client_a, Decimal('30.00'))
            self._make_entry("B_IN_RANGE", "2026-01-15", self.client_b, Decimal('50.00'))

    def _make_entry(self, number, date_str, counterparty, amount):
        date = timezone.make_aware(datetime.datetime.strptime(date_str, "%Y-%m-%d"))
        entry = JournalEntry.objects.create(number=number, date=date, status=JournalEntry.Status.POSTED)
        TransactionLine.objects.create(
            journal_entry=entry, order=1, side=TransactionLine.Side.DEBIT,
            account=self.receivable_account, amount=amount,
            subcontos={"Klienty": counterparty.id},
        )
        TransactionLine.objects.create(
            journal_entry=entry, order=2, side=TransactionLine.Side.CREDIT,
            account=self.other_account, amount=amount,
        )
        return entry

    def _client(self, user):
        client = APIClient()
        client.defaults['HTTP_HOST'] = 'bulksaldotest.localhost'
        client.force_authenticate(user=user)
        return client

    def _bulk_saldo(self, user, **params):
        params.setdefault('date_from', '2026-01-02')
        params.setdefault('date_to', '2026-01-31')
        return self._client(user).get('/api/accounting/counterparties/bulk-saldo/', params)

    def test_rbac_denies_without_counterparty_permission(self):
        response = self._bulk_saldo(self.user_no_access)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_missing_dates_returns_400(self):
        response = self._client(self.user_with_access).get('/api/accounting/counterparties/bulk-saldo/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_returns_correct_balances_for_all_counterparties_in_one_call(self):
        response = self._bulk_saldo(self.user_with_access)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = json.loads(response.content)

        a = data[str(self.client_a.id)]
        self.assertEqual(Decimal(str(a['opening_balance'])), Decimal('100.00'))
        self.assertEqual(Decimal(str(a['total_debit'])), Decimal('30.00'))
        self.assertEqual(Decimal(str(a['closing_balance'])), Decimal('130.00'))

        b = data[str(self.client_b.id)]
        self.assertEqual(Decimal(str(b['opening_balance'])), Decimal('0'))
        self.assertEqual(Decimal(str(b['closing_balance'])), Decimal('50.00'))

    def test_counterparty_without_any_entries_absent_from_result(self):
        response = self._bulk_saldo(self.user_with_access)
        data = json.loads(response.content)
        self.assertNotIn(str(self.client_no_activity.id), data)
