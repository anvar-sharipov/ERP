# backend/accounting/admin.py
from django.contrib import admin
from .models import (SubcontoType, Account, AccountSubconto, Counterparty, Warehouse, 
                     Product, CompanyProfile, Branch, Directory, DirectoryField, DirectoryRecord, ProductImage,
                     Tag, Unit, Brand, ProductCategory,
                     )
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








# _________________Product ____________________________________________________________________________________________________________________________

@admin.register(ProductCategory)
class ProductCategoryAdmin(admin.ModelAdmin):
    search_fields = ("name",)
    list_display = ("id", "name")


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    search_fields = ("name",)
    list_display = ("id", "name")


@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    search_fields = ("name",)
    list_display = ("id", "name")


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    search_fields = ("name",)
    list_display = ("id", "name")


# class ProductImageInline(admin.TabularInline):
#     model = ProductImage
#     extra = 1

#     fields = (
#         "preview",
#         "image",
#         "is_main",
#         "sort_order",
#         "alt_text",
#     )

#     readonly_fields = ("preview",)

#     def preview(self, obj):
#         if obj.pk and obj.image:
#             return format_html(
#                 '<img src="{}" style="max-height:80px; max-width:80px; border-radius:4px;" />',
#                 obj.image.url,
#             )
#         return "—"

#     preview.short_description = "Превью"


# @admin.register(Product)
# class ProductAdmin(admin.ModelAdmin):
#     list_display = (
#         "id",
#         "image_preview",
#         "name",
#         "sku",
#         "category",
#         "brand",
#         "price_retail",
#         "is_active",
#         "created_at",
#     )

#     list_display_links = (
#         "id",
#         "name",
#     )

#     search_fields = (
#         "name",
#         "sku",
#         "barcode",
#         "qr_code",
#     )

#     list_filter = (
#         "is_active",
#         "category",
#         "brand",
#         "created_at",
#     )

#     autocomplete_fields = (
#         "category",
#         "brand",
#         "unit",
#     )

#     filter_horizontal = ("tags",)

#     readonly_fields = (
#         "created_at",
#         "updated_at",
#         "image_preview",
#     )

#     inlines = [ProductImageInline]

#     fieldsets = (
#         (
#             "Основная информация",
#             {
#                 "fields": (
#                     "image_preview",
#                     "name",
#                     "sku",
#                     "is_active",
#                 )
#             },
#         ),
#         (
#             "Изображения",
#             {
#                 "fields": (
#                     "image_mode",
#                 )
#             },
#         ),
#         (
#             "Классификация",
#             {
#                 "fields": (
#                     "category",
#                     "brand",
#                     "unit",
#                     "tags",
#                 )
#             },
#         ),
#         (
#             "Коды",
#             {
#                 "fields": (
#                     "barcode",
#                     "qr_code",
#                 )
#             },
#         ),
#         (
#             "Цены",
#             {
#                 "fields": (
#                     "cost_price",
#                     "price_wholesale",
#                     "price_retail",
#                 )
#             },
#         ),
#         (
#             "Склад",
#             {
#                 "fields": (
#                     "min_stock_level",
#                 )
#             },
#         ),
#         (
#             "Служебная информация",
#             {
#                 "classes": ("collapse",),
#                 "fields": (
#                     "extra_data",
#                     "created_at",
#                     "updated_at",
#                 ),
#             },
#         ),
#     )

#     def image_preview(self, obj):
#         main_image = obj.images.filter(is_main=True).first()

#         if main_image and main_image.image:
#             return format_html(
#                 '<img src="{}" style="max-height:120px; max-width:120px; border-radius:6px;" />',
#                 main_image.image.url,
#             )

#         return "Нет изображения"

#     image_preview.short_description = "Главное фото"


# @admin.register(ProductImage)
# class ProductImageAdmin(admin.ModelAdmin):
#     list_display = (
#         "id",
#         "preview",
#         "product",
#         "is_main",
#         "sort_order",
#         "created_at",
#     )

#     list_filter = (
#         "is_main",
#         "created_at",
#     )

#     search_fields = (
#         "product__name",
#         "product__sku",
#         "alt_text",
#     )

#     autocomplete_fields = ("product",)

#     readonly_fields = (
#         "preview",
#         "created_at",
#     )

#     def preview(self, obj):
#         if obj.image:
#             return format_html(
#                 '<img src="{}" style="max-height:80px; max-width:80px;" />',
#                 obj.image.url,
#             )

#         return "—"

#     preview.short_description = "Превью"