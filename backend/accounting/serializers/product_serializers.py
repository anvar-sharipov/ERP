# backend/accounting/serializers/product_serializers.py
from rest_framework import serializers
from ..models import (
    Unit, Brand, Tag, ProductCategory,
    Product, ProductImage, PriceType, ProductPrice,
    Counterparty, Warehouse, WarehouseStock, ProductBundle, VolumeDiscount,
    QuantityPromotion
)
from .employee_serializers import AgentShortSerializer

from rest_framework import serializers



class UnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unit
        fields = ["id", "name", "short_name"]


class BrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = ["id", "name", "slug", "is_active"]


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ["id", "name", "slug"]


class ProductCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductCategory
        fields = ["id", "name", "slug", "parent", "is_active"]


class ProductCategoryShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductCategory
        fields = ["id", "name"]


class BrandShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = ["id", "name"]


class UnitShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unit
        fields = ["id", "name", "short_name"]


class WarehouseShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = Warehouse
        fields = ["id", "name"]


# ── Images ──────────────────────────────────────────────────────────────────

class ProductImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = ProductImage
        fields = [
            "id", "product", "image_url", "thumbnail_url",
            "is_main", "sort_order", "alt_text", "created_at",
        ]
        read_only_fields = ["created_at"]

    def get_image_url(self, obj):
        request = self.context.get("request")
        if obj.image and request:
            return request.build_absolute_uri(obj.image.url)
        return None

    def get_thumbnail_url(self, obj):
        request = self.context.get("request")
        try:
            if obj.thumbnail and request:
                return request.build_absolute_uri(obj.thumbnail.url)
        except Exception:
            pass
        return None


class ProductImageUploadSerializer(serializers.ModelSerializer):
    """Отдельный сериализатор для загрузки — принимает файл"""
    class Meta:
        model = ProductImage
        fields = ["id", "product", "image", "is_main", "sort_order", "alt_text"]


# ── Prices ───────────────────────────────────────────────────────────────────

class PriceTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PriceType
        fields = ["id", "name"]


class ProductPriceSerializer(serializers.ModelSerializer):
    price_type_name = serializers.CharField(source="price_type.name", read_only=True)
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)

    class Meta:
        model = ProductPrice
        fields = [
            "id", "product",
            "warehouse", "warehouse_name",
            "branch", "branch_name",
            "price_type", "price_type_name",
            "price", "valid_from", "valid_to", "is_active",
        ]
        read_only_fields = ["valid_from"]


# ── Product ───────────────────────────────────────────────────────────────────

 
class BundleItemSerializer(serializers.ModelSerializer):
    bundle_product_id = serializers.IntegerField(source="bundle_product.id", read_only=True)
    bundle_product_name = serializers.CharField(source="bundle_product.name", read_only=True)
    bundle_product_unit = serializers.IntegerField(source="bundle_product.unit_id", read_only=True)
    bundle_product_unit_name = serializers.CharField(
        source="bundle_product.unit.name", read_only=True, default=""
    )
    bundle_product_thumbnail = serializers.SerializerMethodField()

    class Meta:
        model = ProductBundle
        fields = [
            "id",
            "bundle_product_id",
            "bundle_product_name",
            "bundle_product_unit",
            "bundle_product_unit_name",
            "bundle_product_thumbnail",
            "qty_ratio",
            "default_price",
        ]

    def get_bundle_product_thumbnail(self, obj):
        images = obj.bundle_product.images.all()
        main = next((img for img in images if img.is_main), None)
        if main is None and images:
            main = images[0]
        if main:
            request = self.context.get("request")
            try:
                url = main.thumbnail.url
                return request.build_absolute_uri(url) if request else url
            except Exception:
                return None
        return None
 

 # ── VolumeDiscount ────────────────────────────────────────────────────────────
class VolumeDiscountSerializer(serializers.ModelSerializer):
    price_type_name = serializers.CharField(source="price_type.name", read_only=True)

    class Meta:
        model  = VolumeDiscount
        fields = [
            "id", "product",
            "price_type", "price_type_name",
            "min_qty", "max_qty",
            "discount_percent",
        ]

    def validate(self, attrs):
        min_qty = attrs.get("min_qty", 0)
        max_qty = attrs.get("max_qty")
        if max_qty is not None and max_qty <= min_qty:
            raise serializers.ValidationError(
                {"max_qty": "max_qty должен быть больше min_qty."}
            )
        return attrs


