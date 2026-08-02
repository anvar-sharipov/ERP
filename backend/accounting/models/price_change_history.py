# accounting/models/price_change_history.py
from django.db import models


class PriceChangeHistory(models.Model):
    """
    Универсальный лог изменения ЛЮБОЙ цены товара — и ProductPrice (опт/розница/
    скидка и т.д., см. PriceType), и себестоимости (Product.cost_price;
    price_type=None означает "Себестоимость", у неё нет своего PriceType).

    В отличие от ProductRevaluation (accounting/models/revaluation.py) — детальная
    построчная переоценка ПО КАЖДОМУ складу, только для себестоимости — здесь ОДНА
    строка на событие изменения цены, с остатком, агрегированным в том охвате,
    которым обладает сама цена (склад/филиал/вся компания). Обе таблицы
    заполняются из одной и той же точки для себестоимости (см.
    Document._update_product_cost_prices), не дублируя друг друга по смыслу:
    ProductRevaluation — точная бухгалтерская переоценка остатков, эта модель —
    общий обзорный лог изменения цен любого типа для отчёта "История изменения цен".
    """
    product = models.ForeignKey(
        'Product', on_delete=models.CASCADE, related_name='price_change_history',
        verbose_name="Товар",
    )
    price_type = models.ForeignKey(
        'PriceType', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='change_history', verbose_name="Тип цены (пусто = себестоимость)",
    )
    # ✅ Строка ProductPrice-основания — только для изменений через каталог цен,
    # null для себестоимости (там нет ProductPrice). SET_NULL — удаление строки
    # цены не должно стирать уже случившийся факт изменения из истории.
    product_price = models.ForeignKey(
        'ProductPrice', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='change_history', verbose_name="Строка цены-основания",
    )
    warehouse = models.ForeignKey(
        'Warehouse', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='price_change_history', verbose_name="Склад (если цена привязана к складу)",
    )
    branch = models.ForeignKey(
        'Branch', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='price_change_history', verbose_name="Филиал (если цена привязана к филиалу)",
    )
    document = models.ForeignKey(
        'Document', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='price_change_history', verbose_name="Документ-основание (для себестоимости)",
    )

    date = models.DateField(db_index=True, verbose_name="Дата изменения")

    old_price = models.DecimalField(max_digits=15, decimal_places=3, verbose_name="Старая цена")
    new_price = models.DecimalField(max_digits=15, decimal_places=3, verbose_name="Новая цена")
    quantity_at_change = models.DecimalField(max_digits=15, decimal_places=3, verbose_name="Остаток на момент изменения")
    old_sum = models.DecimalField(max_digits=18, decimal_places=2, verbose_name="Сумма по старой цене")
    new_sum = models.DecimalField(max_digits=18, decimal_places=2, verbose_name="Сумма по новой цене")
    # ✅ new_sum - old_sum — положительная = прибыль, отрицательная = убыток.
    # Готовым числом, не пересчитывается при чтении отчёта (server-пагинация).
    diff_amount = models.DecimalField(max_digits=18, decimal_places=2, verbose_name="Разница (прибыль/убыток)")

    created_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='price_change_history', verbose_name="Кто изменил",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-id']
        verbose_name = "История изменения цены"
        verbose_name_plural = "История изменения цен"
        indexes = [
            models.Index(fields=['product', 'date'], name='pricehist_product_date_idx'),
            models.Index(fields=['price_type', 'date'], name='pricehist_type_date_idx'),
        ]

    def __str__(self):
        return f"{self.product_id}: {self.old_price} → {self.new_price} ({self.date})"
