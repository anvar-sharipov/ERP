# backend/accounting/tests/test_product_turnover.py
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
    Account, Branch, CompanyProfile, Counterparty, Document, DocumentItem,
    Product, ProductCategory, Unit, UserScope, Warehouse,
)

User = get_user_model()

LIST_URL = '/api/accounting/reports/product-turnover/'
DETAIL_URL = '/api/accounting/reports/product-turnover-detail/'


class ProductTurnoverTest(TenantTestCase):
    """
    Проверяет /reports/product-turnover(-detail)/:
    - RBAC (доступ по 'document'/GET);
    - Data Scoping (пользователь, ограниченный складом, не видит чужие обороты);
    - расчёт начального/оборотов/конечного остатка (приход/возврат/расход со
      скидкой/возврат поставщику/перемещение), по фактическим ценам документов;
    - согласованность расчёта остатка между списком и детализацией.
    """

    def setUp(self):
        cache.clear()
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="Turnover Test Co", schema_name="turnovertest")
        Domain.objects.create(domain='turnovertest.localhost', tenant=self.company, is_primary=True)

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

            self.category = ProductCategory.objects.create(name="Cat A", slug="cat-a")
            self.unit = Unit.objects.create(name="Штука", short_name="шт")
            self.product = Product.objects.create(
                name="Test product", category=self.category, unit=self.unit, cost_price=Decimal("10.00"),
            )
            self.cp = Counterparty.objects.create(name="Ahmed")

            # 1) До периода — формирует начальный остаток (100 шт по 10 = 1000)
            self._make_doc('in', '2025-12-15', self.wh1, None, [(self.product, 100, Decimal('10.00'), 0)])

            # 2) Приход в периоде
            self._make_doc('in', '2026-01-05', self.wh1, None, [(self.product, 50, Decimal('10.00'), 0)])

            # 3) Расход в периоде со скидкой 10%
            self._make_doc('out', '2026-01-10', self.wh1, None, [(self.product, 30, Decimal('15.00'), 10)])

            # 4) Возврат от покупателя в периоде
            self._make_doc('return_in', '2026-01-12', self.wh1, None, [(self.product, 5, Decimal('12.00'), 0)])

            # 5) Возврат поставщику в периоде
            self._make_doc('return_out', '2026-01-14', self.wh1, None, [(self.product, 3, Decimal('8.00'), 0)])

            # 6) Перемещение wh1 -> wh2 в периоде
            self._make_doc('move', '2026-01-16', self.wh1, self.wh2, [(self.product, 10, Decimal('10.00'), 0)])

            # 7) Черновик — не должен учитываться нигде
            self._make_doc('out', '2026-01-18', self.wh1, None, [(self.product, 999, Decimal('15.00'), 0)], posted=False)

            # 8) Отдельный документ только на wh2 — не должен быть виден scoped_user (только wh1)
            self._make_doc('in', '2026-01-08', self.wh2, None, [(self.product, 40, Decimal('9.00'), 0)])

    def _make_doc(self, document_type, date_str, warehouse, warehouse_to, lines, posted=True):
        doc = Document.objects.create(
            document_type=document_type,
            date=date_str,
            warehouse=warehouse,
            warehouse_to=warehouse_to,
            branch=warehouse.branch if warehouse else None,
            counterparty=self.cp if document_type in ('in', 'out', 'return_in', 'return_out') else None,
        )
        for i, (product, qty, price, discount_percent) in enumerate(lines, start=1):
            DocumentItem.objects.create(
                document=doc, product=product, unit=product.unit, line_no=i,
                quantity=qty, price=price, discount_percent=discount_percent, cost_price=product.cost_price,
            )
        if posted:
            Document.objects.filter(pk=doc.pk).update(status='posted')
        return doc

    def _client(self, user):
        client = APIClient()
        client.defaults['HTTP_HOST'] = 'turnovertest.localhost'
        client.force_authenticate(user=user)
        return client

    def _list(self, user, **params):
        params.setdefault('date_from', '2026-01-01')
        params.setdefault('date_to', '2026-01-31')
        return self._client(user).get(LIST_URL, params)

    def _detail(self, user, product_id, **params):
        params.setdefault('date_from', '2026-01-01')
        params.setdefault('date_to', '2026-01-31')
        params['product'] = product_id
        return self._client(user).get(DETAIL_URL, params)

    # ── RBAC ─────────────────────────────────────────────────────────────────

    def test_rbac_denies_without_permission(self):
        response = self._list(self.user_no_access, warehouse=self.wh1.id)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_rbac_allows_with_get_permission(self):
        response = self._list(self.user_with_access, warehouse=self.wh1.id)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_missing_date_params_returns_400(self):
        response = self._client(self.user_with_access).get(LIST_URL, {'warehouse': self.wh1.id})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ── Расчёт оборотов (склад wh1) ──────────────────────────────────────────

    def test_turnover_math_for_single_warehouse(self):
        response = self._list(self.user_with_access, warehouse=self.wh1.id)
        rows = {r['id']: r for r in response.data}
        row = rows[self.product.id]

        self.assertEqual(row['opening_qty'], Decimal('100.000'))
        self.assertEqual(row['opening_value'], Decimal('1000.00000'))

        self.assertEqual(row['in_qty'], Decimal('50.000'))
        self.assertEqual(row['in_value'], Decimal('500.00000'))

        self.assertEqual(row['return_in_qty'], Decimal('5.000'))
        self.assertEqual(row['return_in_value'], Decimal('60.00000'))

        # Расход: 30 * 15 = 450 до скидки; скидка 10% = 45; после скидки = 405
        self.assertEqual(row['out_qty'], Decimal('30.000'))
        self.assertEqual(row['out_before_discount'], Decimal('450.00000'))
        self.assertEqual(row['out_discount'], Decimal('45.000000'))
        self.assertEqual(row['out_after_discount'], Decimal('405.000000'))

        self.assertEqual(row['return_out_qty'], Decimal('3.000'))
        self.assertEqual(row['return_out_value'], Decimal('24.00000'))

        # Перемещение wh1->wh2: для wh1 это отток
        self.assertEqual(row['move_qty'], Decimal('-10.000'))
        self.assertEqual(row['move_value'], Decimal('-100.00000'))

        # closing_qty = 100 + 50 + 5 - 30 - 3 - 10 = 112
        self.assertEqual(row['closing_qty'], Decimal('112.000'))
        # closing_value = 1000 + 500 + 60 - 405 - 24 - 100 = 1031
        self.assertEqual(row['closing_value'], Decimal('1031.000000'))

    def test_draft_document_excluded(self):
        response = self._list(self.user_with_access, warehouse=self.wh1.id)
        row = {r['id']: r for r in response.data}[self.product.id]
        # Черновик на 999 шт не должен повлиять на out_qty (иначе было бы 999+30)
        self.assertEqual(row['out_qty'], Decimal('30.000'))

    def test_list_and_detail_closing_value_agree(self):
        list_resp = self._list(self.user_with_access, warehouse=self.wh1.id)
        list_row = {r['id']: r for r in list_resp.data}[self.product.id]

        detail_resp = self._detail(self.user_with_access, self.product.id, warehouse=self.wh1.id)
        self.assertEqual(detail_resp.status_code, status.HTTP_200_OK)

        self.assertEqual(list_row['closing_qty'], detail_resp.data['end']['quantity'])
        self.assertEqual(list_row['closing_value'], detail_resp.data['end']['value'])

    # ── Data Scoping ─────────────────────────────────────────────────────────

    def test_scope_restricts_to_users_warehouse(self):
        response = self._list(self.scoped_user)  # без явного warehouse — берётся scope
        rows = {r['id']: r for r in response.data}
        row = rows[self.product.id]
        # scoped_user видит только wh1 — те же цифры, что и явный warehouse=wh1.id
        self.assertEqual(row['closing_qty'], Decimal('112.000'))

    def test_unscoped_user_without_warehouse_sees_both_warehouses(self):
        response = self._list(self.user_with_access)  # без warehouse — весь scope (оба склада)
        row = {r['id']: r for r in response.data}[self.product.id]
        # wh2 получил +10 (перемещение) и +40 (отдельный приход) = +50 к closing_qty относительно wh1-only (112)
        self.assertEqual(row['closing_qty'], Decimal('162.000'))
