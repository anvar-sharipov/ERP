# backend/users/permissions.py
from django.core.cache import cache
from rest_framework import permissions
from rest_framework.permissions import IsAuthenticated
from .models import UserRole


def HasPermission(resource: str, action: str):
    class PermissionClass(permissions.BasePermission):
        def has_permission(self, request, view):
            if not request.user or not request.user.is_authenticated:
                return False
            if request.user.is_superuser:
                return True

            cache_key = f"user_perms_{request.user.id}"
            user_perms = cache.get(cache_key)

            if not user_perms:
                user_perms = set(
                    UserRole.objects.filter(user=request.user)
                    .values_list(
                        'role__rolepermission__permission__resource',
                        'role__rolepermission__permission__action',
                    )
                )
                cache.set(cache_key, user_perms, 300)

            return (resource, action) in user_perms

    return PermissionClass


def _rbac(action: str, resource: str):
    """
    Маппинг DRF action → HTTP method.
    Кастомные экшены (@action) по умолчанию требуют POST → 'POST'.
    Если нужен другой метод — передавай явно через permission_map во вьюсете.
    """
    action_map = {
        # Стандартные
        'list':           'GET',
        'retrieve':       'GET',
        'create':         'POST',
        'update':         'PUT',
        'partial_update': 'PUT',
        'destroy':        'DELETE',
        # Кастомные общие
        'post_entry':     'POST',
        'unpost_entry':   'POST',
        'set_main':       'POST',
        'check':          'GET',
        'range_check':    'GET',
        'osv':            'GET',
        'subconto_breakdown': 'GET',
        'subconto_card':      'GET',
        'account_card':       'GET',
        'counterparty_card':  'GET',
        'saldo':              'GET',
        'bulk_saldo':         'GET',
        'product_turnover':        'GET',
        'product_turnover_detail': 'GET',
        'product_card':            'GET',
        'sales_dynamics':          'GET',
        'abc_analysis':            'GET',
        'xyz_analysis':            'GET',
        'margin_analysis':         'GET',
        'category_analysis':       'GET',
        'plan_fact_analysis':      'GET',
        # ✅ Раньше отсутствовал здесь — неизвестный экшен по умолчанию требует
        # POST (см. ниже action_map.get(action, 'POST')), из-за чего read-only
        # отчёт об остатках требовал право "создавать" вместо "смотреть".
        'stock_balance':           'GET',
        'revenue_by_warehouse':    'GET',
        'top_products':            'GET',
        'top_counterparties':      'GET',
        'today_documents':         'GET',
        'universal_filter':        'GET',
        'filter_users':   'GET',
        # ✅ Массовое удаление (см. accounting/mixins.py::BulkDestroyMixin) — метод
        # DELETE, а не POST по умолчанию, иначе право "создавать" ошибочно давало
        # бы право массово удалять.
        'bulk_destroy':   'DELETE',
        # ✅ Колокольчик системных алертов (accounting/views/alert_views.py) —
        # unresolved_count это GET (просто счётчик), без явной записи в маппинг
        # он бы по умолчанию требовал POST-право, хотя ничего не создаёт.
        'unresolved_count': 'GET',
        # ✅ Облегчённый список товаров для ProductsListPage.tsx (ProductViewSet.
        # list_light) — тоже просто чтение, без явной записи ушло бы в POST.
        'list_light':       'GET',
        # ✅ Фото товаров отдельным bulk-запросом (ProductViewSet.list_light_images,
        # см. ProductListSerializer) — тоже просто чтение, без явной записи ушло
        # бы в POST.
        'list_light_images': 'GET',
        # ✅ Облегчённый список товаров для DocumentFormPage.tsx (ProductViewSet.
        # list_for_document) — тоже просто чтение, без явной записи ушло бы в POST.
        'list_for_document': 'GET',
        # ✅ Бейдж "Остаток/В резерве/Доступно" в SearchableSelect формы документа
        # (ProductViewSet.stocks_map) — тоже просто чтение, без явной записи ушло
        # бы в POST (раньше так и было — пользователь без права "создавать товар"
        # не смог бы даже открыть форму накладной, т.к. запрос падал в 403).
        'stocks_map': 'GET',
    }
    method = action_map.get(action, 'POST')  # неизвестные экшены → POST
    return [IsAuthenticated(), HasPermission(resource, method)()]
