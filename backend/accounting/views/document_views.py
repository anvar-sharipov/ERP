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


# ✅ Сортировка при server-side пагинации (InvoicesPage.tsx использует Table.tsx
# с pagination.mode="server") — ключи здесь ДОЛЖНЫ совпадать с accessor колонок в
# InvoicesPage.tsx::columns (frontend отправляет ?ordering=<accessor> либо
# ?ordering=-<accessor>), а значения — реальные ORM-пути, в том числе через join
# для колонок, показывающих вложенный объект (counterparty_detail и т.п.).
DOCUMENT_ORDERING_FIELDS = {
    'number': ['number'],
    'document_type_display': ['document_type'],
    'date': ['date'],
    'counterparty_detail': ['counterparty__name'],
    'branch_detail': ['branch__name'],
    'warehouse_detail': ['warehouse__name'],
    'total': ['total'],
    'status': ['status'],
    'created_by_name': ['created_by__last_name', 'created_by__first_name'],
    'posted_by_name': ['posted_by__last_name', 'posted_by__first_name'],
}


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
            'items__product__images',
            'items__product__bundle_items__bundle_product__images',
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

        # ✅ Фильтр по автору (created_by) / по тому, кто провёл (posted_by) —
        # см. InvoicesPage.tsx, значения выбираются из filter_users() ниже.
        created_by = self.request.query_params.get('created_by')
        if created_by:
            qs = qs.filter(created_by_id=created_by)

        posted_by = self.request.query_params.get('posted_by')
        if posted_by:
            qs = qs.filter(posted_by_id=posted_by)

        # Фильтр по дате
        date_from = self.request.query_params.get('date_from')
        date_to   = self.request.query_params.get('date_to')
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)

        # ✅ Фильтры "со скидкой / с комплектующими / с подарком" для InvoicesPage —
        # используют тот же признак (extra_data.row_type), что и
        # DocumentListSerializer.get_has_gift/get_has_bundle. Если меняете семантику
        # там — поменяйте и здесь, иначе фильтр и бейджи в списке разъедутся.
        truthy = ('1', 'true', 'True')
        if self.request.query_params.get('has_discount') in truthy:
            qs = qs.filter(discount_amount__gt=0)
        if self.request.query_params.get('has_gift') in truthy:
            qs = qs.filter(items__extra_data__row_type='promo').distinct()
        if self.request.query_params.get('has_bundle') in truthy:
            qs = qs.filter(items__extra_data__row_type='bundle').distinct()

        # ✅ Сортировка по клику на колонку (см. DOCUMENT_ORDERING_FIELDS выше) —
        # без параметра остаётся дефолтный order_by('-date', '-id') с самого начала.
        ordering_param = self.request.query_params.get('ordering')
        if ordering_param:
            desc = ordering_param.startswith('-')
            key = ordering_param[1:] if desc else ordering_param
            fields = DOCUMENT_ORDERING_FIELDS.get(key)
            if fields:
                qs = qs.order_by(*[f'-{f}' if desc else f for f in fields])

        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return DocumentListSerializer
        return DocumentSerializer

    def get_permissions(self):
        return _rbac(self.action, 'document')

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    
    


    @action(detail=False, methods=['get'], url_path='filter-users')
    def filter_users(self, request):
        """
        Список пользователей для фильтров "Создал"/"Провёл" в InvoicesPage.tsx —
        ТОЛЬКО те, кто реально создавал/проводил документы в рамках текущего scope
        пользователя (не весь справочник пользователей — см. RBAC: этот action
        гейтится тем же 'document'/GET, что и list, а не отдельным правом 'user').
        """
        qs = apply_scope(Document.objects.all(), request.user)
        user_ids = set(
            qs.exclude(created_by__isnull=True).values_list('created_by_id', flat=True).distinct()
        ) | set(
            qs.exclude(posted_by__isnull=True).values_list('posted_by_id', flat=True).distinct()
        )
        from django.contrib.auth import get_user_model
        User = get_user_model()
        users = User.objects.filter(id__in=user_ids).order_by('username')
        data = [
            {'id': u.id, 'name': u.get_full_name() or u.username}
            for u in users
        ]
        return Response(data)

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

