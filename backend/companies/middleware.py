# companies/middleware.py
from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin

ALWAYS_ALLOWED_PATHS = [
    '/api/companies/platform-contact/',
]

ALWAYS_ALLOWED_PREFIXES = [
    '/media/',
]

class TenantActiveCheckMiddleware(MiddlewareMixin):
    def process_request(self, request):
        tenant = getattr(request, 'tenant', None)

        if not tenant or tenant.schema_name == 'public':
            return None

        # Разрешаем публичные пути
        if request.path in ALWAYS_ALLOWED_PATHS:
            return None
        
        # Разрешаем медиафайлы
        if any(request.path.startswith(prefix) for prefix in ALWAYS_ALLOWED_PREFIXES):
            return None

        if hasattr(tenant, 'is_active') and not tenant.is_active:
            return JsonResponse(
                {
                    "detail": "Срок действия лицензии истёк. Обратитесь к администратору системы для продления.",
                    "detail": "LicenseExpiredMessage",
                    "code": "tenant_inactive",
                },
                status=403,
            )
        return None
    
    
# # companies/middleware.py
# from django.http import HttpResponse
# from django.utils.deprecation import MiddlewareMixin
# from icecream import ic

# class TenantActiveCheckMiddleware(MiddlewareMixin):
#     def process_request(self, request):
#         # 1. Проверяем, определился ли арендатор (tenant) пакетом django-tenants
#         tenant = getattr(request, 'tenant', None)
#         # ic(tenant)
        
#         # 2. Если мы в публичной схеме (главный сайт/админка SaaS), блокировать ничего не нужно
#         if not tenant or tenant.schema_name == 'public':
#             return None
            
#         # 3. Если это клиентская схема и она неактивна (не оплачена)
#         if hasattr(tenant, 'is_active') and not tenant.is_active:
#             return HttpResponse(
#                 "<h1>Доступ ограничен</h1><p>Срок действия вашей лицензии истек. Пожалуйста, свяжитесь с администратором системы для продления.</p>", 
#                 status=403
#             )

#         return None
    
    