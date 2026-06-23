# accounting/views/transaction_views.py

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum, Q, Case, When, DecimalField
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

from decimal import Decimal






class JournalEntryViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None

    def get_permissions(self):
        return _rbac(self.action, 'journalentry')

    def get_serializer_class(self):
        if self.action == 'list':
            return JournalEntryListSerializer
        return JournalEntrySerializer

    def get_queryset(self):
        # qs = (
        #     JournalEntry.objects
        #     .select_related('created_by', 'source_document_type')
        #     # .prefetch_related('lines__account__subcontos')
        #     .prefetch_related(
        #         'lines__account',
        #         'lines__account__subcontos'
        #     )
        # )
        
        qs = (
            JournalEntry.objects
            .select_related('created_by', 'source_document_type')
            .prefetch_related(
                'lines__account',
            )
        )

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
        from decimal import Decimal
        from accounting.models import Account

        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
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
            pre_dt = acc.pre_debit or Decimal('0')
            pre_kt = acc.pre_credit or Decimal('0')
            dt = acc.debit_turnover or Decimal('0')
            kt = acc.credit_turnover or Decimal('0')

            opening_balance = pre_dt - pre_kt
            opening_debit   = max(opening_balance, Decimal('0'))
            opening_credit  = max(-opening_balance, Decimal('0'))

            closing_balance = opening_balance + dt - kt
            closing_debit   = max(closing_balance, Decimal('0'))
            closing_credit  = max(-closing_balance, Decimal('0'))

            if not show_zero:
                if dt == 0 and kt == 0 and opening_debit == 0 and opening_credit == 0 and closing_debit == 0 and closing_credit == 0:
                    continue

            data.append({
                'id': acc.id,
                'code': acc.code,
                'name': acc.name,
                'account_type': acc.account_type,
                'opening_debit':  opening_debit,
                'opening_credit': opening_credit,
                'debit_turnover':  dt,
                'credit_turnover': kt,
                'closing_debit':  closing_debit,
                'closing_credit': closing_credit,
            })

        return Response(data)

class StockMovementViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
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
        params = self.request.query_params
        if w := params.get('warehouse'):
            qs = qs.filter(warehouse_id=w)
        if p := params.get('product'):
            qs = qs.filter(product_id=p)
        if d := params.get('direction'):
            qs = qs.filter(direction=d)
        return qs
    
    
    
    
    
class ClosedPeriodViewSet(viewsets.ModelViewSet):
    serializer_class  = ClosedPeriodSerializer
    pagination_class  = None
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_permissions(self):
        return _rbac(self.action, 'closedperiod')

    def get_queryset(self):
        return ClosedPeriod.objects.select_related('closed_by').order_by('-date')

    def perform_create(self, serializer):
        serializer.save(closed_by=self.request.user)

    # GET /closed-periods/check/?date=2026-01-01
    @action(detail=False, methods=['get'], url_path='check')
    def check(self, request):
        date_str = request.query_params.get('date')
        if not date_str:
            return Response({'detail': 'Укажи параметр date'}, status=400)
        try:
            date = datetime.date.fromisoformat(date_str)
        except ValueError:
            return Response({'detail': 'Неверный формат даты (YYYY-MM-DD)'}, status=400)

        is_closed = ClosedPeriod.objects.filter(date=date).exists()
        return Response({ 'date': date_str, 'is_closed': is_closed })

    # GET /closed-periods/range/?from=2026-01-01&to=2026-01-31
    @action(detail=False, methods=['get'], url_path='range')
    def range_check(self, request):
        from_str = request.query_params.get('from')
        to_str   = request.query_params.get('to')
        if not from_str or not to_str:
            return Response({'detail': 'Укажи from и to'}, status=400)

        closed_dates = list(
            ClosedPeriod.objects
            .filter(date__range=[from_str, to_str])
            .values_list('date', flat=True)
        )
        return Response({
            'from':         from_str,
            'to':           to_str,
            'closed_dates': [str(d) for d in closed_dates],
        })
        
        
        
        