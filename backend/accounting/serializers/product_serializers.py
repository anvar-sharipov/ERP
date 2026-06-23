# backend/accounting/serializers/product_serializers.py
from rest_framework import serializers
from ..models import (
    Unit, Brand, Tag, ProductCategory,
    Product, ProductImage, PriceType, ProductPrice,
    Counterparty, Warehouse, WarehouseStock,
)


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

    class Meta:
        model = ProductPrice
        fields = [
            "id", "product", "warehouse", "warehouse_name",
            "price_type", "price_type_name",
            "price", "valid_from", "valid_to", "is_active",
        ]
        read_only_fields = ["valid_from"]


# ── Product ───────────────────────────────────────────────────────────────────

class ProductSerializer(serializers.ModelSerializer):
    category_detail = ProductCategoryShortSerializer(source="category", read_only=True)
    brand_detail = BrandShortSerializer(source="brand", read_only=True)
    unit_detail = UnitShortSerializer(source="unit", read_only=True)
    tag_ids = serializers.PrimaryKeyRelatedField(
        source="tags", many=True, queryset=Tag.objects.all(), required=False
    )
    tags_detail = TagSerializer(source="tags", many=True, read_only=True)

    # Изображения — read only, загрузка через отдельный эндпоинт
    images = ProductImageSerializer(many=True, read_only=True)
    main_image = serializers.SerializerMethodField()

    # Цены — read only, управление через отдельный эндпоинт
    prices = ProductPriceSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "name", "sku", "image_mode", "barcode", "qr_code",
            "category", "category_detail",
            "brand", "brand_detail",
            "unit", "unit_detail",
            "tag_ids", "tags_detail",
            "cost_price",
            "min_stock_level", "is_active",
            "extra_data",
            "images", "main_image",
            "prices",
            "created_at", "updated_at",
            "length", "width", "height", "weight", "volume_m3",
            "description",
        ]
        read_only_fields = ["sku", "created_at", "updated_at"]

    def get_main_image(self, obj):
        # Берём из prefetch чтобы не делать лишний запрос
        images = obj.images.all()
        main = next((img for img in images if img.is_main), None)
        if main is None and images:
            main = images[0]
        if main:
            return ProductImageSerializer(main, context=self.context).data
        return None


# ── Counterparty ─────────────────────────────────────────────────────────────

class CounterpartySerializer(serializers.ModelSerializer):
    class Meta:
        model = Counterparty
        fields = [
            "id", "name", "type",
            "inn", "phone", "email", "address",
            "is_active", "created_at", "extra_data",
        ]
        read_only_fields = ["created_at"]


# ── Warehouse ─────────────────────────────────────────────────────────────────

class WarehouseSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source="branch.name", read_only=True)

    class Meta:
        model = Warehouse
        fields = ["id", "name", "branch", "branch_name", "address", "is_active", "is_main"]


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
    cost_price = serializers.DecimalField(max_digits=15, decimal_places=2)

    def get_history_user(self, obj):
        if obj.history_user:
            return {
                "id": obj.history_user.id,
                "name": obj.history_user.get_full_name() or obj.history_user.email
            }
        return None
        
        
        
        
        
        
        
        
    