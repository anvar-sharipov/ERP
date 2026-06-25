import datetime
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.contrib.postgres.indexes import GinIndex
from django.db import models, transaction

from .employee import Employee
from .product import Product, PriceType, Unit
from .stock import Warehouse, StockMovement
from .company import Branch
from .counterparty import Counterparty
from .transaction import JournalEntry



class DocumentParticipant(models.Model):
    class Role(models.TextChoices):
        DRIVER  = 'driver',  'Водитель'
        SELLER  = 'seller',  'Продавец'
        LOADER  = 'loader',  'Грузчик'
        CASHIER = 'cashier', 'Кассир'
        MANAGER = 'manager', 'Менеджер'
        OTHER   = 'other',   'Другое'

    document = models.ForeignKey(
        'Document', on_delete=models.CASCADE,
        related_name='participants'
    )
    employee = models.ForeignKey(
        Employee, on_delete=models.PROTECT,
        related_name='document_participations'
    )
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.OTHER)

    class Meta:
        verbose_name = "Участник документа"
        verbose_name_plural = "Участники документа"
        constraints = [
            models.UniqueConstraint(
                fields=['document', 'employee', 'role'],
                name='unique_document_employee_role'
            )
        ]

    def __str__(self):
        return f"{self.get_role_display()}: {self.employee.full_name}"

    def delete(self, *args, **kwargs):
        if self.document.status == Document.Status.POSTED:
            raise ValidationError("Нельзя удалять участников проведённого документа.")
        super().delete(*args, **kwargs)