# ── QuantityPromotion ("N за N", бесплатное кол-во того же товара) ─────────────
class QuantityPromotionSerializer(serializers.ModelSerializer):
    price_type_name = serializers.CharField(source="price_type.name", read_only=True)

    class Meta:
        model  = QuantityPromotion
        fields = [
            "id", "product",
            "price_type", "price_type_name",
            "min_qty", "max_qty",
            "free_qty",
        ]

    def validate(self, attrs):
        min_qty = attrs.get("min_qty", 0)
        max_qty = attrs.get("max_qty")
        if max_qty is not None and max_qty <= min_qty:
            raise serializers.ValidationError(
                {"max_qty": "max_qty должен быть больше min_qty."}
            )
        return attrs


class ProductMainImageMixin:
    """Общий get_main_image для ProductSerializer/ProductListSerializer — берёт
    из prefetch (obj.images.all()), чтобы не делать лишний запрос на товар."""

    def get_main_image(self, obj):
        images = obj.images.all()
        main = next((img for img in images if img.is_main), None)
        if main is None and images:
            main = images[0]
        if main:
            return ProductImageSerializer(main, context=self.context).data
        return None


class ProductListSerializer(serializers.ModelSerializer):
    """
    ✅ Облегчённый сериализатор для ProductViewSet.list_light (ProductsListPage.tsx)
    — только текстовые поля (фото/категория/бренд/ед.изм./себестоимость/статус).
    Цены/остатки/оборотность список получает отдельными bulk-эндпоинтами
    (pricesMap/stockBalance/product_turnover), а не через это поле.

    ✅ ФОТО (images/main_image) сюда сознательно НЕ включено, хотя раньше было —
    django-imagekit генерирует thumbnail.url СИНХРОННО при первом обращении
    (см. get_thumbnail_url), и на каталоге в тысячи товаров с ещё не
    сгенерированным кэшем превью это и было причиной долгой загрузки всей
    страницы (ни одна строка не отрисовывалась, пока не сгенерировались ВСЕ
    превью). Фото теперь отдаёт отдельный bulk-эндпоинт (list_light_images) —
    ProductsListPage.tsx рендерит текст сразу по этому сериализатору, а фото
    дорисовывается по мере готовности второго запроса, с спиннером на ячейку.
    """
    category_detail = ProductCategoryShortSerializer(source="category", read_only=True)
    brand_detail = BrandShortSerializer(source="brand", read_only=True)
    unit_detail = UnitShortSerializer(source="unit", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "name", "sku",
            "category", "category_detail",
            "brand", "brand_detail",
            "unit", "unit_detail",
            "cost_price", "is_active",
        ]


class ProductDocumentPriceSerializer(serializers.ModelSerializer):
    """
    ✅ Цена товара только теми двумя полями, что реально читает форма документа
    (Invoice/Interface.ts::Product.prices: {price_type, price} — используется в
    ProductRow.tsx для автоподстановки цены строки по выбранному типу цены).
    Полный ProductPriceSerializer (warehouse_name/branch_name/valid_from/
    valid_to/is_active/id/product) тут не нужен — с ~24 тыс. строк цен на
    каталоге polisem (в среднем ~8 цен на товар) именно этот вложенный список
    был основным весом ответа /products/list-for-document/.
    """
    class Meta:
        model = ProductPrice
        fields = ["price_type", "price"]


class ProductDocumentSerializer(ProductMainImageMixin, serializers.ModelSerializer):
    """
    ✅ Облегчённый сериализатор для GET /products/list-for-document/ —
    специально под DocumentFormPage.tsx/ProductRow.tsx (SearchableSelect выбора
    товара в строке документа + автоподстановка цены/себестоимости/
    комплектующих/акции "количество за количество"). В отличие от полного
    ProductSerializer (который этот экран раньше использовал через обычный
    getAll()) здесь НЕТ tags/category/allowed_warehouses/description/
    extra_data/полной галереи images — на каталоге в тысячи товаров (см.
    расследование "долго грузится SearchableSelect" на polisem: 3158 товаров ×
    полный ProductSerializer с вложенными tags/images/bundle_items/
    volume_discounts/quantity_promotions на КАЖДЫЙ) это и было причиной
    долгой загрузки формы накладной. Набор полей — ровно то, что читает
    Invoice/Interface.ts::Product (ни поля больше, ни меньше) — если форма
    начнёт использовать новое поле товара, добавлять его нужно в обоих местах.
    """
    unit_detail = UnitShortSerializer(source="unit", read_only=True)
    main_image = serializers.SerializerMethodField()
    prices = ProductDocumentPriceSerializer(many=True, read_only=True)
    bundle_items = BundleItemSerializer(many=True, read_only=True)
    volume_discounts = VolumeDiscountSerializer(many=True, read_only=True)
    quantity_promotions = QuantityPromotionSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "name", "sku", "barcode", "is_active",
            "unit", "unit_detail", "cost_price",
            "prices", "bundle_items", "volume_discounts", "quantity_promotions",
            "weight", "volume_m3", "length", "width", "height",
            "main_image",
        ]


