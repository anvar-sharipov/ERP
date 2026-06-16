# backend/accounting/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views.company_views import CompanyProfileViewSet, BranchViewSet
from .views.account_views import AccountViewSet
from .views.directory_views import DirectoryViewSet, DirectoryFieldViewSet, DirectoryRecordViewSet
from .views.product_views import (
    UnitViewSet, BrandViewSet, TagViewSet, ProductCategoryViewSet,
    ProductViewSet, CounterpartyViewSet, WarehouseViewSet, WarehouseStockViewSet,
)

app_name = 'accounting'

router = DefaultRouter()

# Company
router.register(r'company-profile', CompanyProfileViewSet, basename='company-profile')
router.register(r'branches', BranchViewSet, basename='branches')

# Accounting
router.register(r'accounts', AccountViewSet, basename='accounts')

# Directory
router.register(r'directories', DirectoryViewSet, basename='directories')
router.register(r'directory-fields', DirectoryFieldViewSet, basename='directory-fields')
router.register(r'directory-records', DirectoryRecordViewSet, basename='directory-records')

# Products & related
router.register(r'units', UnitViewSet, basename='units')
router.register(r'brands', BrandViewSet, basename='brands')
router.register(r'tags', TagViewSet, basename='tags')
router.register(r'product-categories', ProductCategoryViewSet, basename='product-categories')
router.register(r'products', ProductViewSet, basename='products')

# Counterparty
router.register(r'counterparties', CounterpartyViewSet, basename='counterparties')

# Warehouse
router.register(r'warehouses', WarehouseViewSet, basename='warehouses')
router.register(r'warehouse-stocks', WarehouseStockViewSet, basename='warehouse-stocks')

urlpatterns = [
    path('', include(router.urls)),
]



