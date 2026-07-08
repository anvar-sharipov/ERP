# accounting/views/alert_views.py
from django.utils import timezone
from rest_framework import viewsets, mixins
from rest_framework.decorators import action
from rest_framework.response import Response

from accounting.models import SystemAlert
from accounting.serializers.alert_serializers import SystemAlertSerializer
from users.permissions import _rbac


class SystemAlertViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    Read-only список системных алертов — создаются/автоматически закрываются
    фоновой задачей accounting.tasks.run_daily_checks (см. CLAUDE.md — снапшот
    vs проводки, остаток ниже min_stock_level). Плюс отдельный action
    "resolve" — ручной дисмисс из колокольчика в хедере, не дожидаясь
    следующей автоматической ежедневной проверки.

    ✅ Scope (apply_scope) сюда не подключаем сознательно: SystemAlert ссылается
    на связанный объект через универсальный content_type/object_id (может быть
    и Warehouse, и Product — у Product нет одного "своего" склада, товар мог бы
    быть на нескольких), а не через прямое поле branch/warehouse, как того
    требует apply_scope(). Алерты — это сводка для тех, у кого есть право
    'systemalert' (обычно управленцы/админы), а не то, что должно резаться по
    scope конкретного пользователя.
    """
    serializer_class = SystemAlertSerializer
    pagination_class = None

    def get_permissions(self):
        return _rbac(self.action, 'systemalert')

    def get_queryset(self):
        qs = SystemAlert.objects.select_related('content_type').all()
        if self.request.query_params.get('unresolved_only') == 'true':
            qs = qs.filter(is_resolved=False)
        return qs.order_by('-created_at')

    @action(detail=False, methods=['get'], url_path='unresolved-count')
    def unresolved_count(self, request):
        return Response({'count': SystemAlert.objects.filter(is_resolved=False).count()})

    @action(detail=True, methods=['post'], url_path='resolve')
    def resolve(self, request, pk=None):
        alert = self.get_object()
        alert.is_resolved = True
        alert.resolved_at = timezone.now()
        alert.save(update_fields=['is_resolved', 'resolved_at', 'updated_at'])
        return Response(SystemAlertSerializer(alert).data)

    @action(detail=False, methods=['post'], url_path='check-now')
    def check_now(self, request):
        """
        ✅ Ручной запуск проверки по клику рядом с колокольчиком — ТОЛЬКО для
        тестирования/отладки, чтобы не ждать ежедневного расписания Celery
        Beat (accounting.run_daily_checks, интервал 24 часа — оставлен как
        есть, это не замена ему). Выполняется синхронно (не через Celery),
        сразу в текущей tenant-схеме запроса — та же логика, что и в фоновой
        задаче, просто без очереди.
        """
        from accounting.tasks import _check_warehouse_snapshots, _check_low_stock
        _check_warehouse_snapshots()
        _check_low_stock()
        return Response({'count': SystemAlert.objects.filter(is_resolved=False).count()})
