# backend/accounting/tests/test_document_return_posting.py
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


class DocumentReturnPostingTest(TenantTestCase):
    """
    Проверяет "красное сторно" для возвратов: те же счета, что у обычного
    Расхода/Прихода, та же сторона (Дт/Кт), но с отрицательной суммой —
    по прямому требованию заказчика (см. CLAUDE.md / TransactionLine.amount).
    """

    def setUp(self):
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="Test Company", schema_name="return_posting_test")
        Domain.objects.create(domain="return-posting-test.localhost", tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            self.user = User.objects.create_user(username="poster", password="pass")

            company_profile = CompanyProfile.objects.create(name="Test Co")
            self.branch = Branch.objects.create(name="Main Branch", company_profile=company_profile)
            self.unit = Unit.objects.create(name="Штука", short_name="шт")
            self.counterparty = Counterparty.objects.create(name="ООО Контрагент", type=Counterparty.Type.BOTH)
            self.product = Product.objects.create(name="Тестовый товар", unit=self.unit, cost_price=Decimal("50.00"))

            self.acc_receivable = Account.objects.create(code="62.1", name="Расчёты с покупателями")
            self.acc_revenue = Account.objects.create(code="90.1", name="Выручка")
            self.acc_cogs = Account.objects.create(code="90.2", name="Себестоимость продаж")
            self.acc_inventory = Account.objects.create(code="41.1", name="Товары на складах")
            self.acc_payable = Account.objects.create(code="60", name="Расчёты с поставщиками")

            ct_counterparty = SubcontoType.objects.create(
                name="Контрагент", slug="counterparty",
                content_type=ContentType.objects.get_for_model(Counterparty),
            )
            AccountSubconto.objects.create(account=self.acc_receivable, subconto_type=ct_counterparty, order=1)
            AccountSubconto.objects.create(account=self.acc_payable, subconto_type=ct_counterparty, order=1)

            self.warehouse = Warehouse.objects.create(
                name="Main Warehouse", branch=self.branch,
                receivable_account=self.acc_receivable,
                revenue_account=self.acc_revenue,
                cogs_account=self.acc_cogs,
                inventory_account=self.acc_inventory,
                payable_account=self.acc_payable,
            )
            WarehouseStock.objects.create(warehouse=self.warehouse, product=self.product, quantity=Decimal("100"))

    def _make_document(self, doc_type, price=Decimal("80.00"), qty=Decimal("2")):
        with tenant_context(self.company):
            doc = Document.objects.create(
                document_type=doc_type, warehouse=self.warehouse, branch=self.branch,
                counterparty=self.counterparty,
            )
            DocumentItem.objects.create(document=doc, product=self.product, unit=self.unit, quantity=qty, price=price)
            return doc

    def test_return_in_posts_same_accounts_as_out_with_negative_amount(self):
        doc = self._make_document(Document.Type.RETURN_IN, price=Decimal("80.00"), qty=Decimal("2"))
        with tenant_context(self.company):
            doc.post(user=self.user)
            doc.refresh_from_db()

            self.assertIsNotNone(doc.journal_entry_id)
            entry = doc.journal_entry
            entry.check_balance()  # не должно бросить исключение, даже с отрицательными суммами

            receivable_line = entry.lines.get(account=self.acc_receivable)
            self.assertEqual(receivable_line.side, TransactionLine.Side.DEBIT)
            self.assertEqual(receivable_line.amount, Decimal("-160.00"))

            revenue_line = entry.lines.get(account=self.acc_revenue)
            self.assertEqual(revenue_line.side, TransactionLine.Side.CREDIT)
            self.assertEqual(revenue_line.amount, Decimal("-160.00"))

            cogs_line = entry.lines.get(account=self.acc_cogs)
            self.assertEqual(cogs_line.amount, Decimal("-100.00"))  # -(50 * 2)

    def test_return_out_posts_same_accounts_as_in_with_negative_amount(self):
        doc = self._make_document(Document.Type.RETURN_OUT, price=Decimal("40.00"), qty=Decimal("3"))
        with tenant_context(self.company):
            doc.post(user=self.user)
            doc.refresh_from_db()

            self.assertIsNotNone(doc.journal_entry_id)
            entry = doc.journal_entry
            entry.check_balance()

            inventory_line = entry.lines.get(account=self.acc_inventory, side=TransactionLine.Side.DEBIT)
            self.assertEqual(inventory_line.amount, Decimal("-120.00"))  # -(40 * 3)

            payable_line = entry.lines.get(account=self.acc_payable, side=TransactionLine.Side.CREDIT)
            self.assertEqual(payable_line.amount, Decimal("-120.00"))

    def test_negative_amount_is_allowed_on_transaction_line(self):
        with tenant_context(self.company):
            entry = JournalEntry.objects.create(
                number="JV-TEST-NEG", date="2026-01-01", branch=self.branch, warehouse=self.warehouse,
            )
            line = TransactionLine(
                journal_entry=entry, order=1, side=TransactionLine.Side.DEBIT,
                account=self.acc_receivable, amount=Decimal("-50.00"),
                subcontos={"counterparty": self.counterparty.pk},
            )
            line.save()  # full_clean() не должен бросить исключение
            self.assertEqual(line.amount, Decimal("-50.00"))

    def test_zero_amount_is_rejected_on_transaction_line(self):
        with tenant_context(self.company):
            entry = JournalEntry.objects.create(
                number="JV-TEST-ZERO", date="2026-01-01", branch=self.branch, warehouse=self.warehouse,
            )
            line = TransactionLine(
                journal_entry=entry, order=1, side=TransactionLine.Side.DEBIT,
                account=self.acc_receivable, amount=Decimal("0.00"),
                subcontos={"counterparty": self.counterparty.pk},
            )
            with self.assertRaises(ValidationError):
                line.save()

    def test_unpost_return_deletes_journal_entry(self):
        doc = self._make_document(Document.Type.RETURN_IN)
        with tenant_context(self.company):
            doc.post(user=self.user)
            doc.refresh_from_db()
            entry_id = doc.journal_entry_id

            doc.unpost(user=self.user)
            doc.refresh_from_db()
            self.assertIsNone(doc.journal_entry_id)
            self.assertFalse(JournalEntry.objects.filter(pk=entry_id).exists())
