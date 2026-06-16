# backend/accounting/serializers/product_serializers.py
from rest_framework import serializers
from ..models import Unit, Brand, Tag, ProductCategory, Product, Counterparty, Warehouse, WarehouseStock


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


# Для вложенного отображения в Product
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


class ProductSerializer(serializers.ModelSerializer):
    # Read-only вложенные объекты для отображения
    category_detail = ProductCategoryShortSerializer(source="category", read_only=True)
    brand_detail = BrandShortSerializer(source="brand", read_only=True)
    unit_detail = UnitShortSerializer(source="unit", read_only=True)
    tag_ids = serializers.PrimaryKeyRelatedField(
        source="tags", many=True, queryset=Tag.objects.all(), required=False
    )
    tags_detail = TagSerializer(source="tags", many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "name", "sku", "barcode", "qr_code",
            "category", "category_detail",
            "brand", "brand_detail",
            "unit", "unit_detail",
            "tag_ids", "tags_detail",
            "price_retail", "price_wholesale", "cost_price",
            "min_stock_level", "is_active",
            "extra_data",
            "created_at", "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class CounterpartySerializer(serializers.ModelSerializer):
    class Meta:
        model = Counterparty
        fields = [
            "id", "name", "type",
            "inn", "phone", "email", "address",
            "is_active", "created_at", "extra_data",
        ]
        read_only_fields = ["created_at"]


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

    class Meta:
        model = WarehouseStock
        fields = [
            "id", "warehouse", "warehouse_name",
            "product", "product_name", "product_sku", "unit_short",
            "quantity",
        ]