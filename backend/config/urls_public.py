# backend/config/urls_public.py
from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from companies.views import RegisterCompanyView, CompanyListView
from rest_framework_simplejwt.views import TokenBlacklistView

from users.views import SuperuserTokenObtainView


urlpatterns = [
    path('admin/', admin.site.urls), # Доступ к управлению компаниями (тенантами)
    path('api/companies/', include('companies.urls')),
    path('api/users/', include('users.urls')),
    
    # JWT-эндпоинты для публичной схемы (вход в систему)
    # path('api/auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    # path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # ОТДЕЛЬНЫЙ ЭНДПОИНТ ДЛЯ ТЕБЯ:
    path('api/auth/superuser-token/', SuperuserTokenObtainView.as_view(), name='superuser_token'),
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    path('api/auth/token/logout/', TokenBlacklistView.as_view(), name='token_logout'),
    
    # Подключаем пользователей, чтобы фронтенд мог вызвать /api/users/me/
    
    
    
    
    path('api/companies/register/', RegisterCompanyView.as_view(), name='register-company'),
    path('api/companies/list/', CompanyListView.as_view(), name='company-list'),
    
]