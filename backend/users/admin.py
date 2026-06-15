from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, Role, Permission, RolePermission, UserRole

# 1. Инлайн для связки Роль <-> Права
class RolePermissionInline(admin.TabularInline):
    model = RolePermission
    extra = 1

# 2. Инлайн для связки Юзер <-> Роли
class UserRoleInline(admin.TabularInline):
    model = UserRole
    extra = 1

@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ['name']
    inlines = [RolePermissionInline]

@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ['resource', 'action']
    list_filter = ['resource']

@admin.register(User)
class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        ('Дополнительно', {'fields': ('phone', 'photo', 'position')}),
    )
    list_display = ['username', 'email', 'phone', 'is_staff']
    inlines = [UserRoleInline] # Теперь в профиле юзера можно сразу дать ему роль
    
# @admin.register(User)
# class CustomUserAdmin(UserAdmin):
#     # Добавляем наши новые поля в интерфейс админки
#     fieldsets = UserAdmin.fieldsets + (
#         ('Дополнительно', {'fields': ('phone', 'photo')}),
#     )
#     add_fieldsets = UserAdmin.add_fieldsets + (
#         ('Дополнительно', {'fields': ('phone', 'photo')}),
#     )
#     list_display = ['username', 'email', 'phone', 'is_staff']