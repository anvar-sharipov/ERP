# backend/accounting/views/document_views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.core.exceptions import ValidationError

from accounting.models import Document, DocumentItem, DocumentParticipant
from accounting.serializers.document_serializers import (
    DocumentSerializer,
    DocumentListSerializer,
    DocumentItemSerializer,
    DocumentParticipantSerializer,
)
from users.permissions import _rbac
from users.scoping import apply_scope


def _get_error_detail(e: ValidationError) -> str:
        """Извлечь читаемое сообщение из ValidationError."""
        if hasattr(e, 'message'):
            return e.message
        if hasattr(e, 'messages') and e.messages:
            return "; ".join(e.messages)
        return str(e)


class DocumentViewSet(viewsets.ModelViewSet):
    """
    Универсальный вьюсет для всех типов документов.
    Фильтрация по типу: ?document_type=in|out|move|return_in|return_out
    """

    def get_queryset(self):
        qs = Document.objects.select_related(
            'warehouse', 'warehouse_to', 'branch',
            'counterparty', 'default_price_type',
            'posted_by', 'created_by',
        ).prefetch_related(
            'items__product',
            'items__unit',
            'items__price_type',
            'participants__employee',
        ).order_by('-date', '-id')

        # Data Scoping — пользователь видит только свои склады/филиалы
        qs = apply_scope(qs, self.request.user)

        # Фильтр по типу документа
        document_type = self.request.query_params.get('document_type')
        if document_type:
            qs = qs.filter(document_type=document_type)

        # Фильтр по статусу
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)

        # Фильтр по складу
        warehouse = self.request.query_params.get('warehouse')
        if warehouse:
            qs = qs.filter(warehouse_id=warehouse)
            
        # Фильтр по филиалу
        branch = self.request.query_params.get('branch')
        if branch:
            qs = qs.filter(branch_id=branch)

        # Фильтр по нескольким типам документов (через запятую)
        document_type__in = self.request.query_params.get('document_type__in')
        if document_type__in:
            types = [t.strip() for t in document_type__in.split(',')]
            qs = qs.filter(document_type__in=types)

        # Фильтр по контрагенту
        counterparty = self.request.query_params.get('counterparty')
        if counterparty:
            qs = qs.filter(counterparty_id=counterparty)

        # Фильтр по дате
        date_from = self.request.query_params.get('date_from')
        date_to   = self.request.query_params.get('date_to')
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)

        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return DocumentListSerializer
        return DocumentSerializer

    def get_permissions(self):
        return _rbac(self.action, 'document')

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    
    


    @action(detail=True, methods=['post'], url_path='post')
    def post_document(self, request, pk=None):
        doc = self.get_object()
        try:
            doc.post(user=request.user)
        except ValidationError as e:
            return Response(
                {'detail': _get_error_detail(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        return Response(
            DocumentSerializer(doc, context={'request': request}).data
        )

    @action(detail=True, methods=['post'], url_path='unpost')
    def unpost_document(self, request, pk=None):
        doc = self.get_object()
        try:
            doc.unpost(user=request.user)
        except ValidationError as e:
            return Response(
                {'detail': _get_error_detail(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        return Response(
            DocumentSerializer(doc, context={'request': request}).data
        )




class DocumentItemViewSet(viewsets.ModelViewSet):
    serializer_class = DocumentItemSerializer

    def get_queryset(self):
        return DocumentItem.objects.filter(
            document_id=self.kwargs['document_pk']
        ).select_related('product', 'unit', 'price_type').order_by('line_no', 'id')

    def get_permissions(self):
        return _rbac(self.action, 'document')

    def perform_create(self, serializer):
        document = Document.objects.get(pk=self.kwargs['document_pk'])
        serializer.save(document=document)


class DocumentParticipantViewSet(viewsets.ModelViewSet):
    serializer_class = DocumentParticipantSerializer

    def get_queryset(self):
        return DocumentParticipant.objects.filter(
            document_id=self.kwargs['document_pk']
        ).select_related('employee')

    def get_permissions(self):
        return _rbac(self.action, 'document')

    def perform_create(self, serializer):
        document = Document.objects.get(pk=self.kwargs['document_pk'])
        serializer.save(document=document)

