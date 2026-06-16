# backend/accounting/views/product_views.py
from rest_framework import viewsets
# from rest_framework.permissions import IsAuthenticated
from ..models import Unit, Brand, Tag, ProductCategory, Product, Counterparty, Warehouse, WarehouseStock
from ..serializers.product_serializers import (
    UnitSerializer, BrandSerializer, TagSerializer, ProductCategorySerializer,
    ProductSerializer, CounterpartySerializer, WarehouseSerializer, WarehouseStockSerializer,
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
    queryset = Product.objects.select_related("category", "brand", "unit").prefetch_related("tags").order_by("name")
    serializer_class = ProductSerializer

    def get_permissions(self):
        return _rbac(self.action, "product")


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
        qs = WarehouseStock.objects.select_related(
            "warehouse", "product", "product__unit"
        ).order_by("warehouse", "product__name")

        warehouse_id = self.request.query_params.get("warehouse")
        product_id = self.request.query_params.get("product")
        if warehouse_id:
            qs = qs.filter(warehouse_id=warehouse_id)
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs

    def get_permissions(self):
        return _rbac(self.action, "warehousestock")


# ── хелпер RBAC ──────────────────────────────────────────────────────────────

# def _rbac(action: str, resource: str):
#     action_map = {
#         "list": "GET", "retrieve": "GET",
#         "create": "POST",
#         "update": "PUT", "partial_update": "PUT",
#         "destroy": "DELETE",
#     }
#     method = action_map.get(action, "GET")
#     return [IsAuthenticated(), HasPermission(resource, method)()]