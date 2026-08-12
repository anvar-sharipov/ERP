# backend/accounting/tests/test_product_list_for_document.py
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
    Branch, CompanyProfile, PriceType, Product, ProductPrice, Unit, Warehouse,
)

User = get_user_model()

URL = '/api/accounting/products/list-for-document/'


class ProductListForDocumentTest(TenantTestCase):
    """
    Проверяет GET /products/list-for-document/ (используется DocumentFormPage.tsx
    для автоподстановки цены строки по выбранному типу цены):
    - RBAC ('product'/GET);
    - при переданном ?warehouse= отдаётся ЦЕНА ИМЕННО ЭТОГО СКЛАДА, а не первая
      попавшаяся среди всех складов товара (баг найден 2026-08-09: без фильтрации
      по складу форма накладной могла подставить цену чужого склада — например,
      Optom=180.23 склада, к которому документ не имеет отношения, вместо
      Optom=7.75 текущего склада — тихо, без ошибки, прямо в новую накладную);
    - фолбэк на цену филиала, если для конкретного склада цена не задана;
    - фолбэк на глобальную цену, если нет ни склада, ни филиала.
    """

    def setUp(self):
        cache.clear()
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="ListForDoc Test Co", schema_name="listfordoctest")
        Domain.objects.create(domain='listfordoctest.localhost', tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            role = Role.objects.create(name="Viewer")
            perm, _ = Permission.objects.get_or_create(resource="product", action="GET")
            RolePermission.objects.create(role=role, permission=perm)

            self.user = User.objects.create_user(username="viewer", password="pass")
            UserRole.objects.create(user=self.user, role=role)

            self.user_no_access = User.objects.create_user(username="noaccess", password="pass")

            company_profile = CompanyProfile.objects.create()
            self.branch1 = Branch.objects.create(name="Branch 1", company_profile=company_profile)
            self.branch2 = Branch.objects.create(name="Branch 2", company_profile=company_profile)
            self.wh1 = Warehouse.objects.create(name="WH1", branch=self.branch1)
            self.wh2 = Warehouse.objects.create(name="WH2", branch=self.branch1)
            self.wh_other_branch = Warehouse.objects.create(name="WH3", branch=self.branch2)

            self.unit = Unit.objects.create(name="Штука", short_name="шт")
            self.optom = PriceType.objects.create(name="Optom")

            self.product_wh_specific = Product.objects.create(
                name="Товар со складской ценой", unit=self.unit, cost_price=Decimal("1.00"),
            )
            # Цена на ДРУГОМ складе того же товара — именно её раньше могло
            # подставить .find() на фронте без разбора склада.
            ProductPrice.objects.create(
                product=self.product_wh_specific, warehouse=self.wh2, price_type=self.optom,
                price=Decimal("180.230"),
            )
            ProductPrice.objects.create(
                product=self.product_wh_specific, warehouse=self.wh1, price_type=self.optom,
                price=Decimal("7.750"),
            )

            self.product_branch_fallback = Product.objects.create(
                name="Товар с ценой филиала", unit=self.unit, cost_price=Decimal("1.00"),
            )
            ProductPrice.objects.create(
                product=self.product_branch_fallback, warehouse=None, branch=self.branch1,
                price_type=self.optom, price=Decimal("50.000"),
            )

            self.product_global_fallback = Product.objects.create(
                name="Товар с глобальной ценой", unit=self.unit, cost_price=Decimal("1.00"),
            )
            ProductPrice.objects.create(
                product=self.product_global_fallback, warehouse=None, branch=None,
                price_type=self.optom, price=Decimal("99.000"),
            )

        self.client = APIClient()
        self.client.defaults['HTTP_HOST'] = 'listfordoctest.localhost'

    def _prices_for(self, data, product_id):
        row = next(p for p in data if p['id'] == product_id)
        return {p['price_type']: Decimal(str(p['price'])) for p in row['prices']}

    def test_rbac_denies_without_permission(self):
        with tenant_context(self.company):
            self.client.force_authenticate(self.user_no_access)
            resp = self.client.get(URL, {'warehouse': self.wh1.id})
            self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_warehouse_specific_price_does_not_leak_other_warehouse(self):
        with tenant_context(self.company):
            self.client.force_authenticate(self.user)
            resp = self.client.get(URL, {'warehouse': self.wh1.id})
            self.assertEqual(resp.status_code, status.HTTP_200_OK)
            prices = self._prices_for(resp.data, self.product_wh_specific.id)
            self.assertEqual(prices[self.optom.id], Decimal("7.750"))

            resp2 = self.client.get(URL, {'warehouse': self.wh2.id})
            prices2 = self._prices_for(resp2.data, self.product_wh_specific.id)
            self.assertEqual(prices2[self.optom.id], Decimal("180.230"))

    def test_branch_level_fallback_when_no_warehouse_price(self):
        with tenant_context(self.company):
            self.client.force_authenticate(self.user)
            resp = self.client.get(URL, {'warehouse': self.wh1.id})
            prices = self._prices_for(resp.data, self.product_branch_fallback.id)
            self.assertEqual(prices[self.optom.id], Decimal("50.000"))

            # У склада другого филиала — никакого фолбэка на branch1, цены нет вообще.
            resp2 = self.client.get(URL, {'warehouse': self.wh_other_branch.id})
            prices2 = self._prices_for(resp2.data, self.product_branch_fallback.id)
            self.assertNotIn(self.optom.id, prices2)

    def test_global_fallback_when_no_warehouse_or_branch_price(self):
        with tenant_context(self.company):
            self.client.force_authenticate(self.user)
            resp = self.client.get(URL, {'warehouse': self.wh1.id})
            prices = self._prices_for(resp.data, self.product_global_fallback.id)
            self.assertEqual(prices[self.optom.id], Decimal("99.000"))
