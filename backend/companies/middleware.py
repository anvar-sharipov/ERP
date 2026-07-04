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
    
