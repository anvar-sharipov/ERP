# backend/accounting/views/product_views.py
from rest_framework import viewsets, status, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from accounting.mixins import AuditMixin
# from django.db.models import F
from django.db import models

from ..models import (
    Unit, Brand, Tag, ProductCategory,
    Product, ProductImage, PriceType, ProductPrice,
    Counterparty, Warehouse, WarehouseStock, ProductBundle, VolumeDiscount
)
from ..serializers.product_serializers import (
    UnitSerializer, BrandSerializer, TagSerializer, ProductCategorySerializer,
    ProductSerializer,
    ProductImageSerializer, ProductImageUploadSerializer,
    PriceTypeSerializer, ProductPriceSerializer,
    CounterpartySerializer, WarehouseSerializer, WarehouseStockSerializer, ProductBundleSerializer,
    VolumeDiscountSerializer
)
from users.permissions import _rbac
from rest_framework.permissions import IsAuthenticated



class UnitViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
    queryset = Unit.objects.all()
    serializer_class = UnitSerializer

    def get_permissions(self):
        return _rbac(self.action, "unit")


class BrandViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
    queryset = Brand.objects.order_by("name")
    serializer_class = BrandSerializer

    def get_permissions(self):
        return _rbac(self.action, "brand")


class TagViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
    queryset = Tag.objects.order_by("name")
    serializer_class = TagSerializer

    def get_permissions(self):
        return _rbac(self.action, "tag")


class ProductCategoryViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
    queryset = ProductCategory.objects.order_by("name")
    serializer_class = ProductCategorySerializer

    def get_permissions(self):
        return _rbac(self.action, "productcategory")


class ProductViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
    serializer_class = ProductSerializer

    def get_queryset(self):
        return (
            Product.objects
            .select_related("category", "brand", "unit")
            .prefetch_related("tags", "images", "prices__price_type", "prices__warehouse", "bundle_items__bundle_product__unit")
            .order_by("name")
        )

    def get_permissions(self):
        return _rbac(self.action, "product")
    

    


class ProductImageViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
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


class PriceTypeViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
    queryset = PriceType.objects.order_by("name")
    serializer_class = PriceTypeSerializer

    def get_permissions(self):
        return _rbac(self.action, "pricetype")


class ProductPriceViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
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


class CounterpartyViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
    queryset = Counterparty.objects.order_by("name")
    serializer_class = CounterpartySerializer

    def get_permissions(self):
        return _rbac(self.action, "counterparty")

    def get_queryset(self):
        ctype = self.request.query_params.get("type")
        if ctype == "client":
            return Counterparty.objects.clients().order_by("name")
        if ctype == "supplier":
            return Counterparty.objects.suppliers().order_by("name")
        return Counterparty.objects.order_by("name")
    


class WarehouseViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
    queryset = Warehouse.objects.select_related("branch").order_by("name")
    serializer_class = WarehouseSerializer

    def get_permissions(self):
        return _rbac(self.action, "warehouse")


class WarehouseStockViewSet(viewsets.ModelViewSet):
    pagination_class = None
    serializer_class = WarehouseStockSerializer

    # def get_queryset(self):
    #     qs = (
    #         WarehouseStock.objects
    #         .select_related("warehouse", "product", "product__unit")
    #         .order_by("warehouse", "product__name")
    #     )
    #     warehouse_id = self.request.query_params.get("warehouse")
    #     product_id = self.request.query_params.get("product")
    #     if warehouse_id:
    #         qs = qs.filter(warehouse_id=warehouse_id)
    #     if product_id:
    #         qs = qs.filter(product_id=product_id)
    #     return qs
    
    def get_queryset(self):
        # 1. Базовая выборка с оптимизацией связей
        qs = (
            WarehouseStock.objects
            .select_related("warehouse", "product", "product__unit")
        )
        
        # 2. Добавляем расчет "на лету" прямо в SQL
        qs = qs.annotate(
            available_quantity=models.F('quantity') - models.F('reserved_quantity')
        )
        
        # 3. Фильтрация
        warehouse_id = self.request.query_params.get("warehouse")
        product_id = self.request.query_params.get("product")
        if warehouse_id:
            qs = qs.filter(warehouse_id=warehouse_id)
        if product_id:
            qs = qs.filter(product_id=product_id)
            
        return qs.order_by("warehouse", "product__name")

    def get_permissions(self):
        return _rbac(self.action, "warehousestock")
    
    
    


class ProductBundleViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    GET    /api/accounting/products/{product_id}/bundles/        — список
    POST   /api/accounting/products/{product_id}/bundles/        — создать
    PATCH  /api/accounting/products/{product_id}/bundles/{id}/   — обновить
    DELETE /api/accounting/products/{product_id}/bundles/{id}/   — удалить
    """
    serializer_class = ProductBundleSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ProductBundle.objects.filter(
            product_id=self.kwargs["product_pk"]
        ).select_related("bundle_product__unit").order_by("id")

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["product_id"] = int(self.kwargs["product_pk"])
        return ctx
    
    
    
class VolumeDiscountViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    GET    /api/accounting/products/{product_pk}/volume-discounts/
    POST   /api/accounting/products/{product_pk}/volume-discounts/
    PATCH  /api/accounting/products/{product_pk}/volume-discounts/{id}/
    DELETE /api/accounting/products/{product_pk}/volume-discounts/{id}/
    """
    serializer_class = VolumeDiscountSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return VolumeDiscount.objects.filter(
            product_id=self.kwargs["product_pk"]
        ).select_related("price_type").order_by("price_type", "min_qty")

    def perform_create(self, serializer):
        serializer.save(product_id=int(self.kwargs["product_pk"]))
        
        
        
            
    
    
    
    
    