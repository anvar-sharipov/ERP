# accounting/models/product.py
import uuid
from decimal import Decimal
from uuid import uuid4

from django.contrib.postgres.indexes import GinIndex
from django.core.validators import MinValueValidator
from django.db import connection, models
from django.db.models import Q
from imagekit.models import ImageSpecField, ProcessedImageField
from imagekit.processors import ResizeToFit
from users.models import User

from utils.validators import validate_image_size



class ProductCategory(models.Model):
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='children')
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Категория товара"
        verbose_name_plural = "Категории товаров"

    def __str__(self):
        return self.name


class Brand(models.Model):
    name = models.CharField(max_length=255, unique=True)
    slug = models.SlugField(unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Бренд"
        verbose_name_plural = "Бренды"

    def __str__(self):
        return self.name


class Tag(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(unique=True)

    class Meta:
        verbose_name = "Тег"
        verbose_name_plural = "Теги"

    def __str__(self):
        return self.name


class Unit(models.Model):
    """Единица измерения: шт, кг, л, м..."""
    name = models.CharField(max_length=50)
    short_name = models.CharField(max_length=10)

    class Meta:
        verbose_name = "Единица измерения"
        verbose_name_plural = "Единицы измерения"

    def __str__(self):
        return self.short_name


class Product(models.Model):
    class ImageMode(models.TextChoices):
        CONTAIN = "contain", "Вписать"
        COVER = "cover", "Заполнить"

    name = models.CharField(max_length=255, verbose_name="Название товара")
    sku = models.CharField(max_length=100, unique=True, blank=True, null=True, verbose_name="Артикул")
    image_mode = models.CharField(max_length=20, choices=ImageMode.choices, default=ImageMode.CONTAIN)
    barcode = models.CharField(max_length=100, unique=True, blank=True, null=True, verbose_name="Штрихкод (EAN-13)")
    qr_code = models.CharField(max_length=255, unique=True, blank=True, null=True, verbose_name="QR-код / Серийный номер")

    category = models.ForeignKey(ProductCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name='products', verbose_name="Категория")
    brand = models.ForeignKey(Brand, on_delete=models.SET_NULL, null=True, blank=True, related_name='products', verbose_name="Бренд")
    unit = models.ForeignKey(Unit, on_delete=models.PROTECT, null=True, related_name='products', verbose_name="Единица измерения")
    tags = models.ManyToManyField(Tag, blank=True, related_name='products', verbose_name="Теги")

    cost_price = models.DecimalField(max_digits=15, decimal_places=2, default=0, verbose_name="Себестоимость")
    min_stock_level = models.IntegerField(default=0, verbose_name="Мин. остаток для заказа")
    is_active = models.BooleanField(default=True, verbose_name="Активен")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата обновления")

    length = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name="Длина (см)")
    width = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name="Ширина (см)")
    height = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name="Высота (см)")
    weight = models.DecimalField(max_digits=10, decimal_places=3, default=0, verbose_name="Вес (кг)")
    volume_m3 = models.DecimalField(max_digits=12, decimal_places=6, default=0, verbose_name="Объем (м³)")
    description = models.TextField(blank=True)
    extra_data = models.JSONField(default=dict, blank=True, verbose_name="Доп. данные")
    


    class Meta:
        verbose_name = "Товар"
        verbose_name_plural = "Товары"
        indexes = [
            GinIndex(fields=['extra_data'], name='product_extra_data_gin'),
            models.Index(fields=['barcode'], name='product_barcode_idx'),
            models.Index(fields=['qr_code'], name='product_qr_code_idx'),
            models.Index(fields=['name'], name='product_name_idx'),
        ]

    def save(self, *args, **kwargs):
        is_new = self.pk is None

        if self.length and self.width and self.height:
            self.volume_m3 = (
                self.length
                * self.width
                * self.height
            ) / Decimal("1000000")

        super().save(*args, **kwargs)

        update_fields = []

        if is_new and not self.sku:
            self.sku = f"PRD-{self.pk:06d}"
            update_fields.append("sku")

        if not self.barcode:
            self.barcode = f"200{self.pk:09d}"
            update_fields.append("barcode")

        if not self.qr_code:
            self.qr_code = self.sku or f"PRD-{self.pk:06d}"
            update_fields.append("qr_code")

        if update_fields:
            super().save(update_fields=update_fields)
        
 

    def __str__(self):
        return f"{self.name} ({self.sku})"


