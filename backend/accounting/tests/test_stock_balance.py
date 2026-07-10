# backend/accounting/tests/test_stock_balance.py
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
    Product, ProductCategory, Unit, Warehouse, WarehouseStock,
)

User = get_user_model()

URL = '/api/accounting/reports/stock-balance/'


class StockBalanceIsLowTest(TenantTestCase):
    """
    Проверяет /reports/stock-balance/::is_low:
    - товар с реальным остатком (строка WarehouseStock) ниже min_stock_level
      И с историей в накладных — is_low=True;
    - товар с такой же строкой WarehouseStock ниже порога, но БЕЗ единой строки
      в накладных когда-либо (например заведён массовым импортом) — is_low=False
      (тот же баг, что и был в accounting/tasks.py::_check_low_stock — раньше
      проверка "есть ли оборот" применялась только к товарам вообще без строк
      WarehouseStock, а не универсально, из-за чего в ProductsListPage
      подсвечивалось намного больше товаров, чем реальных алертов в колокольчике);
    - товар без остатка/резерва, но с историей в накладных (хоть где-то,
      неважно проведена ли) — is_low=True (настоящая нехватка);
    - товар без остатка/резерва И без единой строки в накладных когда-либо —
      is_low=False (никогда не заказывали/продавали — не "нехватка", а просто
      неиспользуемый товар, алерт по нему был бы шумом).
    """

    def setUp(self):
        cache.clear()
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="StockBalance Test Co", schema_name="stockbalancetest")
        Domain.objects.create(domain='stockbalancetest.localhost', tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            role = Role.objects.create(name="Viewer")
            perm, _ = Permission.objects.get_or_create(resource="warehousestock", action="GET")
            RolePermission.objects.create(role=role, permission=perm)
            self.user = User.objects.create_user(username="viewer", password="pass")
            UserRole.objects.create(user=self.user, role=role)

            company_profile = CompanyProfile.objects.create()
            branch = Branch.objects.create(name="Branch 1", company_profile=company_profile)
            self.wh = Warehouse.objects.create(name="WH1", branch=branch)
            unit = Unit.objects.create(name="Штука", short_name="шт")
            category = ProductCategory.objects.create(name="Cat A", slug="cat-a")
            cp = Counterparty.objects.create(name="Ahmed")

            # 1) Реальный остаток ниже порога + есть история в накладных — классическая нехватка
            self.low_with_stock = Product.objects.create(
                name="Low with stock", category=category, unit=unit, cost_price=Decimal('1.00'), min_stock_level=10,
            )
            WarehouseStock.objects.create(warehouse=self.wh, product=self.low_with_stock, quantity=Decimal('3'))
            in_doc = Document.objects.create(
                document_type='in', date='2026-01-01', warehouse=self.wh, branch=branch, counterparty=cp,
            )
            DocumentItem.objects.create(
                document=in_doc, product=self.low_with_stock, unit=unit, line_no=1,
                quantity=5, price=Decimal('10.00'), discount_percent=0, cost_price=Decimal('1.00'),
            )

            # 1b) Такой же остаток ниже порога (строка WarehouseStock есть), но БЕЗ
            # единой строки в накладных когда-либо — не настоящая нехватка
            self.low_stock_no_turnover = Product.objects.create(
                name="Low stock no turnover", category=category, unit=unit, cost_price=Decimal('1.00'), min_stock_level=10,
            )
            WarehouseStock.objects.create(warehouse=self.wh, product=self.low_stock_no_turnover, quantity=Decimal('3'))

            # 2) Остаток 0 (нет WarehouseStock), но товар фигурировал в накладной раньше
            self.low_with_history = Product.objects.create(
                name="Low with history", category=category, unit=unit, cost_price=Decimal('1.00'), min_stock_level=5,
            )
            doc = Document.objects.create(
                document_type='in', date='2026-01-01', warehouse=self.wh, branch=branch, counterparty=cp,
            )
            DocumentItem.objects.create(
                document=doc, product=self.low_with_history, unit=unit, line_no=1,
                quantity=1, price=Decimal('10.00'), discount_percent=0, cost_price=Decimal('1.00'),
            )
            # черновик — намеренно не проводим, is_low должен сработать и на непроведённой истории

            # 3) Остаток 0, НИКОГДА не фигурировал ни в одной накладной — не "нехватка"
            self.never_ordered = Product.objects.create(
                name="Never ordered", category=category, unit=unit, cost_price=Decimal('1.00'), min_stock_level=5,
            )

    def _client(self):
        client = APIClient()
        client.defaults['HTTP_HOST'] = 'stockbalancetest.localhost'
        client.force_authenticate(user=self.user)
        return client

    def test_is_low_flags(self):
        response = self._client().get(URL, {'warehouse': self.wh.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data

        self.assertTrue(data[str(self.low_with_stock.id)]['is_low'])
        self.assertFalse(data[str(self.low_stock_no_turnover.id)]['is_low'])
        self.assertTrue(data[str(self.low_with_history.id)]['is_low'])
        self.assertFalse(data[str(self.never_ordered.id)]['is_low'])
