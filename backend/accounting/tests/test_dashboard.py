# backend/accounting/tests/test_dashboard.py
import datetime
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
    Branch, CompanyProfile, Counterparty, Document, DocumentItem,
    Product, ProductCategory, Unit, UserScope, Warehouse,
)

User = get_user_model()

URL = '/api/accounting/reports/revenue-by-warehouse/'


class RevenueByWarehouseTest(TenantTestCase):
    """
    Проверяет /reports/revenue-by-warehouse/:
    - RBAC (доступ по 'document'/GET);
    - выручка = сумма Document.total проведённых "out" минус "return_out";
    - разбивка по складам и scope-ограничение пользователя.
    """

    def setUp(self):
        cache.clear()
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="Dashboard Test Co", schema_name="dashboardtest")
        Domain.objects.create(domain='dashboardtest.localhost', tenant=self.company, is_primary=True)

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

            # wh1: продажа на 1000 в периоде
            self._make_doc('out', '2026-01-10', self.wh1, [(self.product, 100, Decimal('10.00'), 0)])
            # wh1: возврат поставщику на 100 в периоде — уменьшает выручку wh1
            self._make_doc('return_out', '2026-01-12', self.wh1, [(self.product, 10, Decimal('10.00'), 0)])
            # wh2: продажа на 500 в периоде
            self._make_doc('out', '2026-01-15', self.wh2, [(self.product, 50, Decimal('10.00'), 0)])
            # wh1: черновик — не должен учитываться
            self._make_doc('out', '2026-01-18', self.wh1, [(self.product, 999, Decimal('10.00'), 0)], posted=False)
            # wh1: продажа ВНЕ периода — не должна учитываться
            self._make_doc('out', '2025-12-01', self.wh1, [(self.product, 999, Decimal('10.00'), 0)])

    def _make_doc(self, document_type, date_str, warehouse, lines, posted=True):
        doc = Document.objects.create(
            document_type=document_type,
            date=date_str,
            warehouse=warehouse,
            branch=warehouse.branch,
            counterparty=self.cp,
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
        client.defaults['HTTP_HOST'] = 'dashboardtest.localhost'
        client.force_authenticate(user=user)
        return client

    def _get(self, user, **params):
        params.setdefault('date_from', '2026-01-01')
        params.setdefault('date_to', '2026-01-31')
        return self._client(user).get(URL, params)

    # ── RBAC ─────────────────────────────────────────────────────────────────

    def test_rbac_denies_without_permission(self):
        response = self._get(self.user_no_access)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_missing_date_params_returns_400(self):
        response = self._client(self.user_with_access).get(URL)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ── Расчёт выручки ───────────────────────────────────────────────────────

    def test_revenue_by_warehouse_math(self):
        response = self._get(self.user_with_access)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        by_wh = {r['warehouse_id']: r for r in response.data['by_warehouse']}
        # wh1: 1000 (out) - 100 (return_out) = 900
        self.assertEqual(by_wh[self.wh1.id]['revenue'], Decimal('900.00'))
        self.assertEqual(by_wh[self.wh1.id]['documents_count'], 1)
        # wh2: 500 (out)
        self.assertEqual(by_wh[self.wh2.id]['revenue'], Decimal('500.00'))
        self.assertEqual(by_wh[self.wh2.id]['documents_count'], 1)

        self.assertEqual(response.data['total_revenue'], Decimal('1400.00'))
        self.assertEqual(response.data['total_documents'], 2)

    def test_draft_and_out_of_period_excluded(self):
        response = self._get(self.user_with_access)
        by_wh = {r['warehouse_id']: r for r in response.data['by_warehouse']}
        # Черновик (999 шт) и документ вне периода (999 шт) не должны попасть в 900
        self.assertEqual(by_wh[self.wh1.id]['revenue'], Decimal('900.00'))

    # ── Scope ────────────────────────────────────────────────────────────────

    def test_scope_restricts_to_users_warehouse(self):
        response = self._get(self.scoped_user)
        by_wh = {r['warehouse_id']: r for r in response.data['by_warehouse']}
        self.assertIn(self.wh1.id, by_wh)
        self.assertNotIn(self.wh2.id, by_wh)
        self.assertEqual(response.data['total_revenue'], Decimal('900.00'))

    def test_unscoped_user_sees_all_warehouses(self):
        response = self._get(self.user_with_access)
        by_wh = {r['warehouse_id']: r for r in response.data['by_warehouse']}
        self.assertIn(self.wh1.id, by_wh)
        self.assertIn(self.wh2.id, by_wh)


class TopProductsAndCounterpartiesTest(TenantTestCase):
    """
    Проверяет /reports/top-products/ и /reports/top-counterparties/:
    - RBAC (доступ по 'document'/GET);
    - лимит топ-5 (из 6 товаров/контрагентов возвращаются только 5, по убыванию выручки);
    - "Расход" учитывается СО скидкой (net), "Возврат поставщику" — БЕЗ скидки (gross),
      как и в product_turnover (см. комментарий в report_views.py::top_products).
    """

    PRODUCTS_URL = '/api/accounting/reports/top-products/'
    COUNTERPARTIES_URL = '/api/accounting/reports/top-counterparties/'

    def setUp(self):
        cache.clear()
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="Top5 Test Co", schema_name="top5test")
        Domain.objects.create(domain='top5test.localhost', tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            role = Role.objects.create(name="Viewer")
            perm, _ = Permission.objects.get_or_create(resource="document", action="GET")
            RolePermission.objects.create(role=role, permission=perm)
            self.user = User.objects.create_user(username="viewer", password="pass")
            UserRole.objects.create(user=self.user, role=role)
            self.user_no_access = User.objects.create_user(username="noaccess", password="pass")

            company_profile = CompanyProfile.objects.create()
            branch = Branch.objects.create(name="Branch 1", company_profile=company_profile)
            self.wh = Warehouse.objects.create(name="WH1", branch=branch)

            unit = Unit.objects.create(name="Штука", short_name="шт")
            category = ProductCategory.objects.create(name="Cat A", slug="cat-a")
            # 6 товаров с разной выручкой — топ-5 должен отсечь самый слабый (P6, 100)
            self.products = [
                Product.objects.create(name=f"P{i+1}", category=category, unit=unit, cost_price=Decimal('1.00'))
                for i in range(6)
            ]
            revenues = [Decimal('600'), Decimal('500'), Decimal('400'), Decimal('300'), Decimal('200'), Decimal('100')]

            self.cp_big = Counterparty.objects.create(name="Big Client")
            self.cp_small = Counterparty.objects.create(name="Small Client")

            doc = Document.objects.create(
                document_type='out', date='2026-02-10', warehouse=self.wh, branch=branch, counterparty=self.cp_big,
            )
            for i, (product, rev) in enumerate(zip(self.products, revenues), start=1):
                DocumentItem.objects.create(
                    document=doc, product=product, unit=unit, line_no=i,
                    quantity=1, price=rev, discount_percent=0, cost_price=product.cost_price,
                )
            Document.objects.filter(pk=doc.pk).update(status='posted')

            # Возврат поставщику по P1 на 50 (без скидки, gross) — должен уменьшить выручку P1 до 550
            return_doc = Document.objects.create(
                document_type='return_out', date='2026-02-12', warehouse=self.wh, branch=branch, counterparty=self.cp_big,
            )
            DocumentItem.objects.create(
                document=return_doc, product=self.products[0], unit=unit, line_no=1,
                quantity=1, price=Decimal('50'), discount_percent=0, cost_price=self.products[0].cost_price,
            )
            Document.objects.filter(pk=return_doc.pk).update(status='posted')

            # Отдельный маленький клиент — 50 выручки, должен уступить cp_big в топ-1
            doc2 = Document.objects.create(
                document_type='out', date='2026-02-11', warehouse=self.wh, branch=branch, counterparty=self.cp_small,
            )
            DocumentItem.objects.create(
                document=doc2, product=self.products[0], unit=unit, line_no=1,
                quantity=1, price=Decimal('50'), discount_percent=0, cost_price=self.products[0].cost_price,
            )
            Document.objects.filter(pk=doc2.pk).update(status='posted')

    def _client(self, user):
        client = APIClient()
        client.defaults['HTTP_HOST'] = 'top5test.localhost'
        client.force_authenticate(user=user)
        return client

    def _get(self, url, user, **params):
        params.setdefault('date_from', '2026-02-01')
        params.setdefault('date_to', '2026-02-28')
        return self._client(user).get(url, params)

    def test_rbac_denies_without_permission(self):
        response = self._get(self.PRODUCTS_URL, self.user_no_access)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        response = self._get(self.COUNTERPARTIES_URL, self.user_no_access)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_top_products_limited_to_five_ordered_desc(self):
        response = self._get(self.PRODUCTS_URL, self.user)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data
        self.assertEqual(len(rows), 5)
        # P6 (100) — самый слабый из 6 — не должен попасть в топ-5
        names = [r['product_name'] for r in rows]
        self.assertNotIn('P6', names)
        # P1: 600 (out, cp_big) + 50 (out, cp_small — тоже покупает P1) - 50 (return_out, gross) = 600
        self.assertEqual(rows[0]['product_name'], 'P1')
        self.assertEqual(rows[0]['revenue'], Decimal('600.00'))

    def test_top_counterparties_math_and_order(self):
        response = self._get(self.COUNTERPARTIES_URL, self.user)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data
        by_name = {r['counterparty_name']: r for r in rows}
        # Big Client: (600+500+400+300+200+100) - 50 (return_out) = 2050
        self.assertEqual(by_name['Big Client']['revenue'], Decimal('2050.00'))
        self.assertEqual(by_name['Big Client']['documents_count'], 1)
        self.assertEqual(by_name['Small Client']['revenue'], Decimal('50.00'))
        # Big Client выше Small Client по выручке
        self.assertEqual(rows[0]['counterparty_name'], 'Big Client')


class TodayDocumentsTest(TenantTestCase):
    """
    Проверяет /reports/today-documents/ (источник данных для бегущей строки):
    - RBAC (доступ по 'document'/GET);
    - только СЕГОДНЯШНИЕ проведённые out/return_out — не вчерашние и не черновики;
    - scope-ограничение по складу пользователя.
    """

    URL = '/api/accounting/reports/today-documents/'

    def setUp(self):
        cache.clear()
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="Ticker Test Co", schema_name="tickertest")
        Domain.objects.create(domain='tickertest.localhost', tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            role = Role.objects.create(name="Viewer")
            perm, _ = Permission.objects.get_or_create(resource="document", action="GET")
            RolePermission.objects.create(role=role, permission=perm)
            self.user = User.objects.create_user(username="viewer", password="pass")
            UserRole.objects.create(user=self.user, role=role)
            self.user_no_access = User.objects.create_user(username="noaccess", password="pass")

            company_profile = CompanyProfile.objects.create()
            self.branch1 = Branch.objects.create(name="Branch 1", company_profile=company_profile)
            self.branch2 = Branch.objects.create(name="Branch 2", company_profile=company_profile)
            self.wh1 = Warehouse.objects.create(name="WH1", branch=self.branch1)
            self.wh2 = Warehouse.objects.create(name="WH2", branch=self.branch2)

            self.scoped_user = User.objects.create_user(username="scoped", password="pass")
            UserRole.objects.create(user=self.scoped_user, role=role)
            UserScope.objects.create(user=self.scoped_user, branch=self.branch1, warehouse=self.wh1)

            unit = Unit.objects.create(name="Штука", short_name="шт")
            category = ProductCategory.objects.create(name="Cat A", slug="cat-a")
            product = Product.objects.create(name="P1", category=category, unit=unit, cost_price=Decimal('1.00'))
            cp = Counterparty.objects.create(name="Ahmed")

            today = datetime.date.today()
            yesterday = today - datetime.timedelta(days=1)

            self.today_doc = self._make_doc('out', today, self.wh1, cp, unit, product)
            self._make_doc('out', yesterday, self.wh1, cp, unit, product)  # вчера — не должен попасть
            self._make_doc('out', today, self.wh1, cp, unit, product, posted=False)  # черновик — не должен попасть
            self.today_doc_wh2 = self._make_doc('out', today, self.wh2, cp, unit, product)  # другой склад

    def _make_doc(self, document_type, date, warehouse, cp, unit, product, posted=True):
        doc = Document.objects.create(
            document_type=document_type, date=date, warehouse=warehouse, branch=warehouse.branch, counterparty=cp,
        )
        DocumentItem.objects.create(
            document=doc, product=product, unit=unit, line_no=1,
            quantity=1, price=Decimal('100.00'), discount_percent=0, cost_price=product.cost_price,
        )
        if posted:
            Document.objects.filter(pk=doc.pk).update(status='posted')
        return doc

    def _client(self, user):
        client = APIClient()
        client.defaults['HTTP_HOST'] = 'tickertest.localhost'
        client.force_authenticate(user=user)
        return client

    def test_rbac_denies_without_permission(self):
        response = self._client(self.user_no_access).get(self.URL)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_only_todays_posted_documents_returned(self):
        response = self._client(self.user).get(self.URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {r['id'] for r in response.data}
        self.assertEqual(ids, {self.today_doc.id, self.today_doc_wh2.id})

    def test_scope_restricts_to_users_warehouse(self):
        response = self._client(self.scoped_user).get(self.URL)
        ids = {r['id'] for r in response.data}
        self.assertEqual(ids, {self.today_doc.id})
