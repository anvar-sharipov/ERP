# backend/accounting/tests/test_document_discount_posting.py
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connection
from django_tenants.test.cases import TenantTestCase
from django_tenants.utils import tenant_context

from companies.models import Company, Domain
from accounting.models import (
    Account, Branch, CompanyProfile, Counterparty, Document, DocumentItem,
    Product, TransactionLine, Unit, Warehouse, WarehouseStock,
)

User = get_user_model()


class DocumentDiscountPostingTest(TenantTestCase):
    """
    Проверяет, что "Счёт скидок" (Warehouse.discount_account) — опциональный:
    без него скидка просто netted в total (как раньше), а с ним — Расход проводится
    по полной цене (subtotal), а скидка отдельной строкой на контр-счёт выручки.
    """

    def setUp(self):
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="Test Company", schema_name="discount_posting_test")
        Domain.objects.create(domain="discount-posting-test.localhost", tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            self.user = User.objects.create_user(username="poster", password="pass")

            company_profile = CompanyProfile.objects.create(name="Test Co")
            self.branch = Branch.objects.create(name="Main Branch", company_profile=company_profile)
            self.unit = Unit.objects.create(name="Штука", short_name="шт")
            self.counterparty = Counterparty.objects.create(name="ООО Клиент")
            self.product = Product.objects.create(name="Тестовый товар", unit=self.unit, cost_price=Decimal("50.00"))

            self.acc_receivable = Account.objects.create(code="62.1", name="Расчёты с покупателями")
            self.acc_revenue = Account.objects.create(code="90.1", name="Выручка")
            self.acc_cogs = Account.objects.create(code="90.2", name="Себестоимость продаж")
            self.acc_inventory = Account.objects.create(code="41.1", name="Товары на складах")
            self.acc_discount = Account.objects.create(code="90.1.9", name="Предоставленные скидки")

            self.warehouse_no_discount = Warehouse.objects.create(
                name="Warehouse Without Discount Account", branch=self.branch,
                receivable_account=self.acc_receivable, revenue_account=self.acc_revenue,
                cogs_account=self.acc_cogs, inventory_account=self.acc_inventory,
            )
            self.warehouse_with_discount = Warehouse.objects.create(
                name="Warehouse With Discount Account", branch=self.branch,
                receivable_account=self.acc_receivable, revenue_account=self.acc_revenue,
                cogs_account=self.acc_cogs, inventory_account=self.acc_inventory,
                discount_account=self.acc_discount,
            )
            WarehouseStock.objects.create(warehouse=self.warehouse_no_discount, product=self.product, quantity=Decimal("100"))
            WarehouseStock.objects.create(warehouse=self.warehouse_with_discount, product=self.product, quantity=Decimal("100"))

    def _make_doc(self, warehouse, discount_percent=Decimal("10.00")):
        with tenant_context(self.company):
            doc = Document.objects.create(
                document_type=Document.Type.OUT, warehouse=warehouse, branch=self.branch,
                counterparty=self.counterparty, discount_percent=discount_percent,
            )
            DocumentItem.objects.create(document=doc, product=self.product, unit=self.unit, quantity=Decimal("2"), price=Decimal("100.00"))
            doc.refresh_from_db()
            return doc

    def test_without_discount_account_amount_is_netted(self):
        # subtotal=200, скидка 10% = 20, total=180 — без discount_account вся сумма
        # (netted) идёт в Дт62.1/Кт90.1, отдельной строки скидки нет.
        doc = self._make_doc(self.warehouse_no_discount)
        self.assertEqual(doc.subtotal, Decimal("200.00"))
        self.assertEqual(doc.discount_amount, Decimal("20.00"))
        self.assertEqual(doc.total, Decimal("180.00"))

        with tenant_context(self.company):
            doc.post(user=self.user)
            entry = doc.journal_entry

            self.assertFalse(entry.lines.filter(account=self.acc_discount).exists())
            receivable_line = entry.lines.get(account=self.acc_receivable)
            self.assertEqual(receivable_line.amount, Decimal("180.00"))
            revenue_line = entry.lines.get(account=self.acc_revenue)
            self.assertEqual(revenue_line.amount, Decimal("180.00"))

    def test_with_discount_account_posts_gross_and_discount_separately(self):
        doc = self._make_doc(self.warehouse_with_discount)
        self.assertEqual(doc.subtotal, Decimal("200.00"))
        self.assertEqual(doc.discount_amount, Decimal("20.00"))
        self.assertEqual(doc.total, Decimal("180.00"))

        with tenant_context(self.company):
            doc.post(user=self.user)
            entry = doc.journal_entry
            entry.check_balance()  # общий баланс должен сходиться, даже с доп. строкой скидки

            receivable_debit = entry.lines.get(account=self.acc_receivable, side=TransactionLine.Side.DEBIT)
            self.assertEqual(receivable_debit.amount, Decimal("200.00"))  # gross, не netted

            revenue_line = entry.lines.get(account=self.acc_revenue)
            self.assertEqual(revenue_line.amount, Decimal("200.00"))  # тоже gross

            discount_line = entry.lines.get(account=self.acc_discount, side=TransactionLine.Side.DEBIT)
            self.assertEqual(discount_line.amount, Decimal("20.00"))

            receivable_credit = entry.lines.get(account=self.acc_receivable, side=TransactionLine.Side.CREDIT)
            self.assertEqual(receivable_credit.amount, Decimal("20.00"))

            # Итоговый эффект на receivable: 200 (Дт) - 20 (Кт) = 180 — совпадает с total.
            net_receivable = receivable_debit.amount - receivable_credit.amount
            self.assertEqual(net_receivable, doc.total)

    def test_no_discount_no_extra_lines_even_with_discount_account_configured(self):
        # Скидки нет (0%) — даже если discount_account настроен, лишней строки быть не должно.
        doc = self._make_doc(self.warehouse_with_discount, discount_percent=Decimal("0"))
        with tenant_context(self.company):
            doc.post(user=self.user)
            entry = doc.journal_entry
            self.assertFalse(entry.lines.filter(account=self.acc_discount).exists())
            receivable_line = entry.lines.get(account=self.acc_receivable)
            self.assertEqual(receivable_line.amount, Decimal("200.00"))

    def test_line_level_discount_affects_total_and_posting(self):
        # Построчная скидка (акция по объёму и т.п.) — раньше визуально показывалась,
        # но НЕ уменьшала Document.total/проводку. Теперь должна.
        with tenant_context(self.company):
            doc = Document.objects.create(
                document_type=Document.Type.OUT, warehouse=self.warehouse_no_discount, branch=self.branch,
                counterparty=self.counterparty,
            )
            # 2 шт по 100 = 200 gross, построчная скидка 25% -> net = 150 (без скидки документа).
            DocumentItem.objects.create(
                document=doc, product=self.product, unit=self.unit,
                quantity=Decimal("2"), price=Decimal("100.00"), discount_percent=Decimal("25.00"),
            )
            doc.refresh_from_db()

            self.assertEqual(doc.subtotal, Decimal("200.00"))
            self.assertEqual(doc.total, Decimal("150.00"))
            self.assertEqual(doc.discount_amount, Decimal("50.00"))

            doc.post(user=self.user)
            entry = doc.journal_entry
            entry.check_balance()
            receivable_line = entry.lines.get(account=self.acc_receivable)
            self.assertEqual(receivable_line.amount, Decimal("150.00"))

    def test_line_level_and_header_discount_combine(self):
        # Построчная скидка 25% (200 -> 150) + скидка документа 10% поверх net_subtotal
        # (150 -> 135) -- итоговая total должна учитывать обе, discount_amount = 200-135=65.
        with tenant_context(self.company):
            doc = Document.objects.create(
                document_type=Document.Type.OUT, warehouse=self.warehouse_no_discount, branch=self.branch,
                counterparty=self.counterparty, discount_percent=Decimal("10.00"),
            )
            DocumentItem.objects.create(
                document=doc, product=self.product, unit=self.unit,
                quantity=Decimal("2"), price=Decimal("100.00"), discount_percent=Decimal("25.00"),
            )
            doc.refresh_from_db()

            self.assertEqual(doc.subtotal, Decimal("200.00"))
            self.assertEqual(doc.total, Decimal("135.00"))
            self.assertEqual(doc.discount_amount, Decimal("65.00"))