class ProductSerializer(ProductMainImageMixin, serializers.ModelSerializer):
    category_detail = ProductCategoryShortSerializer(source="category", read_only=True)
    brand_detail = BrandShortSerializer(source="brand", read_only=True)
    unit_detail = UnitShortSerializer(source="unit", read_only=True)
    tag_ids = serializers.PrimaryKeyRelatedField(
        source="tags", many=True, queryset=Tag.objects.all(), required=False
    )
    tags_detail = TagSerializer(source="tags", many=True, read_only=True)

    # ✅ Ассортиментная матрица "товар × склад" — пусто = виден везде (см.
    # Product.allowed_warehouses). Тот же паттерн, что tag_ids/tags_detail.
    allowed_warehouse_ids = serializers.PrimaryKeyRelatedField(
        source="allowed_warehouses", many=True, queryset=Warehouse.objects.all(), required=False
    )
    allowed_warehouses_detail = WarehouseShortSerializer(source="allowed_warehouses", many=True, read_only=True)

    # Изображения — read only, загрузка через отдельный эндпоинт
    images = ProductImageSerializer(many=True, read_only=True)
    main_image = serializers.SerializerMethodField()

    # Цены — read only, управление через отдельный эндпоинт
    prices = ProductPriceSerializer(many=True, read_only=True)
    bundle_items = BundleItemSerializer(many=True, read_only=True)
    volume_discounts = VolumeDiscountSerializer(many=True, read_only=True)
    quantity_promotions = QuantityPromotionSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "name", "sku", "image_mode", "barcode", "qr_code",
            "category", "category_detail",
            "brand", "brand_detail",
            "unit", "unit_detail",
            "tag_ids", "tags_detail",
            "allowed_warehouse_ids", "allowed_warehouses_detail",
            "cost_price",
            "min_stock_level", "is_active",
            "extra_data",
            "images", "main_image",
            "prices",
            "created_at", "updated_at",
            "length", "width", "height", "weight", "volume_m3",
            "description", 'bundle_items', 'volume_discounts', 'quantity_promotions'
        ]
        read_only_fields = ["sku", "created_at", "updated_at"]




class ProductBundleSerializer(serializers.ModelSerializer):
    bundle_product_name = serializers.CharField(
        source="bundle_product.name", read_only=True
    )
    bundle_product_unit_name = serializers.CharField(
        source="bundle_product.unit.name", read_only=True, default=""
    )
 
    class Meta:
        model = ProductBundle
        fields = [
            "id",
            "bundle_product",        # id (write)
            "bundle_product_name",   # read
            "bundle_product_unit_name",  # read
            "qty_ratio",
            "default_price",
        ]
 
    def validate_bundle_product(self, value):
        # Нельзя добавить товар сам в себя
        product_id = self.context["product_id"]
        if value.id == product_id:
            raise serializers.ValidationError("Товар не может быть комплектующим самого себя.")
        return value
 
    def validate(self, attrs):
        product_id = self.context["product_id"]
        bundle_product = attrs.get("bundle_product")
        # Проверка дубликата (при создании)
        if self.instance is None and bundle_product:
            if ProductBundle.objects.filter(
                product_id=product_id,
                bundle_product=bundle_product
            ).exists():
                raise serializers.ValidationError(
                    {"bundle_product": "Этот товар уже добавлен как комплектующий."}
                )
        return attrs
 
    def create(self, validated_data):
        validated_data["product_id"] = self.context["product_id"]
        return super().create(validated_data)

 


# ── Counterparty ─────────────────────────────────────────────────────────────

