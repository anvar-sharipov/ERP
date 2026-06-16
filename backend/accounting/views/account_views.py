# backend/accounting/views/account_views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import Account
from ..serializers.account_serializers import (
    AccountSerializer,
    AccountWriteSerializer,
)
from users.permissions import HasPermission
from users.permissions import _rbac


class AccountViewSet(viewsets.ModelViewSet):
    """
    CRUD для плана счетов.
    
    GET    /accounts/          — плоский список всех счетов
    GET    /accounts/tree/     — дерево (только корневые с детьми)
    GET    /accounts/{id}/     — один счёт
    POST   /accounts/          — создать
    PUT    /accounts/{id}/     — обновить
    PATCH  /accounts/{id}/     — частично обновить
    DELETE /accounts/{id}/     — удалить
    """
    queryset = Account.objects.select_related('parent').prefetch_related('subaccounts').order_by('code')

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return AccountWriteSerializer
        return AccountSerializer

    def get_permissions(self):
        return _rbac(self.action, "account")

    def destroy(self, request, *args, **kwargs):
        account = self.get_object()

        # Защита 1: есть субсчета
        if account.subaccounts.exists():
            return Response(
                {"detail": "Нельзя удалить счёт — у него есть субсчета."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Защита 2: есть проводки по дебету или кредиту
        has_transactions = (
            account.debit_transactions.exists() or
            account.credit_transactions.exists()
        )
        if has_transactions:
            return Response(
                {"detail": "Нельзя удалить счёт — по нему есть проводки."},
                status=status.HTTP_400_BAD_REQUEST
            )

        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'], url_path='tree')
    def tree(self, request):
        """Возвращает только корневые счета с вложенными детьми"""
        roots = Account.objects.filter(parent=None).order_by('code').prefetch_related('subaccounts')
        serializer = AccountSerializer(roots, many=True)
        return Response(serializer.data)