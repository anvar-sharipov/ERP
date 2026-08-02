# backend/accounting/tests/test_product_revaluation.py
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connection
from django_tenants.test.cases import TenantTestCase
from django_tenants.utils import tenant_context

from companies.models import Company, Domain
from accounting.models import (
    Account, Branch, CompanyProfile, Counterparty, Document, DocumentItem,
    Product, ProductRevaluation, Unit, Warehouse, WarehouseStock,
)

User = get_user_model()


class ProductRevaluationTest(TenantTestCase):
    """
    Проверяет, что переоценка (ProductRevaluation) фиксируется корректно при
    изменении Product.cost_price во время проведения "Прихода": по одной строке
    на КАЖДЫЙ склад, где есть остаток (cost_price — глобальное поле товара),
    с историческим снимком количества и разницы — см. Document.
    _update_product_cost_prices (models/document.py).
    """

    def setUp(self):
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="Test Company", schema_name="revaluation_test")
        Domain.objects.create(domain="revaluation-test.localhost", tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            self.user = User.objects.create_user(username="poster", password="pass")

            company_profile = CompanyProfile.objects.create(name="Test Co")
            self.branch = Branch.objects.create(name="Main Branch", company_profile=company_profile)
            self.unit = Unit.objects.create(name="Штука", short_name="шт")
            self.counterparty = Counterparty.objects.create(name="ООО Поставщик", type=Counterparty.Type.SUPPLIER)
            self.product = Product.objects.create(name="Тестовый товар", unit=self.unit, cost_price=Decimal("50.00"))

            # ✅ _generate_in_posting (вызывается ПОСЛЕ _update_product_cost_prices
            # внутри общей @transaction.atomic в Document.post()) требует настроенные
            # счета склада, иначе кидает ValidationError и откатывает ВСЮ транзакцию,
            # включая уже созданные строки ProductRevaluation — см. test_document_in_posting.py.
            acc_inventory = Account.objects.create(code="40.1", name="Товары на складах")
            acc_payable = Account.objects.create(code="60", name="Расчёты с поставщиками")

            self.warehouse = Warehouse.objects.create(
                name="Warehouse A", branch=self.branch,
                inventory_account=acc_inventory, payable_account=acc_payable,
            )
            self.warehouse_b = Warehouse.objects.create(name="Warehouse B", branch=self.branch)

            # Уже был остаток ДО прихода на обоих складах — именно он должен
            # переоцениться.
            WarehouseStock.objects.create(warehouse=self.warehouse, product=self.product, quantity=Decimal("10"))
            WarehouseStock.objects.create(warehouse=self.warehouse_b, product=self.product, quantity=Decimal("5"))

    def _make_in_document(self, price=Decimal("80.00"), qty=Decimal("3")):
        with tenant_context(self.company):
            doc = Document.objects.create(
                document_type=Document.Type.IN, warehouse=self.warehouse, branch=self.branch,
                counterparty=self.counterparty,
            )
            DocumentItem.objects.create(document=doc, product=self.product, unit=self.unit, quantity=qty, price=price)
            return doc

    def test_post_creates_revaluation_per_warehouse_excluding_new_stock(self):
        doc = self._make_in_document(price=Decimal("80.00"), qty=Decimal("3"))
        with tenant_context(self.company):
            doc.post(user=self.user)

            revals = list(ProductRevaluation.objects.filter(product=self.product).order_by('warehouse_id'))
            self.assertEqual(len(revals), 2)

            # Склад документа: было 10, пришло 3 → в WarehouseStock уже 13,
            # но переоценивается только ранее имевшийся остаток (10), не новый.
            reval_a = next(r for r in revals if r.warehouse_id == self.warehouse.id)
            self.assertEqual(reval_a.quantity, Decimal("10.000"))
            self.assertEqual(reval_a.old_cost_price, Decimal("50.00"))
            self.assertEqual(reval_a.new_cost_price, Decimal("80.00"))
            self.assertEqual(reval_a.diff_amount, Decimal("300.00"))  # 10 * (80-50)
            self.assertEqual(reval_a.document_id, doc.id)
            self.assertEqual(reval_a.branch_id, self.branch.id)
            self.assertEqual(reval_a.date, doc.date)

            # Другой склад не участвовал в приходе — переоценивается весь остаток (5).
            reval_b = next(r for r in revals if r.warehouse_id == self.warehouse_b.id)
            self.assertEqual(reval_b.quantity, Decimal("5.000"))
            self.assertEqual(reval_b.diff_amount, Decimal("150.00"))  # 5 * (80-50)

    def test_post_skips_revaluation_when_price_unchanged(self):
        doc = self._make_in_document(price=Decimal("50.00"), qty=Decimal("1"))  # совпадает с текущей cost_price
        with tenant_context(self.company):
            doc.post(user=self.user)
            self.assertFalse(ProductRevaluation.objects.filter(product=self.product).exists())

    def test_post_skips_revaluation_for_zero_stock_warehouse(self):
        with tenant_context(self.company):
            empty_warehouse = Warehouse.objects.create(name="Empty Warehouse", branch=self.branch)
            WarehouseStock.objects.create(warehouse=empty_warehouse, product=self.product, quantity=Decimal("0"))

        doc = self._make_in_document(price=Decimal("80.00"), qty=Decimal("1"))
        with tenant_context(self.company):
            doc.post(user=self.user)
            self.assertFalse(ProductRevaluation.objects.filter(warehouse=empty_warehouse).exists())

    def test_revaluation_list_requires_rbac_permission(self):
        from users.models import Permission, Role, RolePermission, UserRole

        doc = self._make_in_document()
        with tenant_context(self.company):
            doc.post(user=self.user)

            from rest_framework.test import APIClient

            client = APIClient()
            client.defaults['HTTP_HOST'] = 'revaluation-test.localhost'
            no_perm_user = User.objects.create_user(username="noperm", password="pass")
            client.force_authenticate(user=no_perm_user)
            response = client.get('/api/accounting/product-revaluations/')
            self.assertEqual(response.status_code, 403)

            role = Role.objects.create(name="Viewer")
            perm, _ = Permission.objects.get_or_create(resource='productrevaluation', action='GET')
            RolePermission.objects.create(role=role, permission=perm)
            UserRole.objects.create(user=no_perm_user, role=role)

            from django.core.cache import cache
            cache.clear()

            response = client.get('/api/accounting/product-revaluations/')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data['count'], 2)
