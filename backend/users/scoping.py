# users/scoping.py
"""
Утилиты для Data Scoping.
Использование во вьюхах:

    qs = Document.objects.all()
    qs = apply_scope(qs, request.user)
"""
from django.db.models import QuerySet


def get_user_scope(user):
    if user.is_superuser:
        return [], []

    from accounting.models import UserScope
    scopes = UserScope.objects.filter(user=user).select_related('branch', 'warehouse')

    if not scopes.exists():
        return [], []

    branch_ids    = list(scopes.filter(branch__isnull=False).values_list('branch_id', flat=True))
    warehouse_ids = list(scopes.filter(warehouse__isnull=False).values_list('warehouse_id', flat=True))

    return branch_ids, warehouse_ids


def apply_scope(
    queryset: QuerySet,
    user,
    branch_field: str | None = 'branch_id',
    warehouse_field: str | None = 'warehouse_id',
) -> QuerySet:
    """
    Фильтрует queryset по scope пользователя.

    branch_field    — имя поля в модели для филиала (None чтобы пропустить)
    warehouse_field — имя поля в модели для склада  (None чтобы пропустить)

    Примеры:
        # Документы (есть и branch и warehouse)
        apply_scope(qs, user)

        # Журнал проводок (только branch)
        apply_scope(qs, user, warehouse_field=None)

        # Движения по складу (только warehouse)
        apply_scope(qs, user, branch_field=None)
    """
    branch_ids, warehouse_ids = get_user_scope(user)

    # Нет ограничений — возвращаем как есть
    if not branch_ids and not warehouse_ids:
        return queryset

    from django.db.models import Q
    q = Q()

    if branch_ids and branch_field:
        q |= Q(**{f"{branch_field}__in": branch_ids})

    if warehouse_ids and warehouse_field:
        q |= Q(**{f"{warehouse_field}__in": warehouse_ids})

    return queryset.filter(q)