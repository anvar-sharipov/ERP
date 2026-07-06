# backend/accounting/tests/test_document_in_posting.py
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db import connection
from django_tenants.test.cases import TenantTestCase
from django_tenants.utils import tenant_context

from companies.models import Company, Domain
from accounting.models import (
    Account, AccountSubconto, Branch, CompanyProfile, Counterparty, Document,
    DocumentItem, JournalEntry, Product, SubcontoType, TransactionLine, Unit,
    Warehouse, WarehouseStock,
)

User = get_user_model()


class DocumentInPostingTest(TenantTestCase):
    """
    Проверяет автогенерацию проводки при проведении "Прихода": Дт inventory_account —
    Кт payable_account, по каждой строке документа (цена × количество, как реально
    указано в документе), субконто "Номенклатура"/"Контрагент" резолвятся так же,
    как в _generate_out_posting.
    """

    def setUp(self):
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="Test Company", schema_name="in_posting_test")
        Domain.objects.create(domain="in-posting-test.localhost", tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            self.user = User.objects.create_user(username="poster", password="pass")

            company_profile = CompanyProfile.objects.create(name="Test Co")
            self.branch = Branch.objects.create(name="Main Branch", company_profile=company_profile)
            self.unit = Unit.objects.create(name="Штука", short_name="шт")
            self.counterparty = Counterparty.objects.create(name="ООО Поставщик", type=Counterparty.Type.SUPPLIER)
            self.product = Product.objects.create(name="Тестовый товар", unit=self.unit, cost_price=Decimal("50.00"))

            self.acc_inventory = Account.objects.create(code="40.1", name="Товары на складах")
            self.acc_payable = Account.objects.create(code="60", name="Расчёты с поставщиками")

            ct_product = SubcontoType.objects.create(
                name="Номенклатура", slug="product",
                content_type=ContentType.objects.get_for_model(Product),
            )
            ct_counterparty = SubcontoType.objects.create(
                name="Контрагент", slug="counterparty",
                content_type=ContentType.objects.get_for_model(Counterparty),
            )
            AccountSubconto.objects.create(account=self.acc_inventory, subconto_type=ct_product, order=1)
            AccountSubconto.objects.create(account=self.acc_payable, subconto_type=ct_counterparty, order=1)

            self.warehouse = Warehouse.objects.create(
                name="Main Warehouse", branch=self.branch,
                inventory_account=self.acc_inventory,
                payable_account=self.acc_payable,
            )
            WarehouseStock.objects.create(warehouse=self.warehouse, product=self.product, quantity=Decimal("0"))

    def _make_in_document(self, price=Decimal("80.00"), qty=Decimal("2")):
        with tenant_context(self.company):
            doc = Document.objects.create(
                document_type=Document.Type.IN, warehouse=self.warehouse, branch=self.branch,
                counterparty=self.counterparty,
            )
            DocumentItem.objects.create(document=doc, product=self.product, unit=self.unit, quantity=qty, price=price)
            return doc

    def test_post_generates_balanced_journal_entry(self):
        doc = self._make_in_document(price=Decimal("80.00"), qty=Decimal("2"))
        with tenant_context(self.company):
            doc.post(user=self.user)
            doc.refresh_from_db()

            self.assertIsNotNone(doc.journal_entry_id)
            entry = doc.journal_entry
            self.assertEqual(entry.status, JournalEntry.Status.POSTED)
            entry.check_balance()  # не должно бросить исключение

            lines = list(entry.lines.all())
            self.assertEqual(len(lines), 2)  # Дт40.1 / Кт60, одна позиция

            inventory_line = entry.lines.get(account=self.acc_inventory, side=TransactionLine.Side.DEBIT)
            self.assertEqual(inventory_line.amount, Decimal("160.00"))  # 80 * 2
            self.assertEqual(inventory_line.subcontos, {"product": self.product.pk})

            payable_line = entry.lines.get(account=self.acc_payable, side=TransactionLine.Side.CREDIT)
            self.assertEqual(payable_line.amount, Decimal("160.00"))
            self.assertEqual(payable_line.subcontos, {"counterparty": self.counterparty.pk})

    def test_post_uses_entered_price_not_old_cost_price(self):
        # Себестоимость товара до прихода — 50, но проводка должна пойти по
        # фактически введённой цене строки (80), а не по старой cost_price.
        doc = self._make_in_document(price=Decimal("80.00"), qty=Decimal("1"))
        with tenant_context(self.company):
            doc.post(user=self.user)
            entry = doc.journal_entry
            inventory_line = entry.lines.get(account=self.acc_inventory)
            self.assertEqual(inventory_line.amount, Decimal("80.00"))

    def test_post_without_warehouse_accounts_raises(self):
        with tenant_context(self.company):
            bare_warehouse = Warehouse.objects.create(name="No Accounts Warehouse", branch=self.branch)
            WarehouseStock.objects.create(warehouse=bare_warehouse, product=self.product, quantity=Decimal("0"))
            doc = Document.objects.create(
                document_type=Document.Type.IN, warehouse=bare_warehouse, branch=self.branch,
                counterparty=self.counterparty,
            )
            DocumentItem.objects.create(document=doc, product=self.product, unit=self.unit, quantity=Decimal("1"), price=Decimal("10.00"))

            with self.assertRaises(ValidationError):
                doc.post(user=self.user)

    def test_unpost_deletes_journal_entry_and_lines(self):
        doc = self._make_in_document()
        with tenant_context(self.company):
            doc.post(user=self.user)
            doc.refresh_from_db()
            entry_id = doc.journal_entry_id
            self.assertIsNotNone(entry_id)

            doc.unpost(user=self.user)
            doc.refresh_from_db()
            self.assertIsNone(doc.journal_entry_id)
            self.assertFalse(JournalEntry.objects.filter(pk=entry_id).exists())
            self.assertFalse(TransactionLine.objects.filter(journal_entry_id=entry_id).exists())

    def test_out_document_does_not_use_in_accounts(self):
        # Расход не должен генерировать проводку по счетам прихода вообще.
        with tenant_context(self.company):
            doc = Document.objects.create(
                document_type=Document.Type.OUT, warehouse=self.warehouse, branch=self.branch,
                counterparty=self.counterparty,
            )
            DocumentItem.objects.create(document=doc, product=self.product, unit=self.unit, quantity=Decimal("1"), price=Decimal("10.00"))
            with self.assertRaises(ValidationError):
                # У склада не настроены receivable_account/revenue_account/cogs_account.
                doc.post(user=self.user)