class Document(models.Model):
    class Type(models.TextChoices):
        IN         = 'in',         'Приходная накладная'
        OUT        = 'out',        'Расходная накладная'
        MOVE       = 'move',       'Перемещение'
        RETURN_IN  = 'return_in',  'Возврат от покупателя'
        RETURN_OUT = 'return_out', 'Возврат поставщику'

    class Status(models.TextChoices):
        DRAFT  = 'draft',  'Черновик'
        POSTED = 'posted', 'Проведён'

    number        = models.CharField(max_length=30, unique=True, blank=True)
    document_type = models.CharField(max_length=10, choices=Type.choices, db_index=True)
    status        = models.CharField(
        max_length=10, choices=Status.choices,
        default=Status.DRAFT, db_index=True
    )
    date = models.DateField(default=datetime.date.today, db_index=True)

    warehouse = models.ForeignKey(
        Warehouse, on_delete=models.PROTECT,
        null=True, blank=True, related_name='documents'
    )
    warehouse_to = models.ForeignKey(
        Warehouse, on_delete=models.PROTECT,
        null=True, blank=True, related_name='documents_in'
    )
    branch = models.ForeignKey(
        Branch, on_delete=models.PROTECT,
        null=True, blank=True, related_name='documents'
    )
    counterparty = models.ForeignKey(
        Counterparty, on_delete=models.PROTECT,
        null=True, blank=True, related_name='documents'
    )
    base_document = models.ForeignKey(
        'self', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='child_documents'
    )

    default_price_type = models.ForeignKey(
        PriceType, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='documents',
        verbose_name="Тип цены по умолчанию"
    )

    subtotal         = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    discount_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        validators=[MinValueValidator(0)]
    )
    discount_amount  = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total            = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_profit     = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    note       = models.CharField(max_length=500, blank=True)
    extra_data = models.JSONField(default=dict, blank=True)

    journal_entry = models.OneToOneField(
        JournalEntry, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='document'
    )

    posted_at = models.DateTimeField(null=True, blank=True)
    posted_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='posted_documents'
    )
    created_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='created_documents'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-number']
        verbose_name = "Документ"
        verbose_name_plural = "Документы"
        indexes = [
            models.Index(fields=['document_type', 'status', 'date']),
            models.Index(fields=['counterparty', 'date']),
            models.Index(fields=['warehouse', 'date']),
            GinIndex(fields=['extra_data'], name='document_extra_data_gin'),
        ]

    def __str__(self):
        return f"{self.get_document_type_display()} №{self.number} от {self.date}"

    def save(self, *args, **kwargs):
        if self.pk:
            try:
                old = Document.objects.get(pk=self.pk)
                if old.status == self.Status.POSTED:
                    allowed = {
                        'status', 'posted_at', 'posted_by',
                        'journal_entry', 'subtotal', 'discount_amount',
                        'total', 'total_profit',
                    }
                    update_fields = kwargs.get('update_fields')
                    if update_fields is None:
                        raise ValidationError("Нельзя изменять проведённый документ.")
                    if not set(update_fields).issubset(allowed):
                        raise ValidationError("Нельзя изменять проведённый документ.")
            except Document.DoesNotExist:
                pass

        is_new = self.pk is None
        super().save(*args, **kwargs)

        if is_new and not self.number:
            from django.utils import timezone
            prefix_map = {
                'in':         'IN',
                'out':        'OUT',
                'move':       'MOV',
                'return_in':  'RIN',
                'return_out': 'ROUT',
            }
            prefix = prefix_map.get(self.document_type, 'DOC')
            year = timezone.now().year
            self.number = f'{prefix}-{year}-{self.pk:06d}'
            Document.objects.filter(pk=self.pk).update(number=self.number)

    def clean(self):
        if self.document_type == self.Type.MOVE:
            if not self.warehouse:
                raise ValidationError("Укажите склад-источник.")
            if not self.warehouse_to:
                raise ValidationError("Укажите склад-получатель.")
            if self.warehouse_id and self.warehouse_id == self.warehouse_to_id:
                raise ValidationError("Склад-источник и склад-получатель не могут совпадать.")
        if self.document_type in (
            self.Type.IN, self.Type.OUT,
            self.Type.RETURN_IN, self.Type.RETURN_OUT
        ):
            if not self.warehouse:
                raise ValidationError("Укажите склад.")
            if not self.counterparty:
                raise ValidationError("Укажите контрагента.")

    def delete(self, *args, **kwargs):
        if self.status == self.Status.POSTED:
            raise ValidationError("Нельзя удалить проведённый документ.")
        super().delete(*args, **kwargs)

    def recalculate(self):
        from django.db.models import Sum, F, ExpressionWrapper
        from django.db.models import DecimalField as DF
        from django.db.models.functions import Coalesce

        agg = self.items.aggregate(
            subtotal=Coalesce(
                Sum(ExpressionWrapper(
                    F('price') * F('quantity'),
                    output_field=DF(max_digits=15, decimal_places=2)
                )),
                Decimal('0'),
                output_field=DF(max_digits=15, decimal_places=2)
            ),
            profit=Coalesce(
                Sum(ExpressionWrapper(
                    (F('price') - F('cost_price')) * F('quantity'),
                    output_field=DF(max_digits=15, decimal_places=2)
                )),
                Decimal('0'),
                output_field=DF(max_digits=15, decimal_places=2)
            ),
        )

        subtotal        = agg['subtotal']
        discount_amount = (subtotal * self.discount_percent / 100).quantize(Decimal('0.01'))
        total           = subtotal - discount_amount
        total_profit    = agg['profit'] if self.document_type in (
            self.Type.OUT, self.Type.RETURN_IN
        ) else Decimal('0')

        Document.objects.filter(pk=self.pk).update(
            subtotal=subtotal,
            discount_amount=discount_amount,
            total=total,
            total_profit=total_profit,
        )
        self.subtotal        = subtotal
        self.discount_amount = discount_amount
        self.total           = total
        self.total_profit    = total_profit

    @transaction.atomic
    def post(self, user=None):
        from accounting.utils import check_period_open
        from django.utils import timezone
        if self.status == self.Status.POSTED:
            raise ValidationError("Документ уже проведён.")
        if not self.items.exists():
            raise ValidationError("Нельзя провести пустой документ.")
        # check_period_open(self.date)
        check_period_open(self.date, branch_id=self.branch_id, warehouse_id=self.warehouse_id)
        self._create_stock_movements()
        self.status    = self.Status.POSTED
        self.posted_at = timezone.now()
        self.posted_by = user
        self.save(update_fields=['status', 'posted_at', 'posted_by'])

    @transaction.atomic
    def unpost(self, user=None):
        from accounting.utils import check_period_open
        if self.status == self.Status.DRAFT:
            raise ValidationError("Документ ещё не проведён.")
        # check_period_open(self.date)
        check_period_open(self.date, branch_id=self.branch_id, warehouse_id=self.warehouse_id)
        self._rollback_stock_movements()
        if self.journal_entry:
            self.journal_entry.delete()
            self.journal_entry = None
        self.status    = self.Status.DRAFT
        self.posted_at = None
        self.posted_by = None
        self.save(update_fields=['status', 'posted_at', 'posted_by', 'journal_entry'])

    def _stock_direction(self, reverse=False):
        fwd = {
            self.Type.IN:         StockMovement.Direction.IN,
            self.Type.OUT:        StockMovement.Direction.OUT,
            self.Type.MOVE:       StockMovement.Direction.MOVE,
            self.Type.RETURN_IN:  StockMovement.Direction.IN,
            self.Type.RETURN_OUT: StockMovement.Direction.OUT,
        }
        rev = {
            self.Type.IN:         StockMovement.Direction.OUT,
            self.Type.OUT:        StockMovement.Direction.IN,
            self.Type.MOVE:       StockMovement.Direction.MOVE,
            self.Type.RETURN_IN:  StockMovement.Direction.OUT,
            self.Type.RETURN_OUT: StockMovement.Direction.IN,
        }
        return rev[self.document_type] if reverse else fwd[self.document_type]

    def _create_stock_movements(self):
        direction = self._stock_direction()
        for item in self.items.select_related('product'):
            StockMovement.objects.create(
                warehouse    = self.warehouse,
                warehouse_to = self.warehouse_to,
                product      = item.product,
                direction    = direction,
                quantity     = item.quantity,
                cost_price   = item.cost_price,
                note         = f"Документ №{self.number}",
                date         = self.date,
            )

    def _rollback_stock_movements(self):
        direction = self._stock_direction(reverse=True)
        for item in self.items.select_related('product'):
            wh    = self.warehouse_to if self.document_type == self.Type.MOVE else self.warehouse
            wh_to = self.warehouse    if self.document_type == self.Type.MOVE else None
            StockMovement.objects.create(
                warehouse    = wh,
                warehouse_to = wh_to,
                product      = item.product,
                direction    = direction,
                quantity     = item.quantity,
                cost_price   = item.cost_price,
                note         = f"Отмена документа №{self.number}",
                date         = self.date,
            )

