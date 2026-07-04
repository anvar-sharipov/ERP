# backend/accounting/views/account_views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from django.contrib.contenttypes.models import ContentType
from rest_framework.decorators import api_view
from django.db import models
from accounting.mixins import AuditMixin

from ..models import Account, SubcontoType, AccountSubconto
from ..serializers.account_serializers import (
    AccountSerializer,
    AccountWriteSerializer,
    SubcontoTypeSerializer, 
    AccountSubcontoSerializer,
)
from users.permissions import HasPermission
from users.permissions import _rbac


class AccountViewSet(AuditMixin, viewsets.ModelViewSet):
    # queryset = Account.objects.select_related('parent').prefetch_related(
    #     'subaccounts', 'account_subcontos__subconto_type__content_type'
    # ).order_by('code')
    pagination_class = None
    
    queryset = Account.objects.select_related('parent').prefetch_related(
        'subaccounts',
        'account_subcontos__subconto_type__content_type',
        'account_subcontos__subconto_type__directory',
    ).order_by('code')
    
    def get_queryset(self):
        qs = Account.objects.select_related('parent').prefetch_related(
            'subaccounts',
            'account_subcontos__subconto_type__content_type',
            'account_subcontos__subconto_type__directory',
        ).order_by('code')
        
        is_group = self.request.query_params.get('is_group')
        if is_group is not None:
            qs = qs.filter(is_group=is_group.lower() == 'true')
        
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        
        return qs

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return AccountWriteSerializer
        return AccountSerializer

    def get_permissions(self):
        return _rbac(self.action, "account")

    def destroy(self, request, *args, **kwargs):
        account = self.get_object()
        if account.subaccounts.exists():
            return Response({"detail": "Нельзя удалить счёт — у него есть субсчета."}, status=status.HTTP_400_BAD_REQUEST)
        has_transactions = (
            account.debit_transactions.exists() or
            account.credit_transactions.exists()
        )
        if has_transactions:
            return Response({"detail": "Нельзя удалить счёт — по нему есть проводки."}, status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'], url_path='tree')
    def tree(self, request):
        roots = Account.objects.filter(parent=None).order_by('code').prefetch_related('subaccounts')
        serializer = AccountSerializer(roots, many=True)
        return Response(serializer.data)

    # ✅ ВНУТРИ класса
    @action(detail=True, methods=['post'], url_path='subcontos')
    def add_subconto(self, request, pk=None):
        account = self.get_object()
        serializer = AccountSubcontoSerializer(data={
            **request.data,
            'account': account.id,
        })
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    # ✅ ВНУТРИ класса
    @action(detail=True, methods=['delete'], url_path='subcontos/(?P<subconto_id>[^/.]+)')
    def remove_subconto(self, request, pk=None, subconto_id=None):
        account = self.get_object()
        try:
            link = AccountSubconto.objects.get(account=account, id=subconto_id)
            link.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except AccountSubconto.DoesNotExist:
            return Response({'detail': 'Не найдено'}, status=status.HTTP_404_NOT_FOUND)



ALLOWED_FILTER_KEYS = {'type', 'type__in', 'category', 'category__in'}
# Новый ViewSet для SubcontoType
class SubcontoTypeViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
    queryset = SubcontoType.objects.select_related('content_type', 'directory').all()
    serializer_class = SubcontoTypeSerializer
    
    def get_permissions(self):
        return _rbac(self.action, "account")
    
    
    
    @action(detail=True, methods=['get'], url_path='records')
    def records(self, request, pk=None):
        subconto = self.get_object()

        if subconto.directory:
            from ..models import DirectoryRecord
            qs = DirectoryRecord.objects.filter(
                directory=subconto.directory, is_active=True
            ).values('id', 'name')
            return Response(list(qs))
        else:
            model_class = subconto.content_type.model_class()
            if hasattr(model_class, 'is_active'):
                qs = model_class.objects.filter(is_active=True)
            else:
                qs = model_class.objects.all()

            # ✅ применяем доп. фильтр, если задан
            if subconto.content_type_filter:
                safe_filter = {k: v for k, v in subconto.content_type_filter.items() if k in ALLOWED_FILTER_KEYS}
                qs = qs.filter(**safe_filter)

            data = [{"id": obj.pk, "name": str(obj)} for obj in qs]
            return Response(data)
    
    
    # @action(detail=True, methods=['get'], url_path='records')
    # def records(self, request, pk=None):
    #     """Вернуть записи для субконто — из модели или справочника"""
    #     subconto = self.get_object()
        
    #     if subconto.directory:
    #         # Пользовательский справочник
    #         from ..models import DirectoryRecord
    #         qs = DirectoryRecord.objects.filter(
    #             directory=subconto.directory, is_active=True
    #         ).values('id', 'name')
    #         return Response(list(qs))
    #     else:
    #         # Системная модель
    #         model_class = subconto.content_type.model_class()
    #         if hasattr(model_class, 'is_active'):
    #             qs = model_class.objects.filter(is_active=True)
    #         else:
    #             qs = model_class.objects.all()
    #         data = [{"id": obj.pk, "name": str(obj)} for obj in qs]
    #         return Response(data)

 
    
    
@api_view(['GET'])
def available_content_types(request):
    cts = ContentType.objects.filter(
        models.Q(app_label='accounting') | 
        models.Q(app_label='companies') | 
        models.Q(app_label='users')
    )
    data = [{"id": ct.id, "app_label": ct.app_label, "model": ct.model, "label": str(ct)} for ct in cts]
    return Response(data)





