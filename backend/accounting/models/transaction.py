# accounting/models/transaction.py
import datetime

from django.contrib.postgres.indexes import GinIndex
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from decimal import Decimal
from django.db import models


class JournalEntry(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Черновик'
        POSTED = 'posted', 'Проведён'

    number = models.CharField(max_length=20, unique=True)
    date = models.DateTimeField(db_index=True)
    status = models.CharField(max_length=10, choices=Status.choices,
                              default=Status.DRAFT, db_index=True)
    description = models.CharField(max_length=255, blank=True)

    branch = models.ForeignKey(
        'Branch', on_delete=models.PROTECT,
        null=True, blank=True,
        related_name='journal_entries',
        verbose_name="Филиал"
    )
    
    source_document_type = models.ForeignKey(
        'contenttypes.ContentType',  # ✅ ПРАВИЛЬНАЯ ССЫЛКА
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True
    )
    
    
    source_document_id = models.PositiveIntegerField(null=True, blank=True)

    created_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='journal_entries'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def check_balance(self):
        from django.db.models import Sum
        totals = (
            self.lines
            .values('side')
            .annotate(total=Sum('amount'))
        )
        sums = {row['side']: row['total'] for row in totals}
        dt = sums.get('debit', 0)
        kt = sums.get('credit', 0)
        if dt != kt:
            raise ValidationError(
                f"Баланс не сходится: Дт={dt}, Кт={kt}"
            )

    def post(self):
        from accounting.utils import check_period_open
        if self.status == self.Status.POSTED:
            raise ValidationError("Операция уже проведена")
        check_period_open(self.date)
        self.check_balance()
        self.status = self.Status.POSTED
        self.save(update_fields=['status'])

    def unpost(self):
        from accounting.utils import check_period_open
        if self.status == self.Status.DRAFT:
            raise ValidationError("Операция ещё не проведена")
        check_period_open(self.date)
        self.status = self.Status.DRAFT
        self.save(update_fields=['status'])

    class Meta:
        ordering = ['-date', '-number']
        verbose_name = "Операция"
        verbose_name_plural = "Журнал операций"

    def __str__(self):
        return f"Операция №{self.number} от {self.date:%d.%m.%Y}"


class TransactionLine(models.Model):
    """
    Одна строка бухгалтерской операции.
    """
    class Side(models.TextChoices):
        DEBIT = 'debit', 'Дебет'
        CREDIT = 'credit', 'Кредит'

    journal_entry = models.ForeignKey(
        JournalEntry, on_delete=models.CASCADE, related_name='lines'
    )
    order = models.PositiveSmallIntegerField(default=0)
    side = models.CharField(max_length=6, choices=Side.choices, db_index=True)
    account = models.ForeignKey(
        'Account', on_delete=models.PROTECT, related_name='transaction_lines'
    )
    amount = models.DecimalField(
        max_digits=15, decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    subcontos = models.JSONField(default=dict, blank=True)

    def clean(self):
        if self.account.is_group:
            raise ValidationError(
                f"Нельзя делать проводку по счёту-группе: {self.account.code}"
            )
        self._validate_subcontos()

    def _validate_subcontos(self):
        required = set(self.account.subcontos.values_list('slug', flat=True))
        provided = set(self.subcontos.keys())

        missing = required - provided
        if missing:
            raise ValidationError(
                f"Для счёта {self.account.code} не заполнены субконто: {missing}"
            )
        extra = provided - required
        if extra:
            raise ValidationError(
                f"Лишние субконто для счёта {self.account.code}: {extra}"
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    class Meta:
        ordering = ['order']
        verbose_name = "Строка операции"
        verbose_name_plural = "Строки операций"
        indexes = [
            GinIndex(fields=['subcontos'], name='tx_line_subcontos_gin'),
            models.Index(fields=['account', 'side'], name='tx_line_account_side_idx'),
        ]

    def __str__(self):
        return f"{self.get_side_display()} {self.account.code} — {self.amount}"



class ClosedPeriod(models.Model):
    """
    Закрытый день/период.
    
    Логика:
    - branch=None, warehouse=None → закрыто глобально для всей компании (директор)
    - branch=X, warehouse=None   → закрыто для филиала X
    - branch=None, warehouse=X   → закрыто для склада X
    """
    date = models.DateField(verbose_name="Закрытая дата")
    branch = models.ForeignKey(
        'Branch', on_delete=models.CASCADE,
        null=True, blank=True, related_name='closed_periods',
        verbose_name="Филиал"
    )
    warehouse = models.ForeignKey(
        'Warehouse', on_delete=models.CASCADE,
        null=True, blank=True, related_name='closed_periods',
        verbose_name="Склад"
    )
    closed_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='closed_periods'
    )
    closed_at = models.DateTimeField(auto_now_add=True)
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['-date']
        verbose_name = "Закрытый период"
        verbose_name_plural = "Закрытые периоды"
        constraints = [
            models.UniqueConstraint(
                fields=['date', 'branch', 'warehouse'],
                name='unique_closed_period'
            )
        ]

    def __str__(self):
        parts = [f"Закрыт: {self.date}"]
        if self.branch:
            parts.append(f"филиал: {self.branch}")
        if self.warehouse:
            parts.append(f"склад: {self.warehouse}")
        if not self.branch and not self.warehouse:
            parts.append("глобально")
        return " | ".join(parts)