def product_image_path(instance, filename):
    ext = filename.split(".")[-1].lower()
    filename = f"{uuid.uuid4()}.{ext}"
    schema = connection.schema_name
    return f"{schema}/products/{instance.product_id}/images/{filename}"


class ProductImage(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="images", verbose_name="Товар")
    image = ProcessedImageField(
        upload_to=product_image_path,
        processors=[ResizeToFit(1600, 1600)],
        format="JPEG",
        options={"quality": 85, "optimize": True},
        validators=[validate_image_size],
        verbose_name="Изображение"
    )
    thumbnail = ImageSpecField(
        source="image",
        processors=[ResizeToFit(200, 200)],
        format="JPEG",
        options={"quality": 80, "optimize": True}
    )
    is_main = models.BooleanField(default=False, verbose_name="Главное изображение")
    sort_order = models.PositiveIntegerField(default=0, verbose_name="Порядок сортировки")
    alt_text = models.CharField(max_length=255, blank=True, verbose_name="Описание изображения")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата загрузки")

    class Meta:
        verbose_name = "Изображение товара"
        verbose_name_plural = "Изображения товаров"
        ordering = ["sort_order", "id"]
        indexes = [
            models.Index(fields=["product", "is_main"], name="product_main_img_idx"),
            models.Index(fields=["product", "sort_order"], name="product_sort_img_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["product"],
                condition=Q(is_main=True),
                name="unique_main_product_image",
            )
        ]

    def save(self, *args, **kwargs):
        if not self.alt_text:
            self.alt_text = self.product.name

        if self.is_main:
            ProductImage.objects.filter(product=self.product).exclude(pk=self.pk).update(is_main=False)
        elif not ProductImage.objects.filter(product=self.product, is_main=True).exclude(pk=self.pk).exists():
            self.is_main = True

        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        product = self.product
        was_main = self.is_main

        if self.image:
            self.image.delete(save=False)

        super().delete(*args, **kwargs)

        if was_main:
            next_image = product.images.first()
            if next_image:
                next_image.is_main = True
                next_image.save(update_fields=["is_main"])

    def __str__(self):
        return f"{self.product.name} - Image #{self.pk}"


class PriceType(models.Model):
    name = models.CharField(max_length=100, unique=True, verbose_name="Тип цены")

    class Meta:
        verbose_name = "Тип цены"
        verbose_name_plural = "Типы цен"

    def __str__(self):
        return self.name


class ProductPrice(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="prices")
    warehouse = models.ForeignKey(
        "Warehouse",
        on_delete=models.CASCADE,
        related_name="prices",
        null=True,
        blank=True,
    )
    price_type = models.ForeignKey(PriceType, on_delete=models.CASCADE, related_name="prices")
    price = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)]
    )
    valid_from = models.DateTimeField(auto_now_add=True, verbose_name="Действует с")
    valid_to = models.DateTimeField(null=True, blank=True, verbose_name="Действует до")
    is_active = models.BooleanField(default=True, verbose_name="Активна")

    class Meta:
        verbose_name = "Цена товара"
        verbose_name_plural = "Цены товаров"
        constraints = [
            models.UniqueConstraint(
                fields=["product", "warehouse", "price_type"],
                condition=Q(is_active=True),
                nulls_distinct=False,
                name="unique_active_product_price",
            )
        ]
        indexes = [
            models.Index(fields=["product", "warehouse"]),
            models.Index(fields=["price_type"]),
            models.Index(fields=["is_active"]),
        ]

    def __str__(self):
        return f"{self.product} | {self.warehouse} | {self.price_type} = {self.price}"