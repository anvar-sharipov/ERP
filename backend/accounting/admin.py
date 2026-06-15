# backend/accounting/admin.py
from django.contrib import admin
from .models import SubcontoType, Account, AccountSubconto, JournalEntry, Transaction, Counterparty, Warehouse, Product, CompanyProfile, Branch, Directory, DirectoryField, DirectoryRecord
from django.utils.html import format_html

# 1. Позволяет добавлять субконто прямо на странице редактирования счета
class AccountSubcontoInline(admin.TabularInline):
    model = AccountSubconto
    extra = 1  # Количество пустых полей для добавления по умолчанию

@admin.register(SubcontoType)
class SubcontoTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'content_type')
    prepopulated_fields = {'slug': ('name',)}  # Автозаполнение slug

@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'is_group', 'parent')
    list_filter = ('is_group',)
    search_fields = ('code', 'name')
    inlines = [AccountSubcontoInline]

# 2. Позволяет добавлять проводки прямо внутри самой операции (JournalEntry)
class TransactionInline(admin.TabularInline):
    model = Transaction
    extra = 1

@admin.register(JournalEntry)
class JournalEntryAdmin(admin.ModelAdmin):
    list_display = ('number', 'date', 'status', 'description')
    list_filter = ('status', 'date')
    search_fields = ('number', 'description')
    inlines = [TransactionInline]

@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ('journal_entry', 'account_deb', 'account_krt', 'amount')
    list_filter = ('account_deb', 'account_krt')
    
    
    
@admin.register(Counterparty)
class CounterpartyAdmin(admin.ModelAdmin):
    # Выводим ID и имя. В бух. системах ID контрагента часто помогает при сверках.
    list_display = ('id', 'name')
    # Поиск по имени контрагента
    search_fields = ('name',)
    # Сортировка по алфавиту по умолчанию
    ordering = ('name',)


@admin.register(Warehouse)
class WarehouseAdmin(admin.ModelAdmin):
    list_display = ('id', 'name')
    search_fields = ('name',)
    ordering = ('name',)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('id', 'name')
    search_fields = ('name',)
    ordering = ('name',)
    # Если товаров будет очень много, это ограничит вывод на одной странице
    list_per_page = 50
    
    
    
    
    
    
class BranchInline(admin.TabularInline):
    model = Branch
    extra = 0  # 0, чтобы не плодить пустые строки, если их много
    # Показываем только основные поля в таблице
    fields = ('name', 'city', 'phone', 'is_head_office')
    # Можно добавить возможность перехода к детальному редактированию филиала
    show_change_link = True

@admin.register(CompanyProfile)
class CompanyProfileAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'tax_id', 'director_name', 'phone_official')
    search_fields = ('name', 'tax_id', 'email_official')
    inlines = [BranchInline]

    fieldsets = (
        ('Основные данные', {
            'fields': ('name', 'tax_id', 'base_currency', 'legal_reg_date')
        }),
        ('Ответственные лица', {
            'fields': ('director_name', 'chief_accountant_name')
        }),
        ('Контакты', {
            'fields': ('phone_official', 'phone_official2', 'email_official', 'email_official2', 'website', 'website2', 'address')
        }),
        ('Банковские реквизиты', {
            'fields': ('bank_name', 'bank_account', 'mfo')
        }),
        ('Медиа (Лого и подписи)', {
            'fields': ('logo', 'logo2', 'stamp_image', 'signature_image'),
            'classes': ('collapse',)
        }),
    )

@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ('name', 'city', 'company_profile', 'phone', 'is_head_office', 'thumbnail_preview')
    list_filter = ('company_profile', 'city', 'is_head_office')
    search_fields = ('name', 'company_profile__name', 'city')
    
    # Позволяет видеть миниатюры прямо в списке
    readonly_fields = ('thumbnail_preview',)

    fieldsets = (
        ('Принадлежность', {
            'fields': ('company_profile',)
        }),
        ('Основные данные', {
            'fields': ('name', 'code', 'is_head_office', 'city', 'address')
        }),
        ('Контакты', {
            'fields': ('phone', 'email', 'website')
        }),
        ('Руководство', {
            'fields': ('manager_name', 'manager_position')
        }),
        ('Медиа (Лого и подпись)', {
            'fields': ('logo', 'signature_image', 'thumbnail_preview')
        }),
    )

    def thumbnail_preview(self, obj):
        """Отображение миниатюр в админке"""
        html = ""
        if obj.logo:
            html += f'<img src="{obj.logo.url}" width="50" style="margin-right:10px; border-radius:4px;" />'
        if obj.signature_image:
            html += f'<img src="{obj.signature_image.url}" width="50" style="border-radius:4px;" />'
        return format_html(html)
    
    thumbnail_preview.short_description = "Превью"
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    


@admin.register(Directory)
class DirectoryAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "slug", "icon", "is_active", "created_at")
    list_filter = ("is_active", "created_at")
    search_fields = ("name", "slug", "description")
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("created_at", "updated_at")


@admin.register(DirectoryField)
class DirectoryFieldAdmin(admin.ModelAdmin):
    list_display = ("name", "directory", "field_type", "is_required", "order")
    list_filter = ("directory", "field_type", "is_required")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(DirectoryRecord)
class DirectoryRecordAdmin(admin.ModelAdmin):
    list_display = ("name", "directory", "is_active", "created_at")
    list_filter = ("directory", "is_active")
    search_fields = ("name",)
    readonly_fields = ("created_at",)

# class DirectoryFieldInline(admin.TabularInline):
#     model = DirectoryField
#     fk_name = 'directory'  # <--- ДОБАВЬТЕ ЭТУ СТРОКУ
#     extra = 1
#     fields = ('name', 'slug', 'field_type', 'ref_directory', 'is_required', 'order')

#     def formfield_for_foreignkey(self, db_field, request, **kwargs):
#         if db_field.name == "ref_directory":
#             # Исключаем текущий справочник из списка выбора
#             if hasattr(request, '_obj_'):
#                 kwargs["queryset"] = Directory.objects.exclude(pk=request._obj_.pk)
#         return super().formfield_for_foreignkey(db_field, request, **kwargs)

# @admin.register(Directory)
# class DirectoryAdmin(admin.ModelAdmin):
#     list_display = ('name', 'slug', 'icon', 'description', 'is_active')
#     prepopulated_fields = {'slug': ('name',)}
#     inlines = [DirectoryFieldInline]

#     # Хак для передачи текущего объекта в inline (нужен для фильтрации ref_directory)
#     def get_form(self, request, obj=None, **kwargs):
#         request._obj_ = obj
#         return super().get_form(request, obj, **kwargs)

# @admin.register(DirectoryRecord)
# class DirectoryRecordAdmin(admin.ModelAdmin):
#     list_display = ('name', 'directory', 'is_active', 'created_at')
#     list_filter = ('directory', 'is_active')
#     search_fields = ('name',)
    
    # В админке записи данные JSONField будут выглядеть как текст
    # Если их много, можно кастомизировать вывод