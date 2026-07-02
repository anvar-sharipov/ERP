
# backend/companies/admin.py
from django.contrib import admin
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from django.contrib.auth.models import Group
from users.models import User

# Список моделей для принудительного удаления из админки
models_to_hide = [Group, BlacklistedToken, OutstandingToken, User]

for model in models_to_hide:
    try:
        admin.site.unregister(model)
    except admin.sites.NotRegistered:
        # Это нормально: если модели нет в админке, значит она уже удалена или не регистрировалась
        pass
    
    
# from django.contrib import admin
# from django_tenants.admin import TenantAdminMixin
# from .models import Company, Domain
# from django.db import connection

# from .models import PlatformContact


# # Домены лучше выносить в Inline, чтобы создавать их сразу с компанией
# class DomainInline(admin.TabularInline):
#     model = Domain
#     max_num = 1

# @admin.register(Company)
# class CompanyAdmin(TenantAdminMixin, admin.ModelAdmin):
#     list_display = ('name', 'schema_name', 'created_on')
#     inlines = [DomainInline]
#     def has_module_permission(self, request):
#         return connection.schema_name == 'public'
    
    
    
    



# @admin.register(PlatformContact)
# class PlatformContactAdmin(admin.ModelAdmin):
#     list_display = (
#         'full_name',
#         'phone',
#         'phone2',
#         'email',
#         'telegram',
#         'is_active',
#     )
#     list_filter = ('is_active',)
#     search_fields = (
#         'full_name',
#         'phone',
#         'phone2',
#         'email',
#         'telegram',
#     )