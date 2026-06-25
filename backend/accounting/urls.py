# # backend/accounting/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_nested import routers as nested_routers

from .views.company_views import CompanyProfileViewSet, BranchViewSet, UserScopeViewSet
from .views.account_views import AccountViewSet, SubcontoTypeViewSet, available_content_types
from .views.directory_views import DirectoryViewSet, DirectoryFieldViewSet, DirectoryRecordViewSet
from .views.product_views import (
    UnitViewSet, BrandViewSet, TagViewSet, ProductCategoryViewSet,
    ProductViewSet, CounterpartyViewSet, WarehouseViewSet, WarehouseStockViewSet,
    ProductImageViewSet, PriceTypeViewSet, ProductPriceViewSet, ProductBundleViewSet,
    VolumeDiscountViewSet
)
from .views.audit_views import AuditLogViewSet
from .views.employee_views import PositionViewSet, EmployeeViewSet
from .views.transaction_views import JournalEntryViewSet, StockMovementViewSet, ClosedPeriodViewSet
from .views.document_views import DocumentViewSet, DocumentItemViewSet, DocumentParticipantViewSet





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

# Transactions
router.register(r'journal-entries', JournalEntryViewSet, basename='journal-entry')
router.register(r'stock-movements', StockMovementViewSet, basename='stock-movement')
router.register(r'closed-periods', ClosedPeriodViewSet, basename='closed-period')
router.register(r'subconto-types', SubcontoTypeViewSet, basename='subconto-type')

# Employees
router.register(r'positions', PositionViewSet, basename='position')
router.register(r'employees', EmployeeViewSet, basename='employee')

# Audit
router.register(r'audit-logs', AuditLogViewSet, basename='audit-log')

# Documents (основной роутер)
router.register(r'documents', DocumentViewSet, basename='document')

router.register(r'user-scopes', UserScopeViewSet, basename='user-scopes')

# Nested: /documents/{document_pk}/items/ и /documents/{document_pk}/participants/
documents_router = nested_routers.NestedDefaultRouter(router, r'documents', lookup='document')
documents_router.register(r'items', DocumentItemViewSet, basename='document-items')
documents_router.register(r'participants', DocumentParticipantViewSet, basename='document-participants')
# GET/POST   /api/documents/                          — список, создание
# GET/PUT/DELETE /api/documents/{id}/                 — детали, редактирование, удаление
# POST       /api/documents/{id}/post/                — провести
# POST       /api/documents/{id}/unpost/              — распровести
# GET/POST   /api/documents/{id}/items/               — строки
# GET/POST   /api/documents/{id}/participants/        — участники



 

# Вложенный роутер: /products/{product_pk}/bundles/
products_router = nested_routers.NestedDefaultRouter(router, r"products", lookup="product")
products_router.register(r"bundles", ProductBundleViewSet, basename="product-bundles")
products_router.register(r'volume-discounts', VolumeDiscountViewSet, basename='product-volume-discounts')




















urlpatterns = [
    path('', include(router.urls)),
    path('', include(documents_router.urls)),
    path('', include(products_router.urls)),  # ← вот это
    path('content-types/', available_content_types),
]



# from django.urls import path, include
# from rest_framework.routers import DefaultRouter
# from .views.company_views import CompanyProfileViewSet, BranchViewSet
# from .views.account_views import AccountViewSet, SubcontoTypeViewSet, available_content_types
# from .views.directory_views import DirectoryViewSet, DirectoryFieldViewSet, DirectoryRecordViewSet
# from .views.product_views import (
#     UnitViewSet, BrandViewSet, TagViewSet, ProductCategoryViewSet,
#     ProductViewSet, CounterpartyViewSet, WarehouseViewSet, WarehouseStockViewSet,
#     ProductImageViewSet, PriceTypeViewSet, ProductPriceViewSet
# )

# from accounting.views.audit_views import AuditLogViewSet

# from .views.employee_views import PositionViewSet, EmployeeViewSet

# from accounting.views.transaction_views import JournalEntryViewSet, StockMovementViewSet, ClosedPeriodViewSet

# app_name = 'accounting'

# router = DefaultRouter()

# # Company
# router.register(r'company-profile', CompanyProfileViewSet, basename='company-profile')
# router.register(r'branches', BranchViewSet, basename='branches')

# # Accounting
# router.register(r'accounts', AccountViewSet, basename='accounts')

# # Directory
# router.register(r'directories', DirectoryViewSet, basename='directories')
# router.register(r'directory-fields', DirectoryFieldViewSet, basename='directory-fields')
# router.register(r'directory-records', DirectoryRecordViewSet, basename='directory-records')

# # Products & related
# router.register(r'units', UnitViewSet, basename='units')
# router.register(r'brands', BrandViewSet, basename='brands')
# router.register(r'tags', TagViewSet, basename='tags')
# router.register(r'product-categories', ProductCategoryViewSet, basename='product-categories')
# router.register(r'products', ProductViewSet, basename='products')
# router.register(r'product-images', ProductImageViewSet, basename='product-images')
# router.register(r'price-types', PriceTypeViewSet, basename='price-types')
# router.register(r'product-prices', ProductPriceViewSet, basename='product-prices')

# # Counterparty
# router.register(r'counterparties', CounterpartyViewSet, basename='counterparties')

# # Warehouse
# router.register(r'warehouses', WarehouseViewSet, basename='warehouses')
# router.register(r'warehouse-stocks', WarehouseStockViewSet, basename='warehouse-stocks')

# router.register('journal-entries',  JournalEntryViewSet,  basename='journal-entry')
# router.register('stock-movements',  StockMovementViewSet, basename='stock-movement')
# router.register('closed-periods', ClosedPeriodViewSet, basename='closed-period')
# router.register(r'subconto-types', SubcontoTypeViewSet, basename='subconto-type')

# router.register('positions', PositionViewSet, basename='position')
# router.register('employees', EmployeeViewSet, basename='employee')


# router.register('audit-logs', AuditLogViewSet, basename='audit-log')



# urlpatterns = [
#     path('', include(router.urls)),
#     path('content-types/', available_content_types),
# ]



