# backend/accounting/tests/test_trip.py
import datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import connection
from django_tenants.test.cases import TenantTestCase
from django_tenants.utils import tenant_context
from rest_framework.test import APIClient
from rest_framework import status

from companies.models import Company, Domain
from users.models import Role, Permission, RolePermission, UserRole
from accounting.models import (
    Account, Branch, CompanyProfile, Counterparty, Currency, Document,
    DocumentItem, Employee, ExchangeRate, JournalEntry, Position, Product,
    Trip, Unit, Warehouse, WarehouseStock,
)

User = get_user_model()


class TripDeliveryTest(TenantTestCase):
    """
    ЗП водителя за рейс = сумма по всем накладным рейса
    (delivery_percent контрагента × Document.total), с конвертацией в манаты
    по курсу USD, если склад ведёт учёт в валюте (Warehouse.Currency.USD).
    См. accounting/models/trip.py::Trip.deliver.
    """

    def setUp(self):
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="Test Company", schema_name="trip_test")
        Domain.objects.create(domain="trip-test.localhost", tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            self.user = User.objects.create_user(username="dispatcher", password="pass")

            company_profile = CompanyProfile.objects.create(name="Test Co")
            self.branch = Branch.objects.create(name="Main Branch", company_profile=company_profile)
            self.unit = Unit.objects.create(name="Штука", short_name="шт")

            self.acc_receivable = Account.objects.create(code="62.1", name="Расчёты с покупателями")
            self.acc_revenue = Account.objects.create(code="90.1", name="Выручка")
            self.acc_cogs = Account.objects.create(code="90.2", name="Себестоимость продаж")
            self.acc_inventory = Account.objects.create(code="41.1", name="Товары на складах")
            self.acc_delivery_expense = Account.objects.create(code="44.1", name="Расход на доставку")
            self.acc_driver_payable = Account.objects.create(code="76.1", name="Начислено водителям")

            self.warehouse = Warehouse.objects.create(
                name="Main Warehouse", branch=self.branch,
                receivable_account=self.acc_receivable, revenue_account=self.acc_revenue,
                cogs_account=self.acc_cogs, inventory_account=self.acc_inventory,
                delivery_expense_account=self.acc_delivery_expense,
                driver_payable_account=self.acc_driver_payable,
            )
            self.warehouse_usd = Warehouse.objects.create(
                name="USD Warehouse", branch=self.branch, currency=Warehouse.Currency.USD,
                receivable_account=self.acc_receivable, revenue_account=self.acc_revenue,
                cogs_account=self.acc_cogs, inventory_account=self.acc_inventory,
                delivery_expense_account=self.acc_delivery_expense,
                driver_payable_account=self.acc_driver_payable,
            )

            self.product = Product.objects.create(name="Товар", unit=self.unit, cost_price=Decimal("10.00"))
            WarehouseStock.objects.create(warehouse=self.warehouse, product=self.product, quantity=Decimal("1000"))
            WarehouseStock.objects.create(warehouse=self.warehouse_usd, product=self.product, quantity=Decimal("1000"))

            self.position = Position.objects.create(name="Водитель")
            self.driver = Employee.objects.create(full_name="Иванов Иван", position=self.position)

            self.counterparty = Counterparty.objects.create(
                name="Клиент Дальний", type=Counterparty.Type.CLIENT, delivery_percent=Decimal("5.00"),
            )

    def _posted_out_document(self, warehouse, price=Decimal("100.00"), qty=Decimal("10")):
        with tenant_context(self.company):
            doc = Document.objects.create(
                document_type=Document.Type.OUT, warehouse=warehouse, branch=self.branch,
                counterparty=self.counterparty,
            )
            DocumentItem.objects.create(document=doc, product=self.product, unit=self.unit, quantity=qty, price=price)
            doc.post(user=self.user)
            doc.refresh_from_db()
            return doc

    # ── Снимок delivery_percent ──────────────────────────────────────────

    def test_document_snapshots_delivery_percent_on_post(self):
        doc = self._posted_out_document(self.warehouse)
        self.assertEqual(doc.delivery_percent, Decimal("5.00"))

    # ── ЗП без конвертации (склад в манатах) ────────────────────────────

    def test_deliver_tmt_warehouse_posts_journal_entry(self):
        doc = self._posted_out_document(self.warehouse, price=Decimal("100.00"), qty=Decimal("10"))  # total = 1000
        with tenant_context(self.company):
            trip = Trip.objects.create(driver=self.driver, warehouse=self.warehouse, created_by=self.user)
            trip.add_document(doc)
            trip.deliver(user=self.user)
            trip.refresh_from_db()

            self.assertEqual(trip.status, Trip.Status.DELIVERED)
            self.assertEqual(trip.salary_total, Decimal("50.00"))  # 5% от 1000
            self.assertEqual(trip.salary_total_tmt, Decimal("50.00"))
            self.assertIsNone(trip.exchange_rate_used)
            self.assertIsNotNone(trip.journal_entry_id)

            entry = trip.journal_entry
            entry.check_balance()
            debit = entry.lines.get(account=self.acc_delivery_expense)
            credit = entry.lines.get(account=self.acc_driver_payable)
            self.assertEqual(debit.amount, Decimal("50.00"))
            self.assertEqual(credit.amount, Decimal("50.00"))

    # ── ЗП с конвертацией (USD-склад) ────────────────────────────────────

    def test_deliver_usd_warehouse_without_todays_rate_is_blocked(self):
        doc = self._posted_out_document(self.warehouse_usd, price=Decimal("100.00"), qty=Decimal("10"))
        with tenant_context(self.company):
            trip = Trip.objects.create(driver=self.driver, warehouse=self.warehouse_usd, created_by=self.user)
            trip.add_document(doc)
            with self.assertRaises(ValidationError):
                trip.deliver(user=self.user)

    def test_deliver_usd_warehouse_converts_using_trip_date_rate(self):
        # ✅ Курс ищется по Trip.date, а не по дате фактического клика "Доставлено"
        # (см. Trip.deliver) — рейс закрывается сегодня, но датирован прошлым
        # числом, и курс на СЕГОДНЯ намеренно НЕ задаём, только на дату рейса.
        doc = self._posted_out_document(self.warehouse_usd, price=Decimal("100.00"), qty=Decimal("10"))  # total = 1000 USD
        trip_date = datetime.date(2026, 7, 5)
        with tenant_context(self.company):
            usd = Currency.objects.create(code="USD", name="Доллар США")
            ExchangeRate.objects.create(currency=usd, rate=Decimal("19.5000"), date=trip_date)

            trip = Trip.objects.create(driver=self.driver, warehouse=self.warehouse_usd, date=trip_date, created_by=self.user)
            trip.add_document(doc)
            trip.deliver(user=self.user)
            trip.refresh_from_db()

            self.assertEqual(trip.salary_total, Decimal("50.00"))  # 5% от $1000
            self.assertEqual(trip.exchange_rate_used, Decimal("19.5000"))
            self.assertEqual(trip.salary_total_tmt, Decimal("975.00"))  # 50 * 19.5

            debit = trip.journal_entry.lines.get(account=self.acc_delivery_expense)
            self.assertEqual(debit.amount, Decimal("975.00"))

    def test_deliver_does_not_fall_back_to_todays_rate(self):
        # ✅ Курс задан только на СЕГОДНЯ, а рейс датирован прошлым числом —
        # должно блокироваться, а не подхватывать курс сегодняшнего дня.
        doc = self._posted_out_document(self.warehouse_usd, price=Decimal("100.00"), qty=Decimal("10"))
        with tenant_context(self.company):
            usd = Currency.objects.create(code="USD", name="Доллар США")
            ExchangeRate.objects.create(currency=usd, rate=Decimal("19.5000"), date=datetime.date.today())

            trip = Trip.objects.create(driver=self.driver, warehouse=self.warehouse_usd, date=datetime.date(2026, 7, 5), created_by=self.user)
            trip.add_document(doc)
            with self.assertRaises(ValidationError):
                trip.deliver(user=self.user)

    # ── Отмена доставки ───────────────────────────────────────────────────

    def test_cancel_delivery_reverts_status_and_removes_journal_entry(self):
        doc = self._posted_out_document(self.warehouse)
        with tenant_context(self.company):
            trip = Trip.objects.create(driver=self.driver, warehouse=self.warehouse, created_by=self.user)
            trip.add_document(doc)
            trip.deliver(user=self.user)
            entry_id = trip.journal_entry_id

            trip.cancel_delivery(user=self.user)
            trip.refresh_from_db()

            self.assertEqual(trip.status, Trip.Status.NEW)
            self.assertEqual(trip.salary_total_tmt, Decimal("0.00"))
            self.assertIsNone(trip.journal_entry_id)
            self.assertFalse(JournalEntry.objects.filter(pk=entry_id).exists())

    # ── Валидация состава рейса ──────────────────────────────────────────

    def test_add_document_from_other_warehouse_is_rejected(self):
        doc = self._posted_out_document(self.warehouse_usd)
        with tenant_context(self.company):
            trip = Trip.objects.create(driver=self.driver, warehouse=self.warehouse, created_by=self.user)
            with self.assertRaises(ValidationError):
                trip.add_document(doc)

    def test_add_unposted_document_is_rejected(self):
        with tenant_context(self.company):
            doc = Document.objects.create(
                document_type=Document.Type.OUT, warehouse=self.warehouse, branch=self.branch,
                counterparty=self.counterparty,
            )
            DocumentItem.objects.create(document=doc, product=self.product, unit=self.unit, quantity=Decimal("1"), price=Decimal("10"))
            trip = Trip.objects.create(driver=self.driver, warehouse=self.warehouse, created_by=self.user)
            with self.assertRaises(ValidationError):
                trip.add_document(doc)

    def test_deliver_without_documents_is_rejected(self):
        with tenant_context(self.company):
            trip = Trip.objects.create(driver=self.driver, warehouse=self.warehouse, created_by=self.user)
            with self.assertRaises(ValidationError):
                trip.deliver(user=self.user)

    def test_unpost_document_linked_to_trip_is_blocked(self):
        doc = self._posted_out_document(self.warehouse)
        with tenant_context(self.company):
            trip = Trip.objects.create(driver=self.driver, warehouse=self.warehouse, created_by=self.user)
            trip.add_document(doc)
            doc.refresh_from_db()
            with self.assertRaises(ValidationError):
                doc.unpost(user=self.user)


class TripRBACTest(TenantTestCase):
    """Проверка, что список рейсов реально гейтится через _rbac('trip')."""

    def setUp(self):
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="Test Company", schema_name="trip_rbac_test")
        Domain.objects.create(domain="trip-rbac-test.localhost", tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            self.role = Role.objects.create(name="Dispatcher")
            perm, _ = Permission.objects.get_or_create(resource="trip", action="GET")
            RolePermission.objects.create(role=self.role, permission=perm)

            self.user_with_perm = User.objects.create_user(username="with_perm", password="pass")
            UserRole.objects.create(user=self.user_with_perm, role=self.role)

            self.user_no_perm = User.objects.create_user(username="no_perm", password="pass")

    def _client(self, user):
        client = APIClient()
        client.defaults['HTTP_HOST'] = 'trip-rbac-test.localhost'
        client.force_authenticate(user=user)
        return client

    def test_list_trips_without_permission_returns_403(self):
        response = self._client(self.user_no_perm).get('/api/accounting/trips/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_trips_with_permission_returns_200(self):
        response = self._client(self.user_with_perm).get('/api/accounting/trips/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
