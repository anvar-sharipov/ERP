# backend/accounting/views/product_views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser

from ..models import (
    Unit, Brand, Tag, ProductCategory,
    Product, ProductImage, PriceType, ProductPrice,
    Counterparty, Warehouse, WarehouseStock,
)
from ..serializers.product_serializers import (
    UnitSerializer, BrandSerializer, TagSerializer, ProductCategorySerializer,
    ProductSerializer,
    ProductImageSerializer, ProductImageUploadSerializer,
    PriceTypeSerializer, ProductPriceSerializer,
    CounterpartySerializer, WarehouseSerializer, WarehouseStockSerializer,
)
from users.permissions import _rbac


class UnitViewSet(viewsets.ModelViewSet):
    queryset = Unit.objects.all()
    serializer_class = UnitSerializer

    def get_permissions(self):
        return _rbac(self.action, "unit")


class BrandViewSet(viewsets.ModelViewSet):
    queryset = Brand.objects.order_by("name")
    serializer_class = BrandSerializer

    def get_permissions(self):
        return _rbac(self.action, "brand")


class TagViewSet(viewsets.ModelViewSet):
    queryset = Tag.objects.order_by("name")
    serializer_class = TagSerializer

    def get_permissions(self):
        return _rbac(self.action, "tag")


class ProductCategoryViewSet(viewsets.ModelViewSet):
    queryset = ProductCategory.objects.order_by("name")
    serializer_class = ProductCategorySerializer

    def get_permissions(self):
        return _rbac(self.action, "productcategory")


class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer

    def get_queryset(self):
        return (
            Product.objects
            .select_related("category", "brand", "unit")
            .prefetch_related("tags", "images", "prices__price_type", "prices__warehouse")
            .order_by("name")
        )

    def get_permissions(self):
        return _rbac(self.action, "product")


class ProductImageViewSet(viewsets.ModelViewSet):
    """
    GET    /product-images/?product=<id>  — список изображений товара
    POST   /product-images/               — загрузка (multipart)
    PATCH  /product-images/<id>/          — обновить is_main / sort_order
    DELETE /product-images/<id>/          — удалить
    POST   /product-images/<id>/set_main/ — сделать главным
    """
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        qs = ProductImage.objects.select_related("product")
        product_id = self.request.query_params.get("product")
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs.order_by("sort_order", "id")

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ProductImageUploadSerializer
        return ProductImageSerializer

    def get_permissions(self):
        return _rbac(self.action, "productimage")

    @action(detail=True, methods=["post"], url_path="set_main")
    def set_main(self, request, pk=None):
        image = self.get_object()
        image.is_main = True
        image.save(update_fields=["is_main"])
        return Response(ProductImageSerializer(image, context={"request": request}).data)


class PriceTypeViewSet(viewsets.ModelViewSet):
    queryset = PriceType.objects.order_by("name")
    serializer_class = PriceTypeSerializer

    def get_permissions(self):
        return _rbac(self.action, "pricetype")


class ProductPriceViewSet(viewsets.ModelViewSet):
    serializer_class = ProductPriceSerializer

    def get_queryset(self):
        qs = (
            ProductPrice.objects
            .select_related("product", "warehouse", "price_type")
            .order_by("product__name", "price_type__name")
        )
        product_id = self.request.query_params.get("product")
        warehouse_id = self.request.query_params.get("warehouse")
        price_type_id = self.request.query_params.get("price_type")

        if product_id:
            qs = qs.filter(product_id=product_id)
        if warehouse_id:
            qs = qs.filter(warehouse_id=warehouse_id)
        if price_type_id:
            qs = qs.filter(price_type_id=price_type_id)
        return qs

    def get_permissions(self):
        return _rbac(self.action, "productprice")


class CounterpartyViewSet(viewsets.ModelViewSet):
    queryset = Counterparty.objects.order_by("name")
    serializer_class = CounterpartySerializer

    def get_permissions(self):
        return _rbac(self.action, "counterparty")

    def get_queryset(self):
        qs = super().get_queryset()
        ctype = self.request.query_params.get("type")
        if ctype == "client":
            return qs.clients()
        if ctype == "supplier":
            return qs.suppliers()
        return qs


class WarehouseViewSet(viewsets.ModelViewSet):
    queryset = Warehouse.objects.select_related("branch").order_by("name")
    serializer_class = WarehouseSerializer

    def get_permissions(self):
        return _rbac(self.action, "warehouse")


class WarehouseStockViewSet(viewsets.ModelViewSet):
    serializer_class = WarehouseStockSerializer

    def get_queryset(self):
        qs = (
            WarehouseStock.objects
            .select_related("warehouse", "product", "product__unit")
            .order_by("warehouse", "product__name")
        )
        warehouse_id = self.request.query_params.get("warehouse")
        product_id = self.request.query_params.get("product")
        if warehouse_id:
            qs = qs.filter(warehouse_id=warehouse_id)
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs

    def get_permissions(self):
        return _rbac(self.action, "warehousestock")