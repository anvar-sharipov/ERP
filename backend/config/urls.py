# backend/config/urls.py
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.views import TokenBlacklistView

# Добавь импорт твоей вьюшки сюда тоже:
from users.views import SuperuserTokenObtainView


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/accounting/', include('accounting.urls')),
    path('api/users/', include('users.urls')),
    path("api/chat/", include("chat.urls")),
    
    # JWT эндпоинты
    path('api/auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # СТРАХОВКА: если запрос прилетел сюда, он все равно сработает!
    path('api/auth/superuser-token/', SuperuserTokenObtainView.as_view(), name='superuser_token'),
    
    path('api/auth/token/logout/', TokenBlacklistView.as_view(), name='token_logout'),
    
    
    
    
    
] 
# + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)


if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    