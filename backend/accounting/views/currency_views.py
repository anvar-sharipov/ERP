# backend/accounting/views/currency_views.py
from rest_framework import viewsets
from rest_framework.mixins import ListModelMixin, CreateModelMixin, RetrieveModelMixin
from rest_framework.viewsets import GenericViewSet
from django.db.models import Q

from ..models import Currency, ExchangeRate, AuditLog
from ..serializers.currency_serializers import CurrencySerializer, ExchangeRateSerializer
from accounting.mixins import AuditMixin
from users.permissions import _rbac


class CurrencyViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
    serializer_class = CurrencySerializer

    def get_permissions(self):
        return _rbac(self.action, 'currency')

    def get_queryset(self):
        qs = Currency.objects.all()
        if is_active := self.request.query_params.get('is_active'):
            qs = qs.filter(is_active=is_active.lower() == 'true')
        return qs.order_by('code')


class ExchangeRateViewSet(AuditMixin, ListModelMixin, CreateModelMixin, RetrieveModelMixin, GenericViewSet):
    """
    Только list, retrieve, create — без edit и delete.
    """
    # pagination_class = None
    
    serializer_class = ExchangeRateSerializer

    def get_permissions(self):
        return _rbac(self.action, 'exchangerate')

    
    def get_queryset(self):
        qs = ExchangeRate.objects.select_related('currency', 'created_by')
        params = self.request.query_params

        if params.get('latest') == 'true':
            # последний курс по каждой валюте
            from django.db.models import Max
            latest_ids = (
                qs.values('currency')
                .annotate(max_id=Max('id'))
                .values_list('max_id', flat=True)
            )
            return qs.filter(id__in=latest_ids).order_by('-date')

        if currency := params.get('currency'):
            qs = qs.filter(currency_id=currency)
        if date_from := params.get('date_from'):
            qs = qs.filter(date__gte=date_from)
        if date_to := params.get('date_to'):
            qs = qs.filter(date__lte=date_to)

        return qs.order_by('-date', '-created_at')

    # def perform_create(self, serializer):
    #     serializer.save(created_by=self.request.user)
    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        self._write_log(self.request, instance, AuditLog.Action.CREATE)