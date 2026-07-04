# accounting/views/transaction_views.py

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum, Q
from django.db import transaction
import datetime

from accounting.models import JournalEntry, TransactionLine, StockMovement, ClosedPeriod
from accounting.serializers.transaction_serializers import (
    JournalEntrySerializer,
    JournalEntryListSerializer,
    StockMovementSerializer,
    ClosedPeriodSerializer
)
from accounting.mixins import AuditMixin
from users.permissions import _rbac
from users.scoping import apply_scope

from decimal import Decimal
from users.scoping import get_user_scope
from django.core.exceptions import ValidationError
from ..models import AuditLog


from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync


def _broadcast_closed_period(request, instance, action_name):
    channel_layer = get_channel_layer()
    tenant_schema = getattr(request, "tenant", None)
    schema_name = tenant_schema.schema_name if tenant_schema else "public"

    async_to_sync(channel_layer.group_send)(
        f"closed_period_{schema_name}",
        {
            "type": "closed_period_changed",
            "date": str(instance.date),
            "warehouse": instance.warehouse_id,
            "action": action_name,
        },
    )



class JournalEntryViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None

    def get_permissions(self):
        return _rbac(self.action, 'journalentry')

    def get_serializer_class(self):
        if self.action == 'list':
            return JournalEntryListSerializer
        return JournalEntrySerializer

    def get_queryset(self):
        qs = (
            JournalEntry.objects
            .select_related('created_by', 'source_document_type', 'branch')  # ✅ добавить branch
            .prefetch_related('lines__account')
        )

        # Data Scoping — журнал проводок фильтруем только по branch
        # (у JournalEntry нет warehouse)
        qs = apply_scope(qs, self.request.user, warehouse_field=None)

        if self.action == 'list':
            qs = qs.annotate(
                debit_total=Sum(
                    'lines__amount',
                    filter=Q(lines__side='debit')
                )
            )

        params = self.request.query_params
        if status_ := params.get('status'):
            qs = qs.filter(status=status_)
        if date_from := params.get('date_from'):
            qs = qs.filter(date__date__gte=date_from)
        if date_to := params.get('date_to'):
            qs = qs.filter(date__date__lte=date_to)
        if search := params.get('search'):
            qs = qs.filter(
                Q(number__icontains=search) |
                Q(description__icontains=search)
            )
        if branch := params.get('branch'):
            qs = qs.filter(branch_id=branch)

        return qs.order_by('-date', '-number')

    @action(detail=True, methods=['post'], url_path='post')
    def post_entry(self, request, pk=None):
        entry = self.get_object()
        try:
            with transaction.atomic():
                entry.post()
                self._write_log(request, entry, 'post')
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'detail': 'Операция проведена.'})

    @action(detail=True, methods=['post'], url_path='unpost')
    def unpost_entry(self, request, pk=None):
        entry = self.get_object()
        try:
            with transaction.atomic():
                entry.unpost()
                self._write_log(request, entry, 'unpost')
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'detail': 'Проведение отменено.'})

    @action(detail=False, methods=['get'], url_path='osv')
    def osv(self, request):
        from accounting.models import Account

        date_from = request.query_params.get('date_from')
        date_to   = request.query_params.get('date_to')
        show_zero = request.query_params.get('show_zero', 'false') == 'true'

        if not date_from or not date_to:
            return Response({'detail': 'Укажите date_from и date_to'}, status=400)

        base_filter = Q(transaction_lines__journal_entry__status='posted')

        qs = Account.objects.filter(
            is_group=False, is_active=True
        ).annotate(
            pre_debit=Sum(
                'transaction_lines__amount',
                filter=base_filter & Q(
                    transaction_lines__side='debit',
                    transaction_lines__journal_entry__date__date__lt=date_from,
                ),
                default=Decimal('0'),
            ),
            pre_credit=Sum(
                'transaction_lines__amount',
                filter=base_filter & Q(
                    transaction_lines__side='credit',
                    transaction_lines__journal_entry__date__date__lt=date_from,
                ),
                default=Decimal('0'),
            ),
            debit_turnover=Sum(
                'transaction_lines__amount',
                filter=base_filter & Q(
                    transaction_lines__side='debit',
                    transaction_lines__journal_entry__date__date__gte=date_from,
                    transaction_lines__journal_entry__date__date__lte=date_to,
                ),
                default=Decimal('0'),
            ),
            credit_turnover=Sum(
                'transaction_lines__amount',
                filter=base_filter & Q(
                    transaction_lines__side='credit',
                    transaction_lines__journal_entry__date__date__gte=date_from,
                    transaction_lines__journal_entry__date__date__lte=date_to,
                ),
                default=Decimal('0'),
            ),
        ).select_related('parent').order_by('code')

        data = []
        for acc in qs:
            pre_dt = acc.pre_debit  or Decimal('0')
            pre_kt = acc.pre_credit or Decimal('0')
            dt     = acc.debit_turnover  or Decimal('0')
            kt     = acc.credit_turnover or Decimal('0')

            opening_balance = pre_dt - pre_kt
            opening_debit   = max(opening_balance,  Decimal('0'))
            opening_credit  = max(-opening_balance, Decimal('0'))

            closing_balance = opening_balance + dt - kt
            closing_debit   = max(closing_balance,  Decimal('0'))
            closing_credit  = max(-closing_balance, Decimal('0'))

            if not show_zero:
                if dt == 0 and kt == 0 and opening_debit == 0 and opening_credit == 0 and closing_debit == 0 and closing_credit == 0:
                    continue

            data.append({
                'id':             acc.id,
                'code':           acc.code,
                'name':           acc.name,
                'account_type':   acc.account_type,
                'opening_debit':  opening_debit,
                'opening_credit': opening_credit,
                'debit_turnover':  dt,
                'credit_turnover': kt,
                'closing_debit':  closing_debit,
                'closing_credit': closing_credit,
            })

        return Response(data)


class StockMovementViewSet(viewsets.ModelViewSet):
    pagination_class  = None
    serializer_class  = StockMovementSerializer
    http_method_names = ['get', 'post', 'head', 'options']

    def get_permissions(self):
        return _rbac(self.action, 'stockmovement')

    def get_queryset(self):
        qs = (
            StockMovement.objects
            .select_related('warehouse', 'warehouse_to', 'product', 'created_by')
            .order_by('-created_at')
        )

        # Data Scoping — движения по складу фильтруем только по warehouse
        qs = apply_scope(qs, self.request.user, branch_field=None)

        params = self.request.query_params
        if w := params.get('warehouse'):
            qs = qs.filter(warehouse_id=w)
        if p := params.get('product'):
            qs = qs.filter(product_id=p)
        if d := params.get('direction'):
            qs = qs.filter(direction=d)

        return qs

class ClosedPeriodViewSet(AuditMixin, viewsets.ModelViewSet):
    serializer_class  = ClosedPeriodSerializer
    pagination_class  = None
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_permissions(self):
        return _rbac(self.action, 'closedperiod')

    def get_queryset(self):
        qs = ClosedPeriod.objects.select_related(
            'closed_by', 'warehouse'
        ).order_by('-date')

        qs = apply_scope(qs, self.request.user, branch_field=None)

        params = self.request.query_params
        if date := params.get('date'):
            qs = qs.filter(date=date)
        if warehouse := params.get('warehouse'):
            qs = qs.filter(warehouse_id=warehouse)
        if warehouse__in := params.get('warehouse__in'):
            ids = [w for w in warehouse__in.split(',') if w]
            qs = qs.filter(warehouse_id__in=ids)

        return qs

    def perform_create(self, serializer):
        warehouse = serializer.validated_data.get('warehouse')
        _, user_warehouses = get_user_scope(self.request.user)

        if user_warehouses and warehouse.pk not in user_warehouses:
            raise ValidationError("Нет доступа к этому складу.")

        instance = serializer.save(closed_by=self.request.user)
        self._write_log(self.request, instance, AuditLog.Action.CREATE)
        _broadcast_closed_period(self.request, instance, "closed")

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        _, user_warehouses = get_user_scope(request.user)

        if user_warehouses:
            return Response(
                {'detail': 'Открывать закрытый день может только пользователь без привязки к складу.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        later_exists = ClosedPeriod.objects.filter(
            warehouse=instance.warehouse,
            date__gt=instance.date,
        ).exists()

        if later_exists:
            return Response(
                {'detail': 'Нельзя открыть этот день — есть закрытый день позже по этому складу. Открывайте дни по порядку, начиная с последнего.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        date, warehouse_id = instance.date, instance.warehouse_id
        self._write_log(request, instance, AuditLog.Action.DELETE, {'snapshot': self._snapshot(instance)})
        instance.delete()

        channel_layer = get_channel_layer()
        schema_name = getattr(getattr(request, "tenant", None), "schema_name", "public")
        async_to_sync(channel_layer.group_send)(
            f"closed_period_{schema_name}",
            {"type": "closed_period_changed", "date": str(date), "warehouse": warehouse_id, "action": "reopened"},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
    
    
    # GET /closed-periods/check/?date=2026-01-01&warehouse=2
    @action(detail=False, methods=['get'], url_path='check')
    def check(self, request):
        date_str = request.query_params.get('date')
        warehouse_id = request.query_params.get('warehouse')

        if not date_str or not warehouse_id:
            return Response({'detail': 'Укажите date и warehouse'}, status=400)

        try:
            date = datetime.date.fromisoformat(date_str)
        except ValueError:
            return Response({'detail': 'Неверный формат даты (YYYY-MM-DD)'}, status=400)

        period = ClosedPeriod.objects.filter(date=date, warehouse_id=warehouse_id).first()

        return Response({
            'date': date_str,
            'is_closed': period is not None,
            'closed_period_id': period.id if period else None,
        })

    # GET /closed-periods/range/?from=2026-01-01&to=2026-01-31&warehouse=2
    @action(detail=False, methods=['get'], url_path='range')
    def range_check(self, request):
        from_str = request.query_params.get('from')
        to_str   = request.query_params.get('to')
        warehouse_id = request.query_params.get('warehouse')

        if not from_str or not to_str or not warehouse_id:
            return Response({'detail': 'Укажите from, to и warehouse'}, status=400)

        closed_dates = list(
            ClosedPeriod.objects
            .filter(date__range=[from_str, to_str], warehouse_id=warehouse_id)
            .values_list('date', flat=True)
            .distinct()
        )
        return Response({
            'from':         from_str,
            'to':           to_str,
            'closed_dates': [str(d) for d in closed_dates],
        })