# companies/middleware.py
from django.http import HttpResponse
from django.utils.deprecation import MiddlewareMixin
from icecream import ic

class TenantActiveCheckMiddleware(MiddlewareMixin):
    def process_request(self, request):
        # 1. Проверяем, определился ли арендатор (tenant) пакетом django-tenants
        tenant = getattr(request, 'tenant', None)
        # ic(tenant)
        
        # 2. Если мы в публичной схеме (главный сайт/админка SaaS), блокировать ничего не нужно
        if not tenant or tenant.schema_name == 'public':
            return None
            
        # 3. Если это клиентская схема и она неактивна (не оплачена)
        if hasattr(tenant, 'is_active') and not tenant.is_active:
            return HttpResponse(
                "<h1>Доступ ограничен</h1><p>Срок действия вашей лицензии истек. Пожалуйста, свяжитесь с администратором системы для продления.</p>", 
                status=403
            )

        return None
    
    