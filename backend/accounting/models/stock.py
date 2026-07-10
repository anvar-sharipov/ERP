# accounting/models/stock.py
import datetime

from decimal import Decimal
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models, transaction


class Warehouse(models.Model):
    name = models.CharField(max_length=255)
    branch = models.ForeignKey('Branch', on_delete=models.PROTECT, related_name='warehouses')
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    is_main = models.BooleanField(default=False, verbose_name="Основной склад")

    # ✅ Счета для автогенерации проводки при проведении "Расхода" с этого склада —
    # заполняются вручную пользователем (ничего не подставляется автоматически).
    # Разные склады могут вести учёт в разных счетах (например, чтобы не смешивать
    # суммы по разным валютам/группам товаров в ОСВ — см. обсуждение в CLAUDE.md).
    receivable_account = models.ForeignKey(
        'Account', on_delete=models.PROTECT, null=True, blank=True,
        related_name='warehouses_receivable', verbose_name="Счёт расчётов с покупателем",
    )
    revenue_account = models.ForeignKey(
        'Account', on_delete=models.PROTECT, null=True, blank=True,
        related_name='warehouses_revenue', verbose_name="Счёт выручки",
    )
    cogs_account = models.ForeignKey(
        'Account', on_delete=models.PROTECT, null=True, blank=True,
        related_name='warehouses_cogs', verbose_name="Счёт себестоимости продаж",
    )
    inventory_account = models.ForeignKey(
        'Account', on_delete=models.PROTECT, null=True, blank=True,
        related_name='warehouses_inventory', verbose_name="Счёт учёта товаров",
    )
    # ✅ Для "Прихода" — товар дебетуется на тот же inventory_account (он же кредитуется
    # в "Расходе"), а кредитуется этот счёт — задолженность перед поставщиком.
    payable_account = models.ForeignKey(
        'Account', on_delete=models.PROTECT, null=True, blank=True,
        related_name='warehouses_payable', verbose_name="Счёт расчётов с поставщиком",
    )
    # ✅ Необязательный — если не настроен, скидка просто netted в total как раньше
    # (обратная совместимость). Если настроен — "Расход"/"Возврат от покупателя" проводят
    # выручку/долг клиента ПО ПОЛНОЙ цене (subtotal), а скидку отдельной строкой:
    # Дт discount_account / Кт receivable_account — контр-счёт выручки, чтобы в ОСВ было
    # видно сумму предоставленных скидок отдельно, а не смешанной с чистой выручкой.
    discount_account = models.ForeignKey(
        'Account', on_delete=models.PROTECT, null=True, blank=True,
        related_name='warehouses_discount', verbose_name="Счёт скидок",
    )
    # ✅ Альтернативная схема проводки "Расхода" — для складов, унаследовавших учёт
    # в стиле "инвентарь списывается по полной цене продажи, прибыль — отдельной
    # ногой на фонд" (перенос данных из исторической системы, см. обсуждение с
    # пользователем). Оба поля заполняются вместе: если заполнены — Document.
    # _generate_out_posting кредитует inventory_account по ПОЛНОЙ цене продажи
    # (а не revenue_account) и по каждой строке проводит Дт profit_account/
    # Кт fund_account на прибыль строки — вместо Дт cogs_account/Кт inventory_account
    # на себестоимость. revenue_account/cogs_account в этом режиме не используются.
    profit_account = models.ForeignKey(
        'Account', on_delete=models.PROTECT, null=True, blank=True,
        related_name='warehouses_profit', verbose_name="Счёт прибыли (альт. схема)",
    )
    fund_account = models.ForeignKey(
        'Account', on_delete=models.PROTECT, null=True, blank=True,
        related_name='warehouses_fund', verbose_name="Счёт фонда прибыли (альт. схема)",
    )
    # ✅ Override-счета для контрагентов с Counterparty.type == SUPPLIER — некоторые
    # клиенты ведут расчёты с поставщиками по СОВСЕМ ДРУГИМ счетам, чем с обычными
    # покупателями (не просто другая сумма — другая роль в плане счетов). Один
    # статичный счёт на роль (как выше) не может этого выразить, поэтому здесь —
    # необязательные "запасные" счета: если у контрагента документа type=supplier
    # И соответствующее override-поле заполнено, Document._resolve_role_account берёт
    # ЕГО вместо обычного receivable_account/payable_account/profit_account. Если
    # override не заполнен — просто используется обычный счёт (обратная совместимость).
    receivable_account_supplier = models.ForeignKey(
        'Account', on_delete=models.PROTECT, null=True, blank=True,
        related_name='warehouses_receivable_supplier', verbose_name="Счёт расчётов с поставщиком (Расход)",
    )
    payable_account_supplier = models.ForeignKey(
        'Account', on_delete=models.PROTECT, null=True, blank=True,
        related_name='warehouses_payable_supplier_override', verbose_name="Счёт расчётов с поставщиком (Приход, альт.)",
    )
    profit_account_supplier = models.ForeignKey(
        'Account', on_delete=models.PROTECT, null=True, blank=True,
        related_name='warehouses_profit_supplier', verbose_name="Счёт прибыли для поставщика (альт. схема)",
    )

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


class WarehouseProductSnapshot(models.Model):
    """
    Остаток товара на складе "на конец закрытого дня" — создаётся при закрытии
    дня (см. ClosedPeriodViewSet.perform_create / accounting/services/warehouse_snapshot.py),
    один снапшот на (склад, товар, дата). Нужен, чтобы отчёты по оборотам
    (report_views.py::product_turnover) не пересчитывали остаток "на начало
    периода" сканированием ВСЕЙ истории проводок с первого дня существования
    склада каждый раз при открытии — вместо этого берут ближайший снапшот перед
    периодом и досчитывают только небольшой хвост движений после него.
    """
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name='product_snapshots')
    product = models.ForeignKey('Product', on_delete=models.CASCADE, related_name='warehouse_snapshots')
    date = models.DateField(db_index=True, verbose_name="Дата снапшота (на конец дня)")
    quantity = models.DecimalField(max_digits=15, decimal_places=3, default=0)
    value = models.DecimalField(max_digits=18, decimal_places=2, default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["warehouse", "product", "date"],
                name="unique_warehouse_product_snapshot_date"
            )
        ]
        indexes = [
            models.Index(fields=["warehouse", "date"]),
        ]
        verbose_name = "Снапшот остатка склада"
        verbose_name_plural = "Снапшоты остатков склада"

    def __str__(self):
        return f"{self.warehouse_id}/{self.product_id} на {self.date}: {self.quantity}"


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