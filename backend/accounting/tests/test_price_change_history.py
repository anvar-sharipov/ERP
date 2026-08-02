# backend/accounting/tests/test_price_change_history.py
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connection
from django_tenants.test.cases import TenantTestCase
from django_tenants.utils import tenant_context
from rest_framework.test import APIClient

from companies.models import Company, Domain
from accounting.models import (
    Account, Branch, CompanyProfile, Counterparty, Document, DocumentItem,
    PriceChangeHistory, PriceType, Product, ProductPrice, Unit, Warehouse, WarehouseStock,
)
from users.models import Permission, Role, RolePermission, UserRole

User = get_user_model()


class PriceChangeHistoryTest(TenantTestCase):
    """
    Проверяет отчёт "История изменения цен" (PriceChangeHistory) — универсальный
    лог для ЛЮБОГО типа цены: ProductPrice (см. ProductPriceViewSet.perform_update)
    и себестоимости (price_type=None, см. Document._update_product_cost_prices).
    """

    def setUp(self):
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="Test Company", schema_name="price_history_test")
        Domain.objects.create(domain="price-history-test.localhost", tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            self.user = User.objects.create_user(username="editor", password="pass")
            role = Role.objects.create(name="Editor")
            for resource, action in [("productprice", "PUT"), ("pricechangehistory", "GET")]:
                perm, _ = Permission.objects.get_or_create(resource=resource, action=action)
                RolePermission.objects.create(role=role, permission=perm)
            UserRole.objects.create(user=self.user, role=role)

            company_profile = CompanyProfile.objects.create(name="Test Co")
            self.branch = Branch.objects.create(name="Main Branch", company_profile=company_profile)
            self.unit = Unit.objects.create(name="Штука", short_name="шт")
            self.counterparty = Counterparty.objects.create(name="ООО Поставщик", type=Counterparty.Type.SUPPLIER)
            self.product = Product.objects.create(name="Тестовый товар", unit=self.unit, cost_price=Decimal("50.00"))
            self.price_type = PriceType.objects.create(name="Опт")

            acc_inventory = Account.objects.create(code="40.1", name="Товары на складах")
            acc_payable = Account.objects.create(code="60", name="Расчёты с поставщиками")
            self.warehouse = Warehouse.objects.create(
                name="Warehouse A", branch=self.branch,
                inventory_account=acc_inventory, payable_account=acc_payable,
            )
            self.warehouse_b = Warehouse.objects.create(name="Warehouse B", branch=self.branch)
            WarehouseStock.objects.create(warehouse=self.warehouse, product=self.product, quantity=Decimal("10"))
            WarehouseStock.objects.create(warehouse=self.warehouse_b, product=self.product, quantity=Decimal("5"))

    def _client(self):
        client = APIClient()
        client.defaults['HTTP_HOST'] = 'price-history-test.localhost'
        client.force_authenticate(user=self.user)
        return client

    def test_product_price_update_records_history_scoped_to_warehouse(self):
        with tenant_context(self.company):
            price = ProductPrice.objects.create(
                product=self.product, warehouse=self.warehouse, price_type=self.price_type,
                price=Decimal("100.00"),
            )
            response = self._client().patch(
                f'/api/accounting/product-prices/{price.id}/', {'price': '120.00', 'is_active': True}, format='json',
            )
            self.assertEqual(response.status_code, 200, response.data)

            history = PriceChangeHistory.objects.get(product_price=price)
            self.assertEqual(history.old_price, Decimal("100.00"))
            self.assertEqual(history.new_price, Decimal("120.00"))
            self.assertEqual(history.quantity_at_change, Decimal("10.000"))  # только Warehouse A
            self.assertEqual(history.old_sum, Decimal("1000.00"))
            self.assertEqual(history.new_sum, Decimal("1200.00"))
            self.assertEqual(history.diff_amount, Decimal("200.00"))  # прибыль
            self.assertEqual(history.price_type_id, self.price_type.id)
            self.assertEqual(history.warehouse_id, self.warehouse.id)
            self.assertEqual(history.branch_id, self.branch.id)
            self.assertEqual(history.created_by_id, self.user.id)

    def test_product_price_update_records_history_scoped_to_branch(self):
        with tenant_context(self.company):
            price = ProductPrice.objects.create(
                product=self.product, branch=self.branch, price_type=self.price_type,
                price=Decimal("100.00"),
            )
            response = self._client().patch(
                f'/api/accounting/product-prices/{price.id}/', {'price': '90.00', 'is_active': True}, format='json',
            )
            self.assertEqual(response.status_code, 200, response.data)

            history = PriceChangeHistory.objects.get(product_price=price)
            self.assertEqual(history.quantity_at_change, Decimal("15.000"))  # оба склада филиала
            self.assertEqual(history.diff_amount, Decimal("-150.00"))  # убыток: 15 * (90-100)

    def test_no_history_when_price_unchanged(self):
        with tenant_context(self.company):
            price = ProductPrice.objects.create(
                product=self.product, warehouse=self.warehouse, price_type=self.price_type,
                price=Decimal("100.00"),
            )
            response = self._client().patch(
                f'/api/accounting/product-prices/{price.id}/', {'price': '100.00', 'is_active': True}, format='json',
            )
            self.assertEqual(response.status_code, 200, response.data)
            self.assertFalse(PriceChangeHistory.objects.filter(product_price=price).exists())

    def _make_in_document(self, price=Decimal("80.00"), qty=Decimal("3")):
        with tenant_context(self.company):
            doc = Document.objects.create(
                document_type=Document.Type.IN, warehouse=self.warehouse, branch=self.branch,
                counterparty=self.counterparty,
            )
            DocumentItem.objects.create(document=doc, product=self.product, unit=self.unit, quantity=qty, price=price)
            return doc

    def test_cost_price_change_records_one_aggregated_history_row(self):
        doc = self._make_in_document(price=Decimal("80.00"), qty=Decimal("3"))
        with tenant_context(self.company):
            doc.post(user=self.user)

            history = PriceChangeHistory.objects.get(product=self.product, price_type__isnull=True)
            # Warehouse A: после прихода в WarehouseStock уже 10+3=13, минус только
            # что поступившие 3 = исходные 10; Warehouse B не участвовал — 5. Итого 15.
            self.assertEqual(history.quantity_at_change, Decimal("15.000"))
            self.assertEqual(history.old_price, Decimal("50.00"))
            self.assertEqual(history.new_price, Decimal("80.00"))
            self.assertEqual(history.diff_amount, Decimal("450.00"))  # 15 * 30
            self.assertEqual(history.document_id, doc.id)
            self.assertIsNone(history.warehouse_id)
            self.assertIsNone(history.branch_id)

    def test_price_type_filter_cost_price(self):
        doc = self._make_in_document(price=Decimal("80.00"), qty=Decimal("1"))
        with tenant_context(self.company):
            doc.post(user=self.user)
            price = ProductPrice.objects.create(
                product=self.product, warehouse=self.warehouse, price_type=self.price_type,
                price=Decimal("100.00"),
            )
            self._client().patch(f'/api/accounting/product-prices/{price.id}/', {'price': '120.00', 'is_active': True}, format='json')

            response = self._client().get('/api/accounting/price-change-history/?price_type=cost_price')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data['count'], 1)

            response = self._client().get(f'/api/accounting/price-change-history/?price_type={self.price_type.id}')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data['count'], 1)

    def test_list_requires_rbac_permission(self):
        with tenant_context(self.company):
            no_perm_user = User.objects.create_user(username="noperm", password="pass")
            client = APIClient()
            client.defaults['HTTP_HOST'] = 'price-history-test.localhost'
            client.force_authenticate(user=no_perm_user)
            response = client.get('/api/accounting/price-change-history/')
            self.assertEqual(response.status_code, 403)