class CounterpartySerializer(serializers.ModelSerializer):
    photo = serializers.ImageField(required=False, allow_null=True)
    photo_thumbnail = serializers.SerializerMethodField()
    agent_detail = AgentShortSerializer(source='agent', read_only=True)

    class Meta:
        model = Counterparty
        fields = [
            "id", "name", "type",
            "inn", "phone", "email", "address",
            "is_active", "photo", "photo_thumbnail", "created_at", "extra_data",
            "agent", "agent_detail", "district", "delivery_percent",
        ]
        read_only_fields = ["created_at"]

    def get_photo_thumbnail(self, obj):
        return obj.photo_thumbnail.url if obj.photo_thumbnail else None

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        if instance.photo and hasattr(instance.photo, 'url'):
            representation['photo'] = instance.photo.url
        return representation

    def update(self, instance, validated_data):
        request = self.context.get("request")
        if request is not None and request.data.get("photo", None) == "":
            if instance.photo:
                instance.photo.delete(save=False)
            instance.photo = None
            validated_data.pop("photo", None)
        return super().update(instance, validated_data)


# ── Warehouse ─────────────────────────────────────────────────────────────────

class WarehouseSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    # ✅ Счета для автогенерации проводки при проведении "Расхода" с этого склада —
    # заполняются вручную пользователем в форме склада, ничего не подставляется по умолчанию.
    receivable_account_name = serializers.CharField(source="receivable_account.name", read_only=True, default=None)
    revenue_account_name = serializers.CharField(source="revenue_account.name", read_only=True, default=None)
    cogs_account_name = serializers.CharField(source="cogs_account.name", read_only=True, default=None)
    inventory_account_name = serializers.CharField(source="inventory_account.name", read_only=True, default=None)
    payable_account_name = serializers.CharField(source="payable_account.name", read_only=True, default=None)
    discount_account_name = serializers.CharField(source="discount_account.name", read_only=True, default=None)
    # ✅ Альтернативная схема проводки "Расхода" (Warehouse.profit_account/fund_account
    # оба заполнены) — см. Document._generate_out_posting в accounting/models/document.py.
    profit_account_name = serializers.CharField(source="profit_account.name", read_only=True, default=None)
    fund_account_name = serializers.CharField(source="fund_account.name", read_only=True, default=None)
    # ✅ Override-счета для контрагентов-поставщиков (Counterparty.Type.SUPPLIER) —
    # см. Document._resolve_role_account в accounting/models/document.py.
    receivable_account_supplier_name = serializers.CharField(source="receivable_account_supplier.name", read_only=True, default=None)
    payable_account_supplier_name = serializers.CharField(source="payable_account_supplier.name", read_only=True, default=None)
    profit_account_supplier_name = serializers.CharField(source="profit_account_supplier.name", read_only=True, default=None)
    # ✅ Проводка ЗП водителя за рейс (см. accounting/models/trip.py::Trip.deliver) —
    # тот же принцип "заполняются вручную", что и остальные счета склада.
    delivery_expense_account_name = serializers.CharField(source="delivery_expense_account.name", read_only=True, default=None)
    driver_payable_account_name = serializers.CharField(source="driver_payable_account.name", read_only=True, default=None)

    class Meta:
        model = Warehouse
        fields = [
            "id", "name", "branch", "branch_name", "address", "is_active", "is_main",
            "currency",
            "receivable_account", "receivable_account_name",
            "revenue_account", "revenue_account_name",
            "cogs_account", "cogs_account_name",
            "inventory_account", "inventory_account_name",
            "payable_account", "payable_account_name",
            "discount_account", "discount_account_name",
            "profit_account", "profit_account_name",
            "fund_account", "fund_account_name",
            "receivable_account_supplier", "receivable_account_supplier_name",
            "payable_account_supplier", "payable_account_supplier_name",
            "profit_account_supplier", "profit_account_supplier_name",
            "delivery_expense_account", "delivery_expense_account_name",
            "driver_payable_account", "driver_payable_account_name",
        ]


class WarehouseStockSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    unit_short = serializers.CharField(source="product.unit.short_name", read_only=True)
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)
    available_quantity = serializers.DecimalField(
        max_digits=15, decimal_places=3, read_only=True
    )

    class Meta:
        model = WarehouseStock
        fields = [
            "id", "warehouse", "warehouse_name",
            "product", "product_name", "product_sku", "unit_short",
            "quantity", "reserved_quantity", "available_quantity",
        ]
        
        
        
        
class ProductHistorySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    history_id = serializers.IntegerField()
    history_date = serializers.DateTimeField()
    history_type = serializers.CharField()
    history_user = serializers.SerializerMethodField()

    name = serializers.CharField()
    cost_price = serializers.DecimalField(max_digits=15, decimal_places=3)

    def get_history_user(self, obj):
        if obj.history_user:
            return {
                "id": obj.history_user.id,
                "name": obj.history_user.get_full_name() or obj.history_user.email
            }
        return None
        
        
        

        
        
        
    