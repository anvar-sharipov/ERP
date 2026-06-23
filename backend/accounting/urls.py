# backend/accounting/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views.company_views import CompanyProfileViewSet, BranchViewSet
from .views.account_views import AccountViewSet, SubcontoTypeViewSet, available_content_types
from .views.directory_views import DirectoryViewSet, DirectoryFieldViewSet, DirectoryRecordViewSet
from .views.product_views import (
    UnitViewSet, BrandViewSet, TagViewSet, ProductCategoryViewSet,
    ProductViewSet, CounterpartyViewSet, WarehouseViewSet, WarehouseStockViewSet,
    ProductImageViewSet, PriceTypeViewSet, ProductPriceViewSet
)

from accounting.views.audit_views import AuditLogViewSet

from .views.employee_views import PositionViewSet, EmployeeViewSet

from accounting.views.transaction_views import JournalEntryViewSet, StockMovementViewSet, ClosedPeriodViewSet

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
router.register(r'product-images', ProductImageViewSet, basename='product-images')
router.register(r'price-types', PriceTypeViewSet, basename='price-types')
router.register(r'product-prices', ProductPriceViewSet, basename='product-prices')

# Counterparty
router.register(r'counterparties', CounterpartyViewSet, basename='counterparties')

# Warehouse
router.register(r'warehouses', WarehouseViewSet, basename='warehouses')
router.register(r'warehouse-stocks', WarehouseStockViewSet, basename='warehouse-stocks')

router.register('journal-entries',  JournalEntryViewSet,  basename='journal-entry')
router.register('stock-movements',  StockMovementViewSet, basename='stock-movement')
router.register('closed-periods', ClosedPeriodViewSet, basename='closed-period')
router.register(r'subconto-types', SubcontoTypeViewSet, basename='subconto-type')

router.register('positions', PositionViewSet, basename='position')
router.register('employees', EmployeeViewSet, basename='employee')


router.register('audit-logs', AuditLogViewSet, basename='audit-log')



urlpatterns = [
    path('', include(router.urls)),
    path('content-types/', available_content_types),
]



