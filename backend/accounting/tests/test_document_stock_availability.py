# backend/accounting/tests/test_document_stock_availability.py
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import connection
from django_tenants.test.cases import TenantTestCase
from django_tenants.utils import tenant_context
from rest_framework import status
from rest_framework.test import APIClient

from companies.models import Company, Domain
from users.models import Permission, Role, RolePermission, UserRole
from accounting.models import (
    Branch, CompanyProfile, Counterparty, Document, DocumentItem, Product,
    Unit, Warehouse, WarehouseStock,
)

User = get_user_model()


class DocumentItemStockAvailabilityTest(TenantTestCase):
    """
    Проверяет check_stock_availability (accounting/utils.py), вызываемый из
    DocumentItem.save() для Расход/Возврат поставщику/Перемещение: строку с
    товаром, весь физический остаток которого уже "занят" другими черновиками
    (склад=100, резерв=100 другим черновиком "Расхода", доступно=0), сохранить
    нельзя — ни напрямую через модель, ни через API (DocumentItemViewSet), и в
    обоих случаях ошибка должна содержать понятную причину, а не тонуть в
    generic "Ошибка сохранения" (см. document_views.py::DocumentItemViewSet.
    perform_create/perform_update — раньше DRFValidationError(str) сериализовался
    в голый список ["..."], а не {"detail": "..."}, и фронтенд не мог его прочитать).
    """

    def setUp(self):
        cache.clear()
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="StockAvail Test Co", schema_name="stockavailtest")
        Domain.objects.create(domain="stockavailtest.localhost", tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            role = Role.objects.create(name="Editor")
            perm_get, _ = Permission.objects.get_or_create(resource="document", action="GET")
            perm_post, _ = Permission.objects.get_or_create(resource="document", action="POST")
            RolePermission.objects.create(role=role, permission=perm_get)
            RolePermission.objects.create(role=role, permission=perm_post)

            self.user = User.objects.create_user(username="editor", password="pass")
            UserRole.objects.create(user=self.user, role=role)

            company_profile = CompanyProfile.objects.create(name="Test Co")
            self.branch = Branch.objects.create(name="Main Branch", company_profile=company_profile)
            self.warehouse = Warehouse.objects.create(name="Main Warehouse", branch=self.branch)
            self.unit = Unit.objects.create(name="Штука", short_name="шт")
            self.counterparty = Counterparty.objects.create(name="ООО Клиент")
            self.product = Product.objects.create(name="Товар", unit=self.unit, cost_price=Decimal("50.00"))

            WarehouseStock.objects.create(warehouse=self.warehouse, product=self.product, quantity=Decimal("100"))

            # Другой черновик "Расхода", резервирующий весь остаток (100 из 100) —
            # доступно для НОВЫХ строк должно стать 0.
            self.other_draft = Document.objects.create(
                document_type=Document.Type.OUT, warehouse=self.warehouse, branch=self.branch,
                counterparty=self.counterparty,
            )
            DocumentItem.objects.create(
                document=self.other_draft, product=self.product, unit=self.unit,
                quantity=Decimal("100"), price=Decimal("80.00"),
            )

        self.client = APIClient()
        self.client.defaults['HTTP_HOST'] = 'stockavailtest.localhost'

    def test_model_level_save_rejects_fully_reserved_product(self):
        with tenant_context(self.company):
            doc = Document.objects.create(
                document_type=Document.Type.OUT, warehouse=self.warehouse, branch=self.branch,
                counterparty=self.counterparty,
            )
            with self.assertRaises(DjangoValidationError) as ctx:
                DocumentItem.objects.create(
                    document=doc, product=self.product, unit=self.unit,
                    quantity=Decimal("1"), price=Decimal("80.00"),
                )
            self.assertIn("Недостаточно товара", str(ctx.exception))

    def test_api_returns_readable_detail_message(self):
        with tenant_context(self.company):
            doc = Document.objects.create(
                document_type=Document.Type.OUT, warehouse=self.warehouse, branch=self.branch,
                counterparty=self.counterparty,
            )
            self.client.force_authenticate(self.user)
            resp = self.client.post(
                f'/api/accounting/documents/{doc.id}/items/',
                {'product': self.product.id, 'unit': self.unit.id, 'quantity': '1', 'price': '80.00'},
                format='json',
            )
            self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn("Недостаточно товара", resp.data.get('detail', ''))
