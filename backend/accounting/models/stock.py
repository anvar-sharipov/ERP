# accounting/models/stock.py
import datetime

from decimal import Decimal
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models, transaction


class Warehouse(models.Model):
    name = models.CharField(max_length=255)
    branch = models.ForeignKey('Branch', null=True, blank=True, on_delete=models.SET_NULL, related_name='warehouses')
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    is_main = models.BooleanField(default=False, verbose_name="Основной склад")

    class Meta:
        verbose_name = "Склад"

    def __str__(self):
        return self.name


class WarehouseStock(models.Model):
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name='stocks')
    product = models.ForeignKey('Product', on_delete=models.CASCADE, related_name='stocks')
    quantity = models.DecimalField(max_digits=15, decimal_places=3, default=0)
    reserved_quantity = models.DecimalField(max_digits=15, decimal_places=3, default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["warehouse", "product"],
                name="unique_warehouse_product"
            )
        ]
        indexes = [
            models.Index(fields=["product"]),
            models.Index(fields=["warehouse"]),
        ]
        verbose_name = "Остаток на складе"


class StockMovement(models.Model):
    """
    Каждое физическое движение товара фиксируется здесь.
    """
    class Direction(models.TextChoices):
        IN = 'in', 'Приход'
        OUT = 'out', 'Расход'
        MOVE = 'move', 'Перемещение'

    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name='movements')
    warehouse_to = models.ForeignKey(
        Warehouse, on_delete=models.PROTECT,
        null=True, blank=True, related_name='movements_in'
    )
    product = models.ForeignKey('Product', on_delete=models.PROTECT, related_name='movements')
    direction = models.CharField(max_length=4, choices=Direction.choices, db_index=True)
    quantity = models.DecimalField(
        max_digits=15, decimal_places=3,
        validators=[MinValueValidator(Decimal('0.001'))]
    )
    cost_price = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    journal_entry = models.ForeignKey(
        'JournalEntry', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='stock_movements'
    )
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='stock_movements'
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    date = models.DateField(
        default=datetime.date.today,
        verbose_name="Дата операции",
        db_index=True,
    )

    def clean(self):
        if self.direction == self.Direction.MOVE and not self.warehouse_to:
            raise ValidationError(
                "Для перемещения нужно указать склад-получатель (warehouse_to)"
            )
        if self.direction != self.Direction.MOVE and self.warehouse_to:
            raise ValidationError(
                "warehouse_to заполняется только для перемещений"
            )

    def save(self, *args, **kwargs):
        from accounting.utils import check_period_open
        self.full_clean()
        # check_period_open(self.date)
        check_period_open(self.date, warehouse_id=self.warehouse_id)

        with transaction.atomic():
            super().save(*args, **kwargs)
            self._update_stock()

    def _update_stock(self):
        """Обновляем остатки с проверкой наличия."""
        if self.direction in (self.Direction.OUT, self.Direction.MOVE):
            stock, _ = WarehouseStock.objects.select_for_update().get_or_create(
                warehouse=self.warehouse,
                product=self.product,
                defaults={'quantity': 0}
            )

            available = stock.quantity - stock.reserved_quantity
            if available < self.quantity:
                raise ValidationError(
                    f"Недостаточно товара '{self.product}' на складе '{self.warehouse}'. "
                    f"Доступно: {available}, запрошено: {self.quantity}"
                )

            WarehouseStock.objects.filter(pk=stock.pk).update(
                quantity=models.F('quantity') - self.quantity
            )

        if self.direction in (self.Direction.IN, self.Direction.MOVE):
            target_warehouse = self.warehouse_to if self.direction == self.Direction.MOVE else self.warehouse

            stock, _ = WarehouseStock.objects.get_or_create(
                warehouse=target_warehouse,
                product=self.product,
                defaults={'quantity': 0}
            )

            WarehouseStock.objects.filter(pk=stock.pk).update(
                quantity=models.F('quantity') + self.quantity
            )

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Движение по складу"
        verbose_name_plural = "Движения по складу"
        indexes = [
            models.Index(fields=['warehouse', 'product', 'created_at']),
            models.Index(fields=['direction']),
        ]