class DocumentItem(models.Model):
    document   = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='items')
    product    = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='document_items')
    unit       = models.ForeignKey(Unit, on_delete=models.PROTECT, null=True, blank=True)
    line_no    = models.PositiveIntegerField(default=1, verbose_name="№ строки")

    quantity         = models.DecimalField(
        max_digits=15, decimal_places=3,
        validators=[MinValueValidator(Decimal('0.001'))]
    )
    price            = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    price_type       = models.ForeignKey(
        PriceType, on_delete=models.SET_NULL,
        null=True, blank=True
    )
    discount_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        validators=[MinValueValidator(0)]
    )
    cost_price = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    extra_data = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Строка документа"
        ordering = ['line_no', 'id']
        constraints = [
            models.CheckConstraint(
                check=models.Q(quantity__gt=0),
                name='document_item_quantity_gt_zero'
            )
        ]

    def __str__(self):
        return f"{self.product.name} x {self.quantity}"

    def save(self, *args, **kwargs):
        if self.document.status == Document.Status.POSTED:
            raise ValidationError("Нельзя изменять строки проведённого документа.")
        if not self.unit_id and self.product_id:
            self.unit = self.product.unit
        if not self.cost_price and self.product_id:
            self.cost_price = self.product.cost_price
        super().save(*args, **kwargs)
        self.document.recalculate()

    def delete(self, *args, **kwargs):
        if self.document.status == Document.Status.POSTED:
            raise ValidationError("Нельзя удалять строки проведённого документа.")
        document = self.document
        super().delete(*args, **kwargs)
        document.recalculate()
        
        
        
        

        