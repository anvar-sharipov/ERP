from django.contrib import admin
from django_tenants.admin import TenantAdminMixin
from .models import Company, Domain
from django.db import connection


# Домены лучше выносить в Inline, чтобы создавать их сразу с компанией
class DomainInline(admin.TabularInline):
    model = Domain
    max_num = 1

@admin.register(Company)
class CompanyAdmin(TenantAdminMixin, admin.ModelAdmin):
    list_display = ('name', 'schema_name', 'created_on')
    inlines = [DomainInline]
    def has_module_permission(self, request):
        return connection.schema_name == 'public'
    