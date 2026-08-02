# backend/accounting/tests/test_universal_filter.py
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connection
from django_tenants.test.cases import TenantTestCase
from django_tenants.utils import tenant_context
from rest_framework import status
from rest_framework.test import APIClient

from companies.models import Company, Domain
from users.models import Permission, Role, RolePermission, UserRole
from accounting.models import (
    Agent, Branch, CompanyProfile, Counterparty, Document, DocumentItem,
    DocumentParticipant, Employee, Position, Product, ProductCategory,
    Unit, UserScope, Warehouse,
)

User = get_user_model()

URL = '/api/accounting/reports/universal-filter/'
DATE_FROM = '2026-01-01'
DATE_TO = '2026-01-31'


class UniversalFilterTest(TenantTestCase):
    """
    /reports/universal-filter/ (см. UniversalFilterPage.tsx, план фичи) —
    гибкий отчёт-конструктор по документам: RBAC/scope/agent-scope,
    корректность плоского и группированного режимов, has_profit-gating,
    и отдельно — регрессия на фан-аут строк при фильтре по сотруднику
    (см. _aggregate_universal_filter_by_employee в report_views.py).
    """

    def setUp(self):
        cache.clear()
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="UniversalFilter Test Co", schema_name="universalfiltertest")
        Domain.objects.create(domain='universalfiltertest.localhost', tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            viewer_role, _ = Role.objects.get_or_create(name="Viewer")
            perm, _ = Permission.objects.get_or_create(resource="document", action="GET")
            RolePermission.objects.get_or_create(role=viewer_role, permission=perm)

            self.user = User.objects.create_user(username="viewer", password="pass")
            UserRole.objects.create(user=self.user, role=viewer_role)

            self.no_perm_user = User.objects.create_user(username="noperm", password="pass")

            self.scoped_user = User.objects.create_user(username="scoped", password="pass")
            UserRole.objects.create(user=self.scoped_user, role=viewer_role)

            agent_role, _ = Role.objects.get_or_create(name="Агент")
            RolePermission.objects.get_or_create(role=agent_role, permission=perm)
            self.agent_user = User.objects.create_user(username="agent1", password="pass")
            UserRole.objects.create(user=self.agent_user, role=agent_role)
            position, _ = Position.objects.get_or_create(name="Агент")
            agent_employee = Employee.objects.create(full_name="Agent Emp", position=position, user=self.agent_user)
            agent_profile = Agent.objects.create(employee=agent_employee, district="Rayon")

            company_profile = CompanyProfile.objects.create()
            branch = Branch.objects.create(name="Main Branch", company_profile=company_profile)
            self.wh1 = Warehouse.objects.create(name="WH1", branch=branch)
            self.wh2 = Warehouse.objects.create(name="WH2", branch=branch)
            UserScope.objects.create(user=self.scoped_user, warehouse=self.wh1)

            unit = Unit.objects.create(name="Штука", short_name="шт")
            category = ProductCategory.objects.create(name="Cat A", slug="cat-a")
            self.p1 = Product.objects.create(name="P1", category=category, unit=unit, cost_price=Decimal('80'))
            self.p2 = Product.objects.create(name="P2", category=category, unit=unit, cost_price=Decimal('100'))

            self.cp1 = Counterparty.objects.create(name="CP1")
            self.cp2 = Counterparty.objects.create(name="CP2")
            self.cp_agent = Counterparty.objects.create(name="Agent's Client", agent=agent_profile)

            self.seller = Employee.objects.create(full_name="Seller One", position=position)

            self.branch = branch

            # 1) Приход p1 на wh1 — для has_profit=False / плоского режима
            self.doc_in = self._make_doc('in', self.wh1, self.cp1, [(self.p1, 10, Decimal('100'), 0)])

            # 2) Расход p1 на wh1, 2 роли ОДНОГО сотрудника (seller) — регрессия на фан-аут
            self.doc_out_a = self._make_doc('out', self.wh1, self.cp1, [(self.p1, 4, Decimal('150'), 0)])
            DocumentParticipant.objects.create(document=self.doc_out_a, employee=self.seller, role='seller')
            DocumentParticipant.objects.create(document=self.doc_out_a, employee=self.seller, role='logist')

            # 3) Второй расход p1 на wh1 — для проверки group_by=product (суммирование по 2 документам)
            self.doc_out_b = self._make_doc('out', self.wh1, self.cp1, [(self.p1, 6, Decimal('150'), 0)])

            # 4) Расход на wh2 — не должен быть виден scoped_user (только wh1)
            self.doc_out_wh2 = self._make_doc('out', self.wh2, self.cp2, [(self.p2, 2, Decimal('200'), 0)])

            # 5) Расход клиенту агента — виден только agent_user (и обычным пользователям)
            self.doc_agent = self._make_doc('out', self.wh1, self.cp_agent, [(self.p1, 1, Decimal('150'), 0)])

    def _make_doc(self, document_type, warehouse, counterparty, lines):
        doc = Document.objects.create(
            document_type=document_type, date='2026-01-05',
            warehouse=warehouse, branch=warehouse.branch, counterparty=counterparty,
        )
        for i, (product, qty, price, discount_percent) in enumerate(lines, start=1):
            DocumentItem.objects.create(
                document=doc, product=product, unit=product.unit, line_no=i,
                quantity=qty, price=price, discount_percent=discount_percent, cost_price=product.cost_price,
            )
        Document.objects.filter(pk=doc.pk).update(status='posted')
        return doc

    def _client(self, user):
        client = APIClient()
        client.defaults['HTTP_HOST'] = 'universalfiltertest.localhost'
        client.force_authenticate(user=user)
        return client

    # ── RBAC ─────────────────────────────────────────────────────────────────

    def test_rbac_denied_without_document_permission(self):
        response = self._client(self.no_perm_user).get(URL, {'date_from': DATE_FROM, 'date_to': DATE_TO})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_rbac_allowed_response_shape(self):
        response = self._client(self.user).get(URL, {'date_from': DATE_FROM, 'date_to': DATE_TO})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for key in ('domain', 'group_by', 'has_profit', 'rows', 'totals'):
            self.assertIn(key, response.data)

    # ── Плоский режим / группировка ─────────────────────────────────────────

    def test_flat_mode_in_document(self):
        response = self._client(self.user).get(URL, {
            'date_from': DATE_FROM, 'date_to': DATE_TO,
            'document_type': 'in', 'warehouse': str(self.wh1.id),
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data['rows']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['document_id'], self.doc_in.id)
        self.assertEqual(Decimal(rows[0]['quantity']), Decimal('10'))
        self.assertEqual(Decimal(rows[0]['amount']), Decimal('1000.00'))
        self.assertFalse(response.data['has_profit'])
        self.assertNotIn('profit', rows[0])

    def test_group_by_product_sums_across_documents(self):
        response = self._client(self.user).get(URL, {
            'date_from': DATE_FROM, 'date_to': DATE_TO,
            'document_type': 'out', 'warehouse': str(self.wh1.id),
            'counterparty': str(self.cp1.id), 'group_by': 'product',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data['rows']
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row['group_id'], self.p1.id)
        # doc_out_a (qty4) + doc_out_b (qty6) — сумма по 2 документам, не дублирование
        self.assertEqual(Decimal(row['quantity']), Decimal('10'))
        self.assertEqual(Decimal(row['amount']), Decimal('1500.00'))
        self.assertEqual(row['documents_count'], 2)

    # ── has_profit gating ────────────────────────────────────────────────────

    def test_has_profit_false_for_purchase_types(self):
        response = self._client(self.user).get(URL, {
            'date_from': DATE_FROM, 'date_to': DATE_TO, 'document_type': 'in',
        })
        self.assertFalse(response.data['has_profit'])

    def test_has_profit_true_and_computed_for_sales_types(self):
        response = self._client(self.user).get(URL, {
            'date_from': DATE_FROM, 'date_to': DATE_TO,
            'document_type': 'out', 'warehouse': str(self.wh1.id),
            'counterparty': str(self.cp1.id), 'group_by': 'none',
        })
        self.assertTrue(response.data['has_profit'])
        rows = {r['document_id']: r for r in response.data['rows']}
        # doc_out_a: qty4 * (price150 - cost80) = 4*70 = 280
        self.assertEqual(Decimal(rows[self.doc_out_a.id]['profit']), Decimal('280.00'))
        # doc_out_b: qty6 * (price150 - cost80) = 6*70 = 420
        self.assertEqual(Decimal(rows[self.doc_out_b.id]['profit']), Decimal('420.00'))

    # ── Фильтр по сотруднику — без фан-аута ─────────────────────────────────

    def test_employee_filter_does_not_duplicate_rows(self):
        response = self._client(self.user).get(URL, {
            'date_from': DATE_FROM, 'date_to': DATE_TO,
            'document_type': 'out', 'warehouse': str(self.wh1.id),
            'product': str(self.p1.id), 'employee': str(self.seller.id),
            'group_by': 'none',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data['rows']
        # doc_out_a имеет 2 роли ОДНОГО сотрудника — наивный join дал бы 2 строки
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['document_id'], self.doc_out_a.id)

    # ── Scope ────────────────────────────────────────────────────────────────

    def test_scoped_user_cannot_see_other_warehouse_via_explicit_param(self):
        response = self._client(self.scoped_user).get(URL, {
            'date_from': DATE_FROM, 'date_to': DATE_TO, 'warehouse': str(self.wh2.id),
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['rows'], [])

    def test_scoped_user_sees_own_warehouse(self):
        response = self._client(self.scoped_user).get(URL, {
            'date_from': DATE_FROM, 'date_to': DATE_TO, 'warehouse': str(self.wh1.id),
        })
        self.assertGreater(len(response.data['rows']), 0)

    # ── Agent scope ──────────────────────────────────────────────────────────

    def test_agent_sees_only_own_counterparty_when_grouped_by_counterparty(self):
        response = self._client(self.agent_user).get(URL, {
            'date_from': DATE_FROM, 'date_to': DATE_TO,
            'document_type': 'out', 'group_by': 'counterparty',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        group_ids = {r['group_id'] for r in response.data['rows']}
        self.assertEqual(group_ids, {self.cp_agent.id})

    # ── domain reserved param ───────────────────────────────────────────────

    def test_unsupported_domain_returns_400(self):
        response = self._client(self.user).get(URL, {
            'date_from': DATE_FROM, 'date_to': DATE_TO, 'domain': 'transactions',
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
