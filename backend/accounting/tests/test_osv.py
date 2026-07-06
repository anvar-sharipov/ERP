# backend/accounting/tests/test_osv.py
import datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
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

OSV_URL = '/api/accounting/journal-entries/osv/'


class OSVTest(TenantTestCase):
    """
    Проверяет GET /journal-entries/osv/:
    - RBAC (доступ по 'journalentry'/GET, а не по левому ресурсу или методу POST);
    - Data Scoping (пользователь, ограниченный филиалом/складом, не видит чужие обороты);
    - расчёт входящего остатка / оборота / исходящего остатка по листовым счетам;
    - агрегацию счетов-групп из дочерних счетов;
    - скрытие нулевых счетов по умолчанию.
    """

    def setUp(self):
        cache.clear()
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="OSV Test Co", schema_name="osvtest")
        Domain.objects.create(domain='osvtest.localhost', tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            role = Role.objects.create(name="Viewer")
            perm, _ = Permission.objects.get_or_create(resource="journalentry", action="GET")
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

            # Счёт-группа "40" с дочерним листовым счётом "40.1" (для теста rollup),
            # и обычный лист "60" на другой стороне проводок.
            self.group_acc = Account.objects.create(code="40", name="Sklad group", is_group=True)
            self.leaf_acc = Account.objects.create(code="40.1", name="Sklad 1", is_group=False, parent=self.group_acc)
            self.other_leaf = Account.objects.create(code="60", name="Klient", is_group=False)

            # 1) До периода — формирует входящий остаток (100 Дт по 40.1)
            self._make_entry("PRE-1", "2025-12-15", self.branch1, self.wh1, [
                (self.leaf_acc, TransactionLine.Side.DEBIT, Decimal("100.00")),
                (self.other_leaf, TransactionLine.Side.CREDIT, Decimal("100.00")),
            ], posted=True)

            # 2) Внутри периода, branch1/wh1 — должна попасть в оборот всем пользователям
            self._make_entry("IN-PERIOD-1", "2026-01-10", self.branch1, self.wh1, [
                (self.leaf_acc, TransactionLine.Side.DEBIT, Decimal("50.00")),
                (self.other_leaf, TransactionLine.Side.CREDIT, Decimal("50.00")),
            ], posted=True)

            # 3) Внутри периода, но ЧЕРНОВИК — нигде не должна учитываться
            self._make_entry("DRAFT-1", "2026-01-15", self.branch1, self.wh1, [
                (self.leaf_acc, TransactionLine.Side.DEBIT, Decimal("999.00")),
                (self.other_leaf, TransactionLine.Side.CREDIT, Decimal("999.00")),
            ], posted=False)

            # 4) Внутри периода, branch2/wh2 — НЕ должна быть видна scoped_user (только branch1/wh1)
            self._make_entry("IN-PERIOD-2", "2026-01-12", self.branch2, self.wh2, [
                (self.leaf_acc, TransactionLine.Side.DEBIT, Decimal("30.00")),
                (self.other_leaf, TransactionLine.Side.CREDIT, Decimal("30.00")),
            ], posted=True)

    def _make_entry(self, number, date_str, branch, warehouse, lines, posted):
        date = timezone.make_aware(datetime.datetime.strptime(date_str, "%Y-%m-%d"))
        entry = JournalEntry.objects.create(
            number=number,
            date=date,
            status=JournalEntry.Status.POSTED if posted else JournalEntry.Status.DRAFT,
            branch=branch,
            warehouse=warehouse,
        )
        for order, (account, side, amount) in enumerate(lines, start=1):
            TransactionLine.objects.create(
                journal_entry=entry, order=order, side=side, account=account, amount=amount,
            )
        return entry

    def _client(self, user):
        client = APIClient()
        client.defaults['HTTP_HOST'] = 'osvtest.localhost'
        client.force_authenticate(user=user)
        return client

    def _osv(self, user, **params):
        params.setdefault('date_from', '2026-01-01')
        params.setdefault('date_to', '2026-01-31')
        params.setdefault('show_zero', 'true')
        return self._client(user).get(OSV_URL, params)

    # ── RBAC ─────────────────────────────────────────────────────────────────

    def test_rbac_denies_without_permission(self):
        response = self._osv(self.user_no_access)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_rbac_allows_with_get_permission(self):
        response = self._osv(self.user_with_access)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # ── Параметры ────────────────────────────────────────────────────────────

    def test_missing_date_params_returns_400(self):
        response = self._client(self.user_with_access).get(OSV_URL)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ── Расчёт остатков/оборотов ─────────────────────────────────────────────

    def test_opening_turnover_closing_for_leaf_account(self):
        response = self._osv(self.user_with_access)
        rows = {row['code']: row for row in response.data}
        leaf = rows['40.1']

        self.assertEqual(Decimal(leaf['opening_debit']), Decimal('100.00'))
        self.assertEqual(Decimal(leaf['opening_credit']), Decimal('0.00'))
        # Оборот = IN-PERIOD-1 (50) + IN-PERIOD-2 (30); DRAFT-1 (999) не учитывается
        self.assertEqual(Decimal(leaf['debit_turnover']), Decimal('80.00'))
        self.assertEqual(Decimal(leaf['closing_debit']), Decimal('180.00'))

    def test_group_account_rolls_up_children(self):
        response = self._osv(self.user_with_access)
        rows = {row['code']: row for row in response.data}
        group, leaf = rows['40'], rows['40.1']

        self.assertTrue(group['is_group'])
        self.assertEqual(Decimal(group['opening_debit']), Decimal(leaf['opening_debit']))
        self.assertEqual(Decimal(group['debit_turnover']), Decimal(leaf['debit_turnover']))
        self.assertEqual(Decimal(group['closing_debit']), Decimal(leaf['closing_debit']))
        self.assertEqual(group['depth'], 0)
        self.assertEqual(leaf['depth'], 1)

    def test_hide_zero_accounts_by_default(self):
        with tenant_context(self.company):
            Account.objects.create(code="99", name="Empty", is_group=False)

        response = self._client(self.user_with_access).get(
            OSV_URL, {'date_from': '2026-01-01', 'date_to': '2026-01-31'},  # show_zero не передан → false
        )
        codes = [row['code'] for row in response.data]
        self.assertNotIn('99', codes)

    # ── Data Scoping ─────────────────────────────────────────────────────────

    def test_scope_restricts_totals_to_users_branch(self):
        response = self._osv(self.scoped_user)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = {row['code']: row for row in response.data}
        leaf = rows['40.1']

        # scoped_user видит только branch1/wh1 — PRE-1 (100) и IN-PERIOD-1 (50),
        # но не IN-PERIOD-2 (30, branch2/wh2).
        self.assertEqual(Decimal(leaf['opening_debit']), Decimal('100.00'))
        self.assertEqual(Decimal(leaf['debit_turnover']), Decimal('50.00'))

    def test_unscoped_user_sees_all_branches(self):
        response = self._osv(self.user_with_access)
        rows = {row['code']: row for row in response.data}
        leaf = rows['40.1']

        self.assertEqual(Decimal(leaf['debit_turnover']), Decimal('80.00'))
