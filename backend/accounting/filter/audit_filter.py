import django_filters
from accounting.models.audit import AuditLog


class AuditLogFilter(django_filters.FilterSet):
    date_from = django_filters.DateFilter(
        field_name="timestamp",
        lookup_expr="gte",
    )

    date_to = django_filters.DateFilter(
        method="filter_date_to",
    )

    user = django_filters.NumberFilter(
        field_name="user_id"
    )

    class Meta:
        model = AuditLog
        fields = [
            "action",
            "user",
        ]

    def filter_date_to(self, queryset, name, value):
        from datetime import timedelta

        return queryset.filter(
            timestamp__lt=value + timedelta(days=1)
        )