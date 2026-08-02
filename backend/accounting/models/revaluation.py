# accounting/models/revaluation.py
from django.db import models


class ProductRevaluation(models.Model):
    """
    Переоценка товарных остатков — создаётся ТОЛЬКО системно, из
    Document._update_product_cost_prices() (models/document.py), в момент
    изменения Product.cost_price при проведении "Прихода". cost_price —
    ГЛОБАЛЬНОЕ поле товара (одно на все склады, см. CLAUDE.md про модель
    "последняя цена закупки"), поэтому при его изменении переоценивается
    остаток на КАЖДОМ складе, где он есть — по одной строке на склад.

    Снимок остатка (quantity) и разница (diff_amount) фиксируются на момент
    события и больше НЕ пересчитываются — последующие движения товара (продажи,
    перемещения) не меняют уже созданные строки. Это осознанно: отчёт должен
    показывать, что именно произошло в момент переоценки, а не текущее
    состояние задним числом.
    """
    product = models.ForeignKey(
        'Product', on_delete=models.CASCADE, related_name='revaluations',
        verbose_name="Товар",
    )
    warehouse = models.ForeignKey(
        'Warehouse', on_delete=models.PROTECT, related_name='revaluations',
        verbose_name="Склад",
    )
    branch = models.ForeignKey(
        'Branch', on_delete=models.PROTECT, related_name='product_revaluations',
        verbose_name="Филиал",
    )
    # ✅ Приходная накладная, проведение которой изменило себестоимость — источник
    # события. SET_NULL (не CASCADE) — удаление/распроведение документа не должно
    # стирать уже случившийся факт переоценки из отчёта.
    document = models.ForeignKey(
        'Document', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='product_revaluations', verbose_name="Документ-основание",
    )
    date = models.DateField(db_index=True, verbose_name="Дата документа-основания")

    quantity = models.DecimalField(max_digits=15, decimal_places=3, verbose_name="Остаток на момент переоценки")
    old_cost_price = models.DecimalField(max_digits=15, decimal_places=3, verbose_name="Себестоимость до")
    new_cost_price = models.DecimalField(max_digits=15, decimal_places=3, verbose_name="Себестоимость после")
    # ✅ quantity * (new_cost_price - old_cost_price) — положительная = дооценка
    # (прибыль), отрицательная = уценка (убыток). Храним готовым числом, а не
    # пересчитываем при каждом чтении отчёта — количество строк может быть большим
    # (server-side пагинация), и это чистая арифметика без побочных эффектов.
    diff_amount = models.DecimalField(max_digits=18, decimal_places=2, verbose_name="Разница (дооценка/уценка)")

    created_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='product_revaluations', verbose_name="Кто провёл документ-основание",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-id']
        verbose_name = "Переоценка товара"
        verbose_name_plural = "Переоценки товаров"
        indexes = [
            models.Index(fields=['warehouse', 'date'], name='revaluation_warehouse_date_idx'),
            models.Index(fields=['branch', 'date'], name='revaluation_branch_date_idx'),
            models.Index(fields=['product', 'date'], name='revaluation_product_date_idx'),
        ]

    def __str__(self):
        return f"{self.product_id} @ {self.warehouse_id}: {self.old_cost_price} → {self.new_cost_price} ({self.date})"
