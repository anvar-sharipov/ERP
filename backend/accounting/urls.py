# backend/accounting/urls.py
from django.urls import path, include  # Импортируем include
from rest_framework.routers import DefaultRouter
from .views.company_views import CompanyProfileViewSet, BranchViewSet
from .views.product_views import ProductListView # Убедись, что импорт правильный
from .views.account_views import AccountViewSet
from .views.directory_views import DirectoryViewSet, DirectoryFieldViewSet

app_name = 'accounting'

router = DefaultRouter()
# Рекомендую использовать basename='company-profile' для ясности
router.register(r'company-profile', CompanyProfileViewSet, basename='company-profile')
router.register(r'branches', BranchViewSet, basename='branches')
router.register(r'accounts', AccountViewSet, basename='accounts')

router.register(r'directories', DirectoryViewSet)
router.register(r'directory-fields', DirectoryFieldViewSet, basename='directory-fields')

urlpatterns = [
    # Путь для списка продуктов
    path('products/list/', ProductListView.as_view(), name='products-list'),
    
    # Добавляем все маршруты, сгенерированные роутером
    path('', include(router.urls)),
]


