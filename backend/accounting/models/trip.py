# accounting/models/trip.py
import datetime
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db import models, transaction

from .employee import Employee
from .stock import Warehouse
from .audit import AuditLog


class Trip(models.Model):
    """
    Рейс водителя — объединяет несколько проведённых расходных накладных
    (Document.Type.OUT) одного склада в одну поездку, чтобы посчитать и
    зафиксировать ЗП водителя за доставку по проценту, настроенному на
    каждом контрагенте (Counterparty.delivery_percent), см. CLAUDE.md.

    Все накладные рейса обязаны быть с одного склада (Trip.warehouse) —
    это и физически логично (машина грузится с одного склада), и упрощает
    расчёт валюты: ЗП считается в валюте склада, а при "Доставлено" при
    необходимости конвертируется в манаты по курсу на сегодня.
    """

    class Status(models.TextChoices):
        NEW = 'new', 'Формируется'
        DELIVERED = 'delivered', 'Доставлен'

    driver = models.ForeignKey(
        Employee, on_delete=models.PROTECT, related_name='trips',
        verbose_name="Водитель",
    )
    warehouse = models.ForeignKey(
        Warehouse, on_delete=models.PROTECT, related_name='trips',
        verbose_name="Склад отправления",
    )
    date = models.DateField(default=datetime.date.today, db_index=True, verbose_name="Дата рейса")
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.NEW, db_index=True,
    )
    comment = models.CharField(max_length=500, blank=True, verbose_name="Комментарий")

    # ✅ ЗП водителя в валюте склада (то, что реально насчитано по документам) —
    # и её "замороженное" значение в манатах (то, что реально ушло проводкой),
    # см. deliver(). Оба поля нулевые, пока рейс не доставлен.
    salary_total = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'), verbose_name="ЗП водителя (валюта склада)")
    salary_total_tmt = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'), verbose_name="ЗП водителя (манаты)")
    exchange_rate_used = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True, verbose_name="Курс USD→TMT на момент доставки")

    journal_entry = models.OneToOneField(
        'JournalEntry', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='trip',
    )

    delivered_at = models.DateTimeField(null=True, blank=True)
    delivered_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='delivered_trips',
    )
    created_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='created_trips',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-id']
        verbose_name = "Рейс"
        verbose_name_plural = "Рейсы"
        indexes = [
            models.Index(fields=['status', 'date']),
            models.Index(fields=['driver', 'date']),
            models.Index(fields=['warehouse', 'date']),
        ]

    def __str__(self):
        return f"Рейс №{self.id} — {self.driver.full_name}"

    # ── Управление накладными в рейсе ───────────────────────────────────────

    def add_document(self, document):
        from .document import Document
        if self.status == self.Status.DELIVERED:
            raise ValidationError("Нельзя изменять состав уже доставленного рейса — сначала отмените доставку.")
        if document.document_type != Document.Type.OUT:
            raise ValidationError("В рейс можно добавлять только расходные накладные (продажа клиенту).")
        if document.status != Document.Status.POSTED:
            raise ValidationError("В рейс можно добавлять только проведённые накладные.")
        if document.warehouse_id != self.warehouse_id:
            raise ValidationError(f"Накладная №{document.number} с другого склада — рейс ведётся только с одного склада ({self.warehouse.name}).")
        if document.trip_id and document.trip_id != self.id:
            raise ValidationError(f"Накладная №{document.number} уже привязана к другому рейсу.")
        document.trip = self
        document.save(update_fields=['trip'])

    def remove_document(self, document):
        if self.status == self.Status.DELIVERED:
            raise ValidationError("Нельзя изменять состав уже доставленного рейса — сначала отмените доставку.")
        if document.trip_id != self.id:
            raise ValidationError("Эта накладная не привязана к данному рейсу.")
        document.trip = None
        document.save(update_fields=['trip'])

    # ── Проводки ЗП ──────────────────────────────────────────────────────────

    def _resolve_account_subcontos(self, account):
        """См. Document._resolve_account_subcontos — тот же принцип, контекст
        здесь только один: сотрудник (водитель), для субконто типа Employee."""
        from .counterparty import Counterparty  # noqa: F401 (симметрия с Document, не используется)
        from .employee import Employee as EmployeeModel

        context = {ContentType.objects.get_for_model(EmployeeModel).id: self.driver_id}

        result = {}
        for st in account.subcontos.all():
            if not st.content_type_id:
                raise ValidationError(
                    f"Субконто «{st.name}» счёта {account.code} не привязано к модели данных — "
                    f"автоматическая проводка невозможна."
                )
            value = context.get(st.content_type_id)
            if value is None:
                raise ValidationError(
                    f"Не удалось определить значение субконто «{st.name}» для счёта {account.code} "
                    f"при закрытии рейса №{self.id} — эта аналитика недоступна на уровне рейса "
                    f"(поддерживается только субконто «Сотрудник»)."
                )
            result[st.slug] = value
        return result

    def _write_audit_log(self, user, action, changed_data):
        AuditLog.objects.create(
            content_type=ContentType.objects.get_for_model(Trip),
            object_id=self.pk,
            object_repr=str(self)[:255],
            action=action,
            user=user if user and getattr(user, 'is_authenticated', False) else None,
            changed_data=changed_data,
        )

    @transaction.atomic
    def deliver(self, user=None):
        """
        Закрывает рейс: считает ЗП водителя по всем привязанным накладным
        (delivery_percent контрагента × сумма накладной), при необходимости
        конвертирует в манаты по курсу USD на СЕГОДНЯ (не на дату рейса —
        курс должен быть установлен именно в день фактического закрытия) и
        проводит Дт «Расход на доставку» / Кт «Начислено водителю» по счетам
        склада.
        """
        from django.utils import timezone
        from accounting.utils import check_period_open, generate_journal_number
        from .transaction import JournalEntry, TransactionLine
        from .currency import Currency, ExchangeRate

        if self.status == self.Status.DELIVERED:
            raise ValidationError("Рейс уже доставлен.")

        documents = list(self.documents.select_related('counterparty').all())
        if not documents:
            raise ValidationError("Нельзя закрыть рейс: к нему не привязано ни одной накладной.")

        check_period_open(self.date, branch_id=self.warehouse.branch_id, warehouse_id=self.warehouse_id)

        salary_total = sum(
            (Decimal(doc.delivery_percent) / Decimal('100')) * Decimal(doc.total)
            for doc in documents
        ).quantize(Decimal('0.01'))

        rate_value = None
        if self.warehouse.currency == Warehouse.Currency.USD:
            # ✅ Курс берётся на ДАТУ РЕЙСА (self.date), а не на дату фактического
            # нажатия "Доставлено" — по просьбе пользователя. Рейс мог закрываться
            # позже даты самой поездки, но конвертация должна отражать курс того
            # дня, когда рейс реально состоялся.
            rate_date = self.date
            currency = Currency.objects.filter(code='USD').first()
            if not currency:
                raise ValidationError("В справочнике валют не настроена валюта USD — обратитесь к администратору.")
            rate_row = (
                ExchangeRate.objects.filter(currency=currency, date=rate_date)
                .order_by('-created_at').first()
            )
            if not rate_row:
                raise ValidationError(
                    f"Курс USD на дату рейса ({rate_date:%d.%m.%Y}) не установлен — задайте курс валют "
                    f"на эту дату, прежде чем закрывать рейс со склада «{self.warehouse.name}»."
                )
            rate_value = rate_row.rate
            salary_total_tmt = (salary_total * rate_value).quantize(Decimal('0.01'))
        else:
            salary_total_tmt = salary_total

        entry = None
        if salary_total_tmt != 0:
            wh = self.warehouse
            if not wh.delivery_expense_account_id or not wh.driver_payable_account_id:
                raise ValidationError(
                    f"Для склада «{wh.name}» не настроены счета «Расход на доставку» / "
                    f"«Начислено водителю» — заполните их в карточке склада перед закрытием рейса."
                )
            entry = JournalEntry.objects.create(
                number=generate_journal_number(),
                date=self.date,
                description=f"Рейс №{self.id} — ЗП водителю {self.driver.full_name}",
                branch=wh.branch,
                warehouse=wh,
                source_document_type=ContentType.objects.get_for_model(Trip),
                source_document_id=self.pk,
                created_by=user,
            )
            expense_subcontos = self._resolve_account_subcontos(wh.delivery_expense_account)
            payable_subcontos = self._resolve_account_subcontos(wh.driver_payable_account)
            TransactionLine.objects.create(
                journal_entry=entry, order=1, side=TransactionLine.Side.DEBIT,
                account=wh.delivery_expense_account, amount=salary_total_tmt, subcontos=expense_subcontos,
            )
            TransactionLine.objects.create(
                journal_entry=entry, order=2, side=TransactionLine.Side.CREDIT,
                account=wh.driver_payable_account, amount=salary_total_tmt, subcontos=payable_subcontos,
            )
            entry.post()

        self.journal_entry = entry
        self.salary_total = salary_total
        self.salary_total_tmt = salary_total_tmt
        self.exchange_rate_used = rate_value
        self.status = self.Status.DELIVERED
        self.delivered_at = timezone.now()
        self.delivered_by = user
        self.save()

        self._write_audit_log(user, AuditLog.Action.POST, {
            'Водитель': self.driver.full_name,
            'Склад': self.warehouse.name,
            'Накладных в рейсе': len(documents),
            'ЗП (валюта склада)': str(salary_total),
            'Курс USD→TMT': str(rate_value) if rate_value else '—',
            'ЗП (манаты)': str(salary_total_tmt),
        })

    @transaction.atomic
    def cancel_delivery(self, user=None):
        """Откатывает 'Доставлено' — удаляет проводку ЗП и возвращает рейс в
        статус «Формируется» (нужно для отладки/обкатки без пересоздания рейса)."""
        from accounting.utils import check_period_open

        if self.status != self.Status.DELIVERED:
            raise ValidationError("Рейс ещё не доставлен.")

        check_period_open(self.date, branch_id=self.warehouse.branch_id, warehouse_id=self.warehouse_id)

        old_salary_tmt = str(self.salary_total_tmt)
        entry = self.journal_entry
        self.journal_entry = None
        self.status = self.Status.NEW
        self.salary_total = Decimal('0.00')
        self.salary_total_tmt = Decimal('0.00')
        self.exchange_rate_used = None
        self.delivered_at = None
        self.delivered_by = None
        self.save()
        if entry is not None:
            entry.delete()

        self._write_audit_log(user, AuditLog.Action.UNPOST, {
            'Водитель': self.driver.full_name,
            'Склад': self.warehouse.name,
            'Отменённая ЗП (манаты)': old_salary_tmt,
        })
