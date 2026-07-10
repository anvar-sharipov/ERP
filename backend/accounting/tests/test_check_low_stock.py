# backend/accounting/tests/test_check_low_stock.py
from decimal import Decimal

from django.db import connection
from django_tenants.test.cases import TenantTestCase
from django_tenants.utils import tenant_context

from accounting.models import (
    Branch, CompanyProfile, Document, DocumentItem, Counterparty,
    Product, ProductCategory, SystemAlert, Unit, Warehouse, WarehouseStock,
)
from accounting.tasks import _check_low_stock
from companies.models import Company, Domain


class CheckLowStockTest(TenantTestCase):
    """
    Проверяет accounting.tasks._check_low_stock:
    - товар с остатком ниже min_stock_level И реальной историей в накладных —
      заводит SystemAlert(type=LOW_STOCK, is_resolved=False);
    - товар с остатком ниже min_stock_level, но БЕЗ единой строки в
      DocumentItem когда-либо (например WarehouseStock=0 создан массовым
      импортом) — алерт НЕ заводится (реальный кейс: 3912 "активных
      уведомлений" почти все были именно такими товарами).
    """

    def setUp(self):
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="LowStock Test Co", schema_name="lowstocktest")
        Domain.objects.create(domain='lowstocktest.localhost', tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            company_profile = CompanyProfile.objects.create()
            branch = Branch.objects.create(name="Branch 1", company_profile=company_profile)
            self.wh = Warehouse.objects.create(name="WH1", branch=branch)
            unit = Unit.objects.create(name="Штука", short_name="шт")
            category = ProductCategory.objects.create(name="Cat A", slug="cat-a")
            cp = Counterparty.objects.create(name="Ahmed")

            # С историей — реальная нехватка
            self.with_history = Product.objects.create(
                name="With history", category=category, unit=unit, cost_price=Decimal('1.00'), min_stock_level=10,
            )
            WarehouseStock.objects.create(warehouse=self.wh, product=self.with_history, quantity=Decimal('2'))
            doc = Document.objects.create(
                document_type='in', date='2026-01-01', warehouse=self.wh, branch=branch, counterparty=cp,
            )
            DocumentItem.objects.create(
                document=doc, product=self.with_history, unit=unit, line_no=1,
                quantity=1, price=Decimal('10.00'), discount_percent=0, cost_price=Decimal('1.00'),
            )

            # Без истории — WarehouseStock есть (например от массового импорта), но
            # ни одной строки в DocumentItem никогда не было
            self.never_ordered = Product.objects.create(
                name="Never ordered", category=category, unit=unit, cost_price=Decimal('1.00'), min_stock_level=10,
            )
            WarehouseStock.objects.create(warehouse=self.wh, product=self.never_ordered, quantity=Decimal('0'))

    def test_alert_only_for_products_with_turnover_history(self):
        with tenant_context(self.company):
            _check_low_stock()

            self.assertTrue(
                SystemAlert.objects.filter(
                    type=SystemAlert.Type.LOW_STOCK, is_resolved=False,
                    extra_data__product_id=self.with_history.id,
                ).exists()
            )
            self.assertFalse(
                SystemAlert.objects.filter(
                    type=SystemAlert.Type.LOW_STOCK, is_resolved=False,
                    extra_data__product_id=self.never_ordered.id,
                ).exists()
            )
