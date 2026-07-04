# backend/accounting/views/product_views.py
from rest_framework import viewsets, status, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from accounting.mixins import AuditMixin
# from django.db.models import F
from django.db import models
from accounting.utils import resolve_product_price

from ..models import (
    Unit, Brand, Tag, ProductCategory,
    Product, ProductImage, PriceType, ProductPrice,
    Counterparty, Warehouse, WarehouseStock, ProductBundle, VolumeDiscount,
    QuantityPromotion
)
from ..serializers.product_serializers import (
    UnitSerializer, BrandSerializer, TagSerializer, ProductCategorySerializer,
    ProductSerializer,
    ProductImageSerializer, ProductImageUploadSerializer,
    PriceTypeSerializer, ProductPriceSerializer,
    CounterpartySerializer, WarehouseSerializer, WarehouseStockSerializer, ProductBundleSerializer,
    VolumeDiscountSerializer, QuantityPromotionSerializer
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
            .prefetch_related(
                "tags", "images", "prices__price_type", "prices__warehouse",
                "bundle_items__bundle_product__unit", "bundle_items__bundle_product__images",
                "volume_discounts", "quantity_promotions",
            )
            .order_by("name")
        )

    def get_permissions(self):
        return _rbac(self.action, "product")
    
    @action(detail=False, methods=["get"], url_path="stocks-map")
    def stocks_map(self, request):
        """
        GET /accounting/products/stocks-map/?warehouse=<id>
        Возвращает dict: { product_id: { quantity, reserved, available } }
        Один запрос вместо N.
        """
        warehouse_id = request.query_params.get("warehouse")
        if not warehouse_id:
            return Response(
                {"detail": "warehouse query param required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        stocks = (
            WarehouseStock.objects
            .filter(warehouse_id=warehouse_id)
            .annotate(
                available=models.F("quantity") - models.F("reserved_quantity")
            )
            .values("product_id", "quantity", "reserved_quantity", "available")
        )

        result = {
            s["product_id"]: {
                "quantity":  float(s["quantity"]),
                "reserved":  float(s["reserved_quantity"]),
                "available": float(s["available"]),
            }
            for s in stocks
        }

        return Response(result)
    

    


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
            .select_related("product", "warehouse", "warehouse__branch", "branch", "price_type")
            .order_by("product__name", "price_type__name")
        )
        product_id = self.request.query_params.get("product")
        warehouse_id = self.request.query_params.get("warehouse")
        branch_id = self.request.query_params.get("branch")
        price_type_id = self.request.query_params.get("price_type")

        if product_id:
            qs = qs.filter(product_id=product_id)
        if warehouse_id:
            qs = qs.filter(warehouse_id=warehouse_id)
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        if price_type_id:
            qs = qs.filter(price_type_id=price_type_id)
        return qs

    def get_permissions(self):
        return _rbac(self.action, "productprice")
    
    def _is_global_price(self, instance):
        return instance.warehouse_id is None and instance.branch_id is None

    def perform_update(self, serializer):
        instance = self.get_object()
        if self._is_global_price(instance) and not self.request.user.is_superuser:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Изменять глобальную цену может только администратор.")
        serializer.save()

    def perform_destroy(self, instance):
        if self._is_global_price(instance) and not self.request.user.is_superuser:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Удалять глобальную цену может только администратор.")
        instance.delete()

    @action(detail=False, methods=["get"], url_path="resolve")
    def resolve(self, request):
        """
        GET /accounting/product-prices/resolve/?product=<id>&warehouse=<id>&price_type=<id>
        """
        product_id = request.query_params.get("product")
        warehouse_id = request.query_params.get("warehouse")
        price_type_id = request.query_params.get("price_type")

        if not all([product_id, warehouse_id, price_type_id]):
            return Response(
                {"detail": "product, warehouse, price_type обязательны"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        price = resolve_product_price(product_id, warehouse_id, price_type_id)
        if not price:
            return Response(None)
        return Response(ProductPriceSerializer(price).data)

    @action(detail=False, methods=["get"], url_path="affected-count")
    def affected_count(self, request):
        """
        GET /accounting/product-prices/affected-count/?scope=global
        GET /accounting/product-prices/affected-count/?scope=branch&branch=<id>
        Возвращает количество активных складов, которые затронет global/branch цена.
        """
        scope = request.query_params.get("scope")
        if scope == "global":
            count = Warehouse.objects.filter(is_active=True).count()
        elif scope == "branch":
            branch_id = request.query_params.get("branch")
            count = Warehouse.objects.filter(is_active=True, branch_id=branch_id).count()
        else:
            return Response({"detail": "scope обязателен (global|branch)"}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"affected_warehouses": count})
    
    @action(detail=False, methods=["get"], url_path="prices-map")
    def prices_map(self, request):
        """
        GET /accounting/product-prices/prices-map/?warehouse=<id>
        GET /accounting/product-prices/prices-map/?branch=<id>
        Возвращает: { product_id: { price_type_id: price } }
        Приоритет: точный scope -> global fallback.
        """
        warehouse_id = request.query_params.get("warehouse")
        branch_id = request.query_params.get("branch")

        if not warehouse_id and not branch_id:
            return Response({})

        base_qs = ProductPrice.objects.filter(is_active=True)

        # 1. Сначала кладём global-цены (как базовый слой)
        global_qs = base_qs.filter(warehouse__isnull=True, branch__isnull=True)
        result: dict = {}
        for row in global_qs.values("product_id", "price_type_id", "price"):
            result.setdefault(row["product_id"], {})[row["price_type_id"]] = float(row["price"])

        # 2. Затем перетираем точным scope (warehouse имеет приоритет над branch)
        if warehouse_id:
            scoped_qs = base_qs.filter(warehouse_id=warehouse_id)
        else:
            scoped_qs = base_qs.filter(warehouse__isnull=True, branch_id=branch_id)

        for row in scoped_qs.values("product_id", "price_type_id", "price"):
            result.setdefault(row["product_id"], {})[row["price_type_id"]] = float(row["price"])

        return Response(result)


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


class QuantityPromotionViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    GET    /api/accounting/products/{product_pk}/quantity-promotions/
    POST   /api/accounting/products/{product_pk}/quantity-promotions/
    PATCH  /api/accounting/products/{product_pk}/quantity-promotions/{id}/
    DELETE /api/accounting/products/{product_pk}/quantity-promotions/{id}/
    """
    serializer_class = QuantityPromotionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return QuantityPromotion.objects.filter(
            product_id=self.kwargs["product_pk"]
        ).select_related("price_type").order_by("price_type", "min_qty")

    def perform_create(self, serializer):
        serializer.save(product_id=int(self.kwargs["product_pk"]))
        
        
        
            
    
    
    
    
    