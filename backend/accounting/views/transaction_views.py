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
            .select_related('created_by', 'source_document_type')
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
    http_method_names = ['get', 'post', 'head', 'options']
 
    def get_permissions(self):
        return _rbac(self.action, 'closedperiod')
    
    
    def get_queryset(self):
        qs = ClosedPeriod.objects.select_related(
            'closed_by', 'branch', 'warehouse'
        ).order_by('-date')

        params = self.request.query_params
        if date := params.get('date'):
            qs = qs.filter(date=date)
        if branch := params.get('branch'):
            qs = qs.filter(branch_id=branch)
        if warehouse := params.get('warehouse'):
            qs = qs.filter(warehouse_id=warehouse)

        return qs
    
 
 
    # def perform_create(self, serializer):
    #     serializer.save(closed_by=self.request.user)
    
    def perform_create(self, serializer):
        from django.core.exceptions import ValidationError
        
        branch    = serializer.validated_data.get('branch')
        warehouse = serializer.validated_data.get('warehouse')
        
        user_branches, user_warehouses = get_user_scope(self.request.user)
        
        print("branch:", branch)
        print("warehouse:", warehouse)
        print("user_branches:", user_branches)
        print("user_warehouses:", user_warehouses)
        
        if user_branches or user_warehouses:
            if not branch and not warehouse:
                raise ValidationError("Недостаточно прав для глобального закрытия периода.")
            if branch and branch.pk not in user_branches:
                raise ValidationError("Нет доступа к этому филиалу.")
            if warehouse and warehouse.pk not in user_warehouses:
                raise ValidationError("Нет доступа к этому складу.")
        
        serializer.save(closed_by=self.request.user)
        instance = serializer.save(closed_by=self.request.user)
        self._write_log(self.request, instance, AuditLog.Action.CREATE)
 
    # GET /closed-periods/check/?date=2026-01-01&branch=1&warehouse=2
    @action(detail=False, methods=['get'], url_path='check')
    def check(self, request):
        date_str = request.query_params.get('date')
        if not date_str:
            return Response({'detail': 'Укажи параметр date'}, status=400)
        try:
            date = datetime.date.fromisoformat(date_str)
        except ValueError:
            return Response({'detail': 'Неверный формат даты (YYYY-MM-DD)'}, status=400)

        branch_id    = request.query_params.get('branch')
        warehouse_id = request.query_params.get('warehouse')

        from django.db.models import Q
        from accounting.models import Warehouse

        # Глобальное закрытие — блокирует всех
        q = Q(date=date, branch__isnull=True, warehouse__isnull=True)

        if branch_id and warehouse_id:
            # Точное совпадение branch + warehouse
            q |= Q(date=date, branch_id=branch_id, warehouse_id=warehouse_id)

        if branch_id:
            # Весь филиал закрыт
            q |= Q(date=date, branch_id=branch_id, warehouse__isnull=True)

        if warehouse_id:
            # Конкретный склад закрыт
            q |= Q(date=date, warehouse_id=warehouse_id, branch__isnull=True)
            # Если филиал этого склада закрыт — склад тоже заблокирован
            wh = Warehouse.objects.filter(pk=warehouse_id).first()
            if wh and wh.branch_id:
                q |= Q(date=date, branch_id=wh.branch_id, warehouse__isnull=True)

        is_closed = ClosedPeriod.objects.filter(q).exists()
        return Response({'date': date_str, 'is_closed': is_closed})

    # GET /closed-periods/range/?from=2026-01-01&to=2026-01-31&branch=1&warehouse=2
    @action(detail=False, methods=['get'], url_path='range')
    def range_check(self, request):
        from_str = request.query_params.get('from')
        to_str   = request.query_params.get('to')
        if not from_str or not to_str:
            return Response({'detail': 'Укажи from и to'}, status=400)
 
        branch_id    = request.query_params.get('branch')
        warehouse_id = request.query_params.get('warehouse')
 
        from django.db.models import Q
        q = Q(date__range=[from_str, to_str]) & (
            Q(branch__isnull=True, warehouse__isnull=True)
        )
        if branch_id:
            q |= Q(date__range=[from_str, to_str], branch_id=branch_id, warehouse__isnull=True)
        if warehouse_id:
            q |= Q(date__range=[from_str, to_str], warehouse_id=warehouse_id, branch__isnull=True)
 
        closed_dates = list(
            ClosedPeriod.objects
            .filter(q)
            .values_list('date', flat=True)
            .distinct()
        )
        return Response({
            'from':         from_str,
            'to':           to_str,
            'closed_dates': [str(d) for d in closed_dates],
        })
        
        
        