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





class JournalEntryViewSet(AuditMixin, viewsets.ModelViewSet):

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
            .prefetch_related('lines__account__subcontos')
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


class StockMovementViewSet(AuditMixin, viewsets.ModelViewSet):
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
        
        
        
        