# backend/accounting/views/document_views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.core.exceptions import ValidationError
from rest_framework.exceptions import ValidationError as DRFValidationError
from django.db.models import Q

from accounting.models import Document, DocumentItem, DocumentParticipant, AuditLog
from accounting.mixins import AuditMixin
from accounting.serializers.document_serializers import (
    DocumentSerializer,
    DocumentListSerializer,
    DocumentItemSerializer,
    DocumentParticipantSerializer,
)
from users.permissions import _rbac
from users.scoping import apply_scope, apply_agent_scope


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


class DocumentViewSet(AuditMixin, viewsets.ModelViewSet):
    """
    Универсальный вьюсет для всех типов документов.
    Фильтрация по типу: ?document_type=in|out|move|return_in|return_out

    ✅ AuditMixin — раньше здесь его не было вообще, поэтому создание/
    редактирование/удаление накладной (пока она черновик) не попадало в
    AuditLog. Только post()/unpost() логировались, и то вручную из модели
    (Document._write_audit_log). perform_update/perform_destroy используют
    дефолтную реализацию AuditMixin — у Document нет M2M-полей, которые
    AuditMixin._snapshot() не видит (в отличие от ProductViewSet.allowed_warehouses).
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
        # Agent Scoping — роль "Агент" видит только документы своих клиентов
        qs = apply_agent_scope(qs, self.request.user, agent_field='counterparty__agent__employee__user')

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

        # ✅ Фильтр по сотруднику-участнику накладной (TripDetailPage.tsx: поиск
        # накладных для рейса показывает только те, где ЭТОТ водитель уже указан
        # участником накладной — id 20 рейса не должен предлагать накладные
        # случайного другого водителя/агента/логиста). Роль — свободный текст
        # (см. DocumentParticipant.role), поэтому фильтруем по employee, а не по
        # конкретной строке роли.
        driver_param = self.request.query_params.get('driver')
        if driver_param:
            qs = qs.filter(participants__employee_id=driver_param).distinct()

        # ✅ Фильтр по рейсу (TripDetailPage.tsx) — ?trip=<id> для состава конкретного
        # рейса, ?trip=none для поиска ещё не привязанных накладных при добавлении в рейс.
        trip_param = self.request.query_params.get('trip')
        if trip_param == 'none':
            qs = qs.filter(trip__isnull=True)
        elif trip_param:
            qs = qs.filter(trip_id=trip_param)

        # ✅ Фильтр по автору (created_by) / по тому, кто провёл (posted_by) —
        # см. InvoicesPage.tsx, значения выбираются из filter_users() ниже.
        created_by = self.request.query_params.get('created_by')
        if created_by:
            qs = qs.filter(created_by_id=created_by)

        posted_by = self.request.query_params.get('posted_by')
        if posted_by:
            qs = qs.filter(posted_by_id=posted_by)

        # ✅ Поиск (InvoicesPage.tsx) — раньше искался только по уже загруженной
        # странице на клиенте (useTableFilter), поэтому документ мог реально
        # существовать, но не найтись, если попадал на другую страницу. Теперь
        # уходит на бэкенд, как и остальные фильтры/сортировка — те же поля,
        # что были в frontend searchFields: number, counterparty_detail.name.
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(Q(number__icontains=search) | Q(counterparty__name__icontains=search))

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
        instance = serializer.save(created_by=self.request.user)
        self._write_log(self.request, instance, AuditLog.Action.CREATE)

    
    


    @action(detail=False, methods=['get'], url_path='filter-users')
    def filter_users(self, request):
        """
        Список пользователей для фильтров "Создал"/"Провёл" в InvoicesPage.tsx —
        ТОЛЬКО те, кто реально создавал/проводил документы в рамках текущего scope
        пользователя (не весь справочник пользователей — см. RBAC: этот action
        гейтится тем же 'document'/GET, что и list, а не отдельным правом 'user').
        """
        qs = apply_scope(Document.objects.all(), request.user)
        qs = apply_agent_scope(qs, request.user, agent_field='counterparty__agent__employee__user')
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

    @action(detail=False, methods=['get'], url_path='counterparty-card')
    def counterparty_card(self, request):
        """
        Мини-карточка счёта контрагента для правого сайдбара формы накладной
        (см. DocumentFormPage.tsx) — сальдо на начало дня документа, проводки
        за этот день, сальдо на конец. Определяет нужный счёт сам, по складу и
        типу документа (receivable_account для Расхода/Возврата от покупателя,
        payable_account для Прихода/Возврата поставщику — те же счета, что
        реально используются при проведении, см. Document._generate_out_posting/
        _generate_in_posting) — переиспользует расчёт из
        JournalEntryViewSet.subconto_card (_compute_subconto_card), не дублируя
        его. Принимает контекст параметрами (не id документа) — поэтому работает
        и для ещё не сохранённого черновика/новой накладной.
        """
        from accounting.models import Warehouse, Counterparty, AccountSubconto
        from accounting.views.transaction_views import _compute_subconto_card
        from django.contrib.contenttypes.models import ContentType

        counterparty_id = request.query_params.get('counterparty')
        warehouse_id = request.query_params.get('warehouse')
        document_type = request.query_params.get('document_type')
        date = request.query_params.get('date')

        if not all([counterparty_id, warehouse_id, document_type, date]):
            return Response({'detail': 'Укажите counterparty, warehouse, document_type и date'}, status=400)

        try:
            warehouse = Warehouse.objects.select_related(
                'receivable_account', 'payable_account',
                'receivable_account_supplier', 'payable_account_supplier',
            ).get(id=warehouse_id)
        except Warehouse.DoesNotExist:
            return Response({'detail': 'Склад не найден'}, status=404)

        try:
            counterparty = Counterparty.objects.get(id=counterparty_id)
        except Counterparty.DoesNotExist:
            return Response({'detail': 'Контрагент не найден'}, status=404)

        # ✅ Тот же выбор счёта, что и в Document._resolve_role_account при реальном
        # проведении — если этот контрагент поставщик и на складе настроен override,
        # берём его (например 75 вместо обычного 60), иначе обычный default_field.
        # Раньше здесь был захардкожен только default_field, из-за чего сайдбар
        # показывал баланс по чужому счёту для поставщика, выбранного в "Расходе"/
        # "Приходе" (см. CLAUDE.md про screen/print/export не должны расходиться —
        # тот же принцип применим и к этому сайдбар-виджету).
        def _resolve(default_field, supplier_field):
            override = getattr(warehouse, supplier_field, None)
            if override is not None and counterparty.type == Counterparty.Type.SUPPLIER:
                return override
            return getattr(warehouse, default_field)

        if document_type in (Document.Type.OUT, Document.Type.RETURN_IN):
            account = _resolve('receivable_account', 'receivable_account_supplier')
        elif document_type in (Document.Type.IN, Document.Type.RETURN_OUT):
            account = _resolve('payable_account', 'payable_account_supplier')
        else:
            account = None

        if not account:
            return Response({'available': False})

        try:
            acc_subconto = AccountSubconto.objects.select_related('subconto_type').get(
                account=account, subconto_type__content_type=ContentType.objects.get_for_model(Counterparty),
            )
        except AccountSubconto.DoesNotExist:
            return Response({'available': False})

        data = _compute_subconto_card(request, account, acc_subconto.subconto_type.slug, counterparty_id, counterparty, date, date)
        data['available'] = True
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
        # ✅ DocumentItem.save() бросает django.core.exceptions.ValidationError
        # (запрет менять строки проведённого документа, теперь и недостаток
        # товара на складе — см. check_stock_availability) — DRF ловит только
        # rest_framework.exceptions.APIException, обычный Django ValidationError
        # без перевода в DRF-исключение уронил бы запрос в 500 вместо понятного
        # 400 (см. _get_error_detail — тот же паттерн, что и в post_document/
        # unpost_document выше).
        try:
            serializer.save(document=document)
        except ValidationError as e:
            # ✅ DRFValidationError(строка) сериализуется в exception_handler как
            # ГОЛЫЙ список (["текст"]), а не {"detail": "текст"} — фронтенд
            # (DocumentFormPage.tsx::saveMutation onError) читает именно
            # err.response.data.detail, так что без явной обёртки в dict понятное
            # сообщение об ошибке (напр. "недостаточно товара на складе") терялось
            # бы и подменялось дженериком "Ошибка сохранения".
            raise DRFValidationError({'detail': _get_error_detail(e)})

    def perform_update(self, serializer):
        try:
            serializer.save()
        except ValidationError as e:
            raise DRFValidationError({'detail': _get_error_detail(e)})


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

