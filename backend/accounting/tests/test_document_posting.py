# backend/accounting/tests/test_document_posting.py
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.db import connection
from django_tenants.test.cases import TenantTestCase
from django_tenants.utils import tenant_context

from companies.models import Company, Domain
from accounting.models import (
    Account, AuditLog, Branch, CompanyProfile, Document, DocumentItem,
    DocumentSettings, PriceType, Product, ProductPrice, Unit, Warehouse, WarehouseStock,
)

User = get_user_model()


class DocumentPostingCostPriceTest(TenantTestCase):
    """
    Проверяет фичу "Приход": обновление cost_price при проведении, аудит-лог
    (POST/UNPOST документа + UPDATE товара), и что при неизменной цене лишняя
    запись в AuditLog не создаётся.
    """

    def setUp(self):
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="Test Company", schema_name="doc_posting_test")
        Domain.objects.create(domain="doc-posting-test.localhost", tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            self.user = User.objects.create_user(username="poster", password="pass")

            company_profile = CompanyProfile.objects.create(name="Test Co")
            self.branch = Branch.objects.create(name="Main Branch", company_profile=company_profile)
            # ✅ Счета для автогенерации проводки "Расхода" и "Прихода" — нужны, чтобы
            # документы обоих типов вообще могли быть проведены (см. test_document_out_posting.py
            # и test_document_in_posting.py для полного покрытия самих проводок).
            self.warehouse = Warehouse.objects.create(
                name="Main Warehouse", branch=self.branch,
                receivable_account=Account.objects.create(code="62.1", name="Расчёты с покупателями"),
                revenue_account=Account.objects.create(code="90.1", name="Выручка"),
                cogs_account=Account.objects.create(code="90.2", name="Себестоимость продаж"),
                inventory_account=Account.objects.create(code="41.1", name="Товары на складах"),
                payable_account=Account.objects.create(code="60", name="Расчёты с поставщиками"),
            )
            self.unit = Unit.objects.create(name="Штука", short_name="шт")

            self.product = Product.objects.create(name="Test Product", unit=self.unit, cost_price=Decimal("5.00"))

            self.wholesale = PriceType.objects.create(name="Опт")
            ProductPrice.objects.create(product=self.product, price_type=self.wholesale, price=Decimal("8.00"))

    def _make_document(self, price):
        with tenant_context(self.company):
            doc = Document.objects.create(document_type=Document.Type.IN, warehouse=self.warehouse, branch=self.branch)
            DocumentItem.objects.create(document=doc, product=self.product, unit=self.unit, quantity=Decimal("10"), price=price)
            return doc

    def test_post_updates_cost_price_from_line_price(self):
        doc = self._make_document(price=Decimal("6.50"))
        with tenant_context(self.company):
            doc.post(user=self.user)
            self.product.refresh_from_db()
            self.assertEqual(self.product.cost_price, Decimal("6.50"))

    def test_post_writes_audit_log_for_document_and_product(self):
        doc = self._make_document(price=Decimal("6.50"))
        with tenant_context(self.company):
            doc.post(user=self.user)

            doc_logs = AuditLog.objects.filter(
                content_type=ContentType.objects.get_for_model(Document),
                object_id=doc.pk, action=AuditLog.Action.POST,
            )
            self.assertEqual(doc_logs.count(), 1)
            self.assertEqual(doc_logs.first().user, self.user)

            product_logs = AuditLog.objects.filter(
                content_type=ContentType.objects.get_for_model(Product),
                object_id=self.product.pk, action=AuditLog.Action.UPDATE,
            )
            self.assertEqual(product_logs.count(), 1)
            self.assertEqual(product_logs.first().changed_data["cost_price"], {"before": "5.00", "after": "6.50"})

    def test_post_does_not_log_product_when_price_unchanged(self):
        # Цена строки совпадает с текущей cost_price товара — обновлять/логировать нечего.
        doc = self._make_document(price=Decimal("5.00"))
        with tenant_context(self.company):
            doc.post(user=self.user)
            product_logs = AuditLog.objects.filter(
                content_type=ContentType.objects.get_for_model(Product),
                object_id=self.product.pk, action=AuditLog.Action.UPDATE,
            )
            self.assertEqual(product_logs.count(), 0)

    def test_unpost_writes_audit_log(self):
        doc = self._make_document(price=Decimal("6.50"))
        with tenant_context(self.company):
            doc.post(user=self.user)
            doc.unpost(user=self.user)

            unpost_logs = AuditLog.objects.filter(
                content_type=ContentType.objects.get_for_model(Document),
                object_id=doc.pk, action=AuditLog.Action.UNPOST,
            )
            self.assertEqual(unpost_logs.count(), 1)

    def test_out_document_does_not_touch_cost_price(self):
        # Расход не должен трогать себестоимость товара вообще.
        with tenant_context(self.company):
            WarehouseStock.objects.create(warehouse=self.warehouse, product=self.product, quantity=Decimal("100"))
            doc = Document.objects.create(document_type=Document.Type.OUT, warehouse=self.warehouse, branch=self.branch)
            DocumentItem.objects.create(document=doc, product=self.product, unit=self.unit, quantity=Decimal("1"), price=Decimal("8.00"))
            doc.post(user=self.user)
            self.product.refresh_from_db()
            self.assertEqual(self.product.cost_price, Decimal("5.00"))


class DocumentSettingsRBACSmokeTest(TenantTestCase):
    """
    Простая проверка, что DocumentSettings действительно существует как модель
    и singleton-конвенция (одна запись) работает, как у CompanyProfile/Branch.
    Полное RBAC-покрытие (403/200 по правам) — в test_rbac_document_settings.py.
    """

    def setUp(self):
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="Test Company 2", schema_name="doc_settings_test")
        Domain.objects.create(domain="doc-settings-test.localhost", tenant=self.company, is_primary=True)

    def test_create_and_read_document_settings(self):
        with tenant_context(self.company):
            price_type = PriceType.objects.create(name="Опт")
            settings = DocumentSettings.objects.create(purchase_price_type=price_type)
            fetched = DocumentSettings.objects.first()
            self.assertEqual(fetched.pk, settings.pk)
            self.assertEqual(fetched.purchase_price_type_id, price_type.pk)
