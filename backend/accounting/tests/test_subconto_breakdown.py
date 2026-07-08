# backend/accounting/tests/test_subconto_breakdown.py
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
from accounting.models import Account, AccountSubconto, Agent, Counterparty, Employee, Position, SubcontoType
from accounting.models.transaction import JournalEntry, TransactionLine

User = get_user_model()

BREAKDOWN_URL = '/api/accounting/journal-entries/subconto-breakdown/'
CARD_URL = '/api/accounting/journal-entries/subconto-card/'


class SubcontoBreakdownTest(TenantTestCase):
    """
    Проверяет GET /journal-entries/subconto-breakdown/ и /subconto-card/ —
    детализация счёта по субконто (drill-down из ОСВ, см. OSVPage.tsx::has_subconto):
    - RBAC (доступ по 'journalentry'/GET);
    - расчёт входящего остатка/оборота/исходящего остатка ПО КАЖДОМУ значению субконто
      отдельно (а не суммарно по счёту, как в osv());
    - только проведённые проводки;
    - карточка (subconto-card) — бегущий остаток по одному значению субконто.
    """

    def setUp(self):
        cache.clear()
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="SubcontoBreakdown Test Co", schema_name="subcontobreakdowntest")
        Domain.objects.create(domain='subcontobreakdowntest.localhost', tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            role = Role.objects.create(name="Viewer")
            perm, _ = Permission.objects.get_or_create(resource="journalentry", action="GET")
            RolePermission.objects.create(role=role, permission=perm)

            self.user_with_access = User.objects.create_user(username="viewer", password="pass")
            UserRole.objects.create(user=self.user_with_access, role=role)

            self.user_no_access = User.objects.create_user(username="noaccess", password="pass")

            self.account_60 = Account.objects.create(code="60", name="Klienty", is_group=False)
            self.other_leaf = Account.objects.create(code="90", name="Revenue", is_group=False)

            subconto_type = SubcontoType.objects.create(
                name="Klienty", slug="Klienty",
                content_type=ContentType.objects.get_for_model(Counterparty),
            )
            AccountSubconto.objects.create(account=self.account_60, subconto_type=subconto_type, order=1)

            position = Position.objects.create(name="Агент")
            employee = Employee.objects.create(full_name="Test Agent", position=position)
            self.agent_profile = Agent.objects.create(employee=employee, district="Rayon")

            self.client_a = Counterparty.objects.create(name="Client A", type="client", agent=self.agent_profile)
            self.client_b = Counterparty.objects.create(name="Client B", type="client")
            # ✅ Ни одной проводки по счёту 60 — должен появляться в breakdown ТОЛЬКО
            # при show_zero=true (см. test_show_zero_includes_counterparties_without_any_transaction).
            self.client_c_no_transactions = Counterparty.objects.create(name="Client C No Transactions", type="client")

            # Client A: 100 Дт до периода (входящий остаток), 50 Дт в периоде
            self._make_entry("PRE-A", "2025-12-15", self.account_60, self.client_a, TransactionLine.Side.DEBIT, Decimal("100.00"))
            self._make_entry("IN-A", "2026-01-10", self.account_60, self.client_a, TransactionLine.Side.DEBIT, Decimal("50.00"))

            # Client B: только в периоде, 30 Кт
            self._make_entry("IN-B", "2026-01-12", self.account_60, self.client_b, TransactionLine.Side.CREDIT, Decimal("30.00"))

            # Черновик — нигде не должен учитываться
            self._make_entry("DRAFT-A", "2026-01-15", self.account_60, self.client_a, TransactionLine.Side.DEBIT, Decimal("999.00"), posted=False)

    def _make_entry(self, number, date_str, account, counterparty, side, amount, posted=True):
        date = timezone.make_aware(datetime.datetime.strptime(date_str, "%Y-%m-%d"))
        entry = JournalEntry.objects.create(
            number=number,
            date=date,
            status=JournalEntry.Status.POSTED if posted else JournalEntry.Status.DRAFT,
        )
        TransactionLine.objects.create(
            journal_entry=entry, order=1, side=side, account=account, amount=amount,
            subcontos={"Klienty": counterparty.id},
        )
        other_side = TransactionLine.Side.CREDIT if side == TransactionLine.Side.DEBIT else TransactionLine.Side.DEBIT
        TransactionLine.objects.create(
            journal_entry=entry, order=2, side=other_side, account=self.other_leaf, amount=amount,
        )
        return entry

    def _client(self, user):
        client = APIClient()
        client.defaults['HTTP_HOST'] = 'subcontobreakdowntest.localhost'
        client.force_authenticate(user=user)
        return client

    def _breakdown(self, user, **params):
        params.setdefault('account', self.account_60.id)
        params.setdefault('subconto_slug', 'Klienty')
        params.setdefault('date_from', '2026-01-01')
        params.setdefault('date_to', '2026-01-31')
        params.setdefault('show_zero', 'true')
        return self._client(user).get(BREAKDOWN_URL, params)

    # ── RBAC ─────────────────────────────────────────────────────────────────

    def test_rbac_denies_without_permission(self):
        response = self._breakdown(self.user_no_access)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_rbac_allows_with_get_permission(self):
        response = self._breakdown(self.user_with_access)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # ── Параметры ────────────────────────────────────────────────────────────

    def test_missing_params_returns_400(self):
        response = self._client(self.user_with_access).get(BREAKDOWN_URL, {'account': self.account_60.id})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unconfigured_subconto_returns_400(self):
        response = self._breakdown(self.user_with_access, subconto_slug='does-not-exist')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ── Расчёт по каждому значению субконто отдельно ─────────────────────────

    def test_breakdown_per_counterparty(self):
        response = self._breakdown(self.user_with_access)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = {row['subconto_label']: row for row in response.data['items']}

        client_a = rows['Client A']
        self.assertEqual(Decimal(str(client_a['opening_debit'])), Decimal('100.00'))
        # Оборот = IN-A (50); DRAFT-A (999) не учитывается
        self.assertEqual(Decimal(str(client_a['debit_turnover'])), Decimal('50.00'))
        self.assertEqual(Decimal(str(client_a['closing_debit'])), Decimal('150.00'))

        client_b = rows['Client B']
        self.assertEqual(Decimal(str(client_b['opening_debit'])), Decimal('0.00'))
        self.assertEqual(Decimal(str(client_b['credit_turnover'])), Decimal('30.00'))
        self.assertEqual(Decimal(str(client_b['closing_credit'])), Decimal('30.00'))

    def test_breakdown_includes_agent_info_for_counterparty_subconto(self):
        response = self._breakdown(self.user_with_access)
        rows = {row['subconto_label']: row for row in response.data['items']}

        self.assertEqual(rows['Client A']['agent_id'], self.agent_profile.id)
        self.assertEqual(rows['Client A']['agent_label'], str(self.agent_profile))
        self.assertIsNone(rows['Client B']['agent_id'])
        self.assertIsNone(rows['Client B']['agent_label'])

    def test_show_zero_includes_counterparties_without_any_transaction(self):
        # По умолчанию (show_zero не передан явно как true в _breakdown — но наш
        # helper ставит show_zero='true' по умолчанию) — переопределяем на false,
        # чтобы проверить именно "скрыто по умолчанию" поведение.
        response = self._breakdown(self.user_with_access, show_zero='false')
        labels = {row['subconto_label'] for row in response.data['items']}
        self.assertNotIn('Client C No Transactions', labels)

        response = self._breakdown(self.user_with_access, show_zero='true')
        labels = {row['subconto_label'] for row in response.data['items']}
        self.assertIn('Client C No Transactions', labels)
        row = next(r for r in response.data['items'] if r['subconto_label'] == 'Client C No Transactions')
        self.assertEqual(Decimal(str(row['opening_debit'])), Decimal('0'))
        self.assertEqual(Decimal(str(row['closing_debit'])), Decimal('0'))

    def test_totals_sum_all_rows(self):
        response = self._breakdown(self.user_with_access)
        totals = response.data['totals']
        self.assertEqual(Decimal(str(totals['opening_debit'])), Decimal('100.00'))
        self.assertEqual(Decimal(str(totals['debit_turnover'])), Decimal('50.00'))
        self.assertEqual(Decimal(str(totals['credit_turnover'])), Decimal('30.00'))

    # ── Карточка (уровень 2) ──────────────────────────────────────────────────

    def test_card_running_balance_for_one_counterparty(self):
        response = self._client(self.user_with_access).get(CARD_URL, {
            'account': self.account_60.id,
            'subconto_slug': 'Klienty',
            'subconto_id': self.client_a.id,
            'date_from': '2026-01-01',
            'date_to': '2026-01-31',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(Decimal(str(data['opening_balance'])), Decimal('100.00'))
        self.assertEqual(len(data['items']), 1)
        self.assertEqual(Decimal(str(data['items'][0]['balance'])), Decimal('150.00'))
        self.assertEqual(Decimal(str(data['closing_balance'])), Decimal('150.00'))
        self.assertEqual(data['subconto_label'], 'Client A')
