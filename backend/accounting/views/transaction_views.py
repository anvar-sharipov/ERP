# accounting/views/transaction_views.py

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum, Q, Count
from django.db import transaction
import datetime

from accounting.models import JournalEntry, TransactionLine, StockMovement, ClosedPeriod, Document, WarehouseProductSnapshot
from accounting.serializers.transaction_serializers import (
    JournalEntrySerializer,
    JournalEntryListSerializer,
    StockMovementSerializer,
    ClosedPeriodSerializer
)
from accounting.mixins import AuditMixin, BulkDestroyMixin
from accounting.utils import is_period_closed
from users.permissions import _rbac
from users.scoping import apply_scope

from decimal import Decimal
from users.scoping import get_user_scope
from django.core.exceptions import ValidationError
from ..models import AuditLog
from ..warehouse_snapshot import create_snapshot_for_closing


from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync


def _get_error_detail(e: Exception) -> str:
    """
    Извлечь читаемое сообщение из ValidationError — как в document_views.py.
    ✅ str(ValidationError("текст")) отдаёт "['текст']" (со скобками/кавычками),
    что ломает понятные сообщения (например про закрытый период) в тосте на
    фронте — нужно вытаскивать .message/.messages явно.
    """
    if hasattr(e, 'message'):
        return e.message
    if hasattr(e, 'messages') and e.messages:
        return "; ".join(e.messages)
    return str(e)


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



def _tl_scope_filter(request, branch_ids, warehouse_ids):
    """
    Тот же смысл, что и _osv_base_filter, но для queryset TransactionLine
    напрямую (без reverse-related префикса 'transaction_lines__') — используется
    в subconto_breakdown/subconto_card.
    """
    f = Q(journal_entry__status='posted')
    if branch_ids or warehouse_ids:
        scope_filter = Q()
        if branch_ids:
            scope_filter |= Q(journal_entry__branch_id__in=branch_ids)
        if warehouse_ids:
            scope_filter |= Q(journal_entry__warehouse_id__in=warehouse_ids)
        f &= scope_filter

    warehouse_param = request.query_params.get('warehouse')
    branch_param = request.query_params.get('branch')
    if warehouse_param:
        f &= Q(journal_entry__warehouse_id=warehouse_param)
    elif branch_param:
        f &= Q(journal_entry__branch_id=branch_param)
    return f


def _compute_subconto_card(request, account, subconto_slug, subconto_id, subconto_obj, date_from, date_to):
    """
    Общий расчёт "карточки счёта по субконто" — вынесен из
    JournalEntryViewSet.subconto_card, чтобы им же мог воспользоваться
    DocumentViewSet.counterparty_card (сальдо контрагента в сайдбаре формы
    накладной, см. DocumentFormPage.tsx) без дублирования запроса/бегущего остатка.
    """
    from accounting.models import TransactionLine

    branch_ids, warehouse_ids = get_user_scope(request.user)
    base_filter = _tl_scope_filter(request, branch_ids, warehouse_ids)
    key_lookup = f'subcontos__{subconto_slug}'

    base_qs = TransactionLine.objects.filter(base_filter, account_id=account.id, **{key_lookup: int(subconto_id)})

    pre_totals = base_qs.filter(journal_entry__date__date__lt=date_from).aggregate(
        debit=Sum('amount', filter=Q(side='debit'), default=Decimal('0')),
        credit=Sum('amount', filter=Q(side='credit'), default=Decimal('0')),
    )
    opening_balance = (pre_totals['debit'] or Decimal('0')) - (pre_totals['credit'] or Decimal('0'))

    period_rows = base_qs.filter(
        journal_entry__date__date__gte=date_from, journal_entry__date__date__lte=date_to,
    ).values(
        'journal_entry_id', 'journal_entry__date', 'journal_entry__description',
    ).annotate(
        debit=Sum('amount', filter=Q(side='debit'), default=Decimal('0')),
        credit=Sum('amount', filter=Q(side='credit'), default=Decimal('0')),
    ).order_by('journal_entry__date', 'journal_entry_id')

    items = []
    running = opening_balance
    total_debit = Decimal('0')
    total_credit = Decimal('0')

    for row in period_rows:
        d = row['debit'] or Decimal('0')
        c = row['credit'] or Decimal('0')
        total_debit  += d
        total_credit += c
        running += d - c

        corr_line = TransactionLine.objects.filter(
            journal_entry_id=row['journal_entry_id'],
        ).exclude(account_id=account.id).select_related('account').first()
        corr_account_code = corr_line.account.code if corr_line else '?'

        # ✅ document_id — чтобы фронт мог сделать строку кликабельной и открыть
        # исходный документ (см. DocumentViewPage.tsx — не форму редактирования,
        # см. правило CLAUDE.md про drill-down из отчётов). None, если проводка
        # создана не документом (например ручная операция в журнале).
        document_id = TransactionLine.objects.filter(
            journal_entry_id=row['journal_entry_id'],
        ).values_list('journal_entry__document__id', flat=True).first()

        items.append({
            'date':             row['journal_entry__date'],
            'journal_entry_id': row['journal_entry_id'],
            'document_id':      document_id,
            'comment':          row['journal_entry__description'],
            'corr_account':     corr_account_code,
            'debit':  d,
            'credit': c,
            'balance': running,
        })

    return {
        'items': items,
        'opening_balance': opening_balance,
        'closing_balance': running,
        'total_debit': total_debit,
        'total_credit': total_credit,
        'account_code': account.code,
        'account_name': account.name,
        'subconto_label': str(subconto_obj),
    }


def _compute_account_card(request, account, date_from, date_to, subconto_slug=None, subconto_id=None,
                           entry_type=None, search=None):
    """
    Карточка счёта (общий, не привязанный к одному значению субконто) — та же
    механика бегущего остатка, что и в _compute_subconto_card, но без
    обязательного субконто (subconto_slug/subconto_id опциональны, сужают
    карточку до одного значения, если заданы). Полный список проводок за период
    одним запросом (как и в _compute_subconto_card/product_turnover) — объём
    ограничен количеством ПРОВОДОК по КОНКРЕТНОМУ счёту за период, а не всей
    историей компании, поэтому постраничная выдача здесь не нужна — см.
    account_card ниже, который в режиме "без выбранного счёта" зовёт эту функцию
    по кругу для всех счетов сразу (как ProductTurnoverPage.tsx — один экран,
    без выбора конкретной сущности).
    """
    from accounting.models import TransactionLine

    branch_ids, warehouse_ids = get_user_scope(request.user)
    base_filter = _tl_scope_filter(request, branch_ids, warehouse_ids)

    # ✅ entry_type/search НЕ фильтруют queryset здесь — они сужают только
    # ПОКАЗАННЫЙ список строк (см. items-фильтр в конце функции), а не саму
    # выборку, по которой считается бегущий остаток. Раньше entry_type/search
    # применялись прямо к qs/period_qs ДО расчёта остатка — это тихо портило и
    # opening_balance (реальная история "что было ДО периода" ужималась до
    # "что было ДО периода из отфильтрованных ручных/документных проводок"), и
    # сам бегущий остаток внутри периода. Тот же принцип уже применяется в
    # report_views.py::_filter_product_card_rows для карточки товара.
    qs = TransactionLine.objects.filter(base_filter, account_id=account.id)
    if subconto_slug and subconto_id:
        qs = qs.filter(**{f'subcontos__{subconto_slug}': int(subconto_id)})

    pre_totals = qs.filter(journal_entry__date__date__lt=date_from).aggregate(
        debit=Sum('amount', filter=Q(side='debit'), default=Decimal('0')),
        credit=Sum('amount', filter=Q(side='credit'), default=Decimal('0')),
    )
    opening_balance = (pre_totals['debit'] or Decimal('0')) - (pre_totals['credit'] or Decimal('0'))

    period_qs = qs.filter(journal_entry__date__date__gte=date_from, journal_entry__date__date__lte=date_to)

    grouped = period_qs.values(
        'journal_entry_id', 'journal_entry__date', 'journal_entry__description',
    ).annotate(
        debit=Sum('amount', filter=Q(side='debit'), default=Decimal('0')),
        credit=Sum('amount', filter=Q(side='credit'), default=Decimal('0')),
    ).order_by('journal_entry__date', 'journal_entry_id')

    # ✅ Список группированных проводок реализуется (list()) один раз здесь — это
    # единственный способ честно посчитать бегущий остаток по порядку. Объём
    # ограничен количеством ПРОВОДОК по счёту за период (а не строк документов),
    # что даже для активного счёта за год — тысячи, не миллионы строк на бэкенде.
    # В JSON-ответ ниже попадает только срез rows[start:start+page_size].
    rows = list(grouped)

    total_debit  = Decimal('0')
    total_credit = Decimal('0')
    running = opening_balance
    for row in rows:
        d = row['debit'] or Decimal('0')
        c = row['credit'] or Decimal('0')
        total_debit  += d
        total_credit += c
        running += d - c
        row['balance'] = running

    closing_balance = running

    je_ids = [r['journal_entry_id'] for r in rows]
    corr_map = {}
    doc_map = {}
    if je_ids:
        for tl in TransactionLine.objects.filter(journal_entry_id__in=je_ids).exclude(account_id=account.id).select_related('account'):
            corr_map.setdefault(tl.journal_entry_id, tl.account.code)
        # ✅ document — обратная OneToOne-связь (Document.journal_entry,
        # related_name='document'), поле document_id живёт на Document, а не
        # на JournalEntry — .values_list('id', 'document_id') на JournalEntry
        # падает с FieldError. Идём от Document.
        for je_id, doc_id in Document.objects.filter(journal_entry_id__in=je_ids).values_list('journal_entry_id', 'id'):
            doc_map[je_id] = doc_id

    items = [{
        'id':               r['journal_entry_id'],
        'date':             r['journal_entry__date'],
        'journal_entry_id': r['journal_entry_id'],
        'document_id':      doc_map.get(r['journal_entry_id']),
        'comment':          r['journal_entry__description'],
        'corr_account':     corr_map.get(r['journal_entry_id'], '?'),
        'debit':  r['debit'] or Decimal('0'),
        'credit': r['credit'] or Decimal('0'),
        'balance': r['balance'],
    } for r in rows]

    if entry_type == 'manual':
        items = [i for i in items if i['document_id'] is None]
    elif entry_type == 'document':
        items = [i for i in items if i['document_id'] is not None]
    if search:
        s = search.lower()
        items = [i for i in items if s in (i['comment'] or '').lower()]

    return {
        'account_id': account.id,
        'account_code': account.code,
        'account_name': account.name,
        'items': items,
        'opening_balance': opening_balance,
        'closing_balance': closing_balance,
        'total_debit': total_debit,
        'total_credit': total_credit,
    }


def _account_card_all(request, date_from, date_to, entry_type, search, show_zero):
    """
    Режим "без выбранного счёта" — карточки СРАЗУ по всем счетам, у которых есть
    хоть какая-то активность (как ProductTurnoverPage.tsx — один экран со всеми
    товарами, без обязательного выбора одного). ✅ Дешёвый предфильтр: сначала
    одним запросом узнаём, у каких счетов вообще ЕСТЬ хоть одна проводка (в рамках
    scope) — счета без единой проводки пропускаем сразу, не тратя на них 2-3
    запроса _compute_account_card. Порядок величины — количество счетов в плане
    счетов (десятки-сотни), а не проводок, поэтому цикл запросов приемлем для
    отчёта без пагинации.
    """
    from accounting.models import Account, TransactionLine

    branch_ids, warehouse_ids = get_user_scope(request.user)
    base_filter = _tl_scope_filter(request, branch_ids, warehouse_ids)
    active_account_ids = set(TransactionLine.objects.filter(base_filter).values_list('account_id', flat=True).distinct())

    accounts = Account.objects.filter(is_group=False, is_active=True).order_by('code')
    if not show_zero:
        accounts = accounts.filter(id__in=active_account_ids)

    cards = []
    for account in accounts:
        card = _compute_account_card(request, account, date_from, date_to, entry_type=entry_type, search=search)
        if not show_zero and card['opening_balance'] == 0 and card['closing_balance'] == 0 and card['total_debit'] == 0 and card['total_credit'] == 0:
            continue
        cards.append(card)
    return cards


def _osv_base_filter(request, branch_ids, warehouse_ids):
    """
    Общий Q-фильтр для OSV (Account.annotate по reverse-related 'transaction_lines') —
    "проведено" + RBAC-scope + текущий выбранный склад/филиал (WorkDateWidget).
    """
    f = Q(transaction_lines__journal_entry__status='posted')
    if branch_ids or warehouse_ids:
        scope_filter = Q()
        if branch_ids:
            scope_filter |= Q(transaction_lines__journal_entry__branch_id__in=branch_ids)
        if warehouse_ids:
            scope_filter |= Q(transaction_lines__journal_entry__warehouse_id__in=warehouse_ids)
        f &= scope_filter

    warehouse_param = request.query_params.get('warehouse')
    branch_param = request.query_params.get('branch')
    if warehouse_param:
        f &= Q(transaction_lines__journal_entry__warehouse_id=warehouse_param)
    elif branch_param:
        f &= Q(transaction_lines__journal_entry__branch_id=branch_param)
    return f


# ✅ Сортировка при server-side пагинации (см. JournalPage.tsx — Table.tsx с
# pagination.mode="server", тот же принцип, что и DOCUMENT_ORDERING_FIELDS в
# document_views.py). debit_accounts/credit_accounts сюда сознательно не входят —
# это SerializerMethodField, собирающий счета со ВСЕХ строк проводки в одну
# строку (проводка может иметь несколько дебетуемых счетов), у него нет одного
# ORM-пути для сортировки (см. driver_name в document_views.py — тот же случай).
JOURNAL_ORDERING_FIELDS = {
    'number': ['number'],
    'date': ['date'],
    'description': ['description'],
    'debit_total': ['debit_total'],
}


class JournalEntryViewSet(AuditMixin, BulkDestroyMixin, viewsets.ModelViewSet):
    # ✅ Раньше здесь стоял pagination_class = None — список отдавался ПОЛНОСТЬЮ,
    # одним запросом, без разбивки на страницы (см. CLAUDE.md: JournalEntry прямо
    # назван как пример таблицы, которая обязана быть на server-пагинации). Теперь
    # используется глобальный DEFAULT_PAGINATION_CLASS (config.pagination.StandardPagination),
    # как и у DocumentViewSet.

    def get_permissions(self):
        return _rbac(self.action, 'journalentry')

    def get_serializer_class(self):
        if self.action == 'list':
            return JournalEntryListSerializer
        return JournalEntrySerializer

    def get_queryset(self):
        qs = (
            JournalEntry.objects
            .select_related('created_by', 'source_document_type', 'branch', 'warehouse')
            .prefetch_related('lines__account')
        )

        # Data Scoping — теперь у JournalEntry есть и branch, и warehouse (см. правило
        # "1 накладная = 1 склад"), фильтруем по обоим, как и Document/StockMovement.
        qs = apply_scope(qs, self.request.user)

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
            # ✅ Раньше поиск по счетам (debit_accounts/credit_accounts) работал
            # только на клиенте (useTableFilter по уже загруженной странице) —
            # теперь список на server-пагинации, значит и поиск должен искать по
            # ВСЕМ проводкам на бэкенде, а не только по видимой странице.
            qs = qs.filter(
                Q(number__icontains=search) |
                Q(description__icontains=search) |
                Q(lines__account__code__icontains=search) |
                Q(lines__account__name__icontains=search)
            ).distinct()
        if branch := params.get('branch'):
            qs = qs.filter(branch_id=branch)
        if warehouse := params.get('warehouse'):
            qs = qs.filter(warehouse_id=warehouse)
        # ✅ Drill-down из ОСВ — "показать все проводки по счёту X за период" (см.
        # OSVPage.tsx::onRowDoubleClick → навигация на /journal/entries?account=X).
        if account := params.get('account'):
            qs = qs.filter(lines__account_id=account).distinct()
        # ✅ Ручные vs сгенерированные документом проводки (см. JournalPage.tsx —
        # сайдбар-фильтр, по умолчанию показывает только ручные). Показ "всех" —
        # просто не передавать entry_type вовсе.
        entry_type = params.get('entry_type')
        if entry_type == 'manual':
            qs = qs.filter(source_document_id__isnull=True)
        elif entry_type == 'document':
            qs = qs.filter(source_document_id__isnull=False)

        # ✅ Сортировка по клику на колонку (см. JOURNAL_ORDERING_FIELDS выше) —
        # без параметра остаётся дефолтный order_by('-date', '-number').
        ordering_param = params.get('ordering')
        if ordering_param:
            desc = ordering_param.startswith('-')
            key = ordering_param[1:] if desc else ordering_param
            fields = JOURNAL_ORDERING_FIELDS.get(key)
            if fields:
                return qs.order_by(*[f'-{f}' if desc else f for f in fields])

        return qs.order_by('-date', '-number')

    # ✅ Общая проверка для post/unpost/destroy — проводки, сгенерированные
    # документом (Document.post() → _generate_out_posting и т.д.), нельзя
    # проводить/распроводить/удалять напрямую из журнала: это управляется только
    # через сам документ (Document.post()/unpost()), иначе статус документа и
    # статус его проводки разойдутся. Document.post()/unpost() вызывают
    # entry.post()/entry.unpost() как обычные Python-методы модели напрямую
    # (не через этот ViewSet), поэтому внутренний флоу документа не задет.
    def _reject_if_document_entry(self, entry):
        if entry.source_document_id:
            return Response(
                {'detail': 'Эта проводка создана документом — проведение/отмена/удаление управляются через сам документ, а не напрямую из журнала.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return None

    @action(detail=True, methods=['post'], url_path='post')
    def post_entry(self, request, pk=None):
        entry = self.get_object()
        if rejected := self._reject_if_document_entry(entry):
            return rejected
        try:
            with transaction.atomic():
                entry.post()
                self._write_log(request, entry, 'post')
        except Exception as e:
            return Response({'detail': _get_error_detail(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'detail': 'Операция проведена.'})

    @action(detail=True, methods=['post'], url_path='unpost')
    def unpost_entry(self, request, pk=None):
        entry = self.get_object()
        if rejected := self._reject_if_document_entry(entry):
            return rejected
        try:
            with transaction.atomic():
                entry.unpost()
                self._write_log(request, entry, 'unpost')
        except Exception as e:
            return Response({'detail': _get_error_detail(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'detail': 'Проведение отменено.'})

    # ✅ Общая причина отказа в удалении — переиспользуется в destroy() (единичное
    # удаление, отдаёт чистый Response) и perform_destroy() (bulk_destroy из
    # BulkDestroyMixin вызывает self.perform_destroy(instance) напрямую, минуя
    # destroy(), поэтому исключение здесь ловится в bulk_destroy's try/except и
    # попадает в errors). Удалить можно только ручную непроведённую (draft)
    # проводку в открытый день — то же условие, что показывает кнопку "Удалить"
    # в Действия в JournalPage.tsx, теперь проверяется и на бэкенде.
    def _delete_block_reason(self, entry):
        if entry.source_document_id:
            return 'Эта проводка создана документом — удаление управляется через сам документ, а не напрямую из журнала.'
        if entry.status == JournalEntry.Status.POSTED:
            return 'Нельзя удалить проведённую операцию — сначала отмените проведение.'
        if is_period_closed(entry.date, branch_id=entry.branch_id, warehouse_id=entry.warehouse_id):
            return f'День {entry.date:%d.%m.%Y} закрыт — удаление запрещено.'
        return None

    def destroy(self, request, *args, **kwargs):
        entry = self.get_object()
        if reason := self._delete_block_reason(entry):
            return Response({'detail': reason}, status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)

    def perform_destroy(self, instance):
        if reason := self._delete_block_reason(instance):
            raise ValidationError(reason)
        super().perform_destroy(instance)

    @action(detail=False, methods=['get'], url_path='osv')
    def osv(self, request):
        from accounting.models import Account

        date_from = request.query_params.get('date_from')
        date_to   = request.query_params.get('date_to')
        show_zero = request.query_params.get('show_zero', 'false') == 'true'

        if not date_from or not date_to:
            return Response({'detail': 'Укажите date_from и date_to'}, status=400)

        # ✅ Data Scoping — без этого пользователь, ограниченный конкретным
        # филиалом/складом (UserScope), видел бы обороты по ВСЕЙ компании.
        # apply_scope() тут не подходит напрямую (он делает queryset.filter(),
        # а нужно ограничить именно то, что суммируется внутри каждого Sum(...)
        # ниже) — поэтому используем тот же get_user_scope(), что и apply_scope,
        # и подмешиваем условие в base_filter, общий для всех сумм. Плюс текущий
        # выбранный склад/филиал (WorkDateWidget) — см. _osv_base_filter.
        branch_ids, warehouse_ids = get_user_scope(request.user)
        base_filter = _osv_base_filter(request, branch_ids, warehouse_ids)

        # ✅ Берём и листовые счета (на них есть проводки), и группы (is_group=True) —
        # у групп своих проводок быть не может ("нельзя делать проводки", см. Account.is_group),
        # их суммы ниже считаются рекурсивно как сумма всех дочерних счетов/подгрупп.
        qs = Account.objects.filter(
            is_active=True
        ).annotate(
            subconto_count=Count('account_subcontos', distinct=True),
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
        )

        by_id = {}
        children_map = {}
        for acc in qs:
            by_id[acc.id] = acc
            if acc.parent_id:
                children_map.setdefault(acc.parent_id, []).append(acc.id)

        # Листовые суммы — как есть; у групп стартуем с нуля и досчитываем от детей ниже.
        raw_sums = {}
        for acc in by_id.values():
            if acc.is_group:
                raw_sums[acc.id] = [Decimal('0')] * 4
            else:
                raw_sums[acc.id] = [
                    acc.pre_debit or Decimal('0'),
                    acc.pre_credit or Decimal('0'),
                    acc.debit_turnover or Decimal('0'),
                    acc.credit_turnover or Decimal('0'),
                ]

        # Рекурсивная (снизу вверх) агрегация: сумма группы = сумма всех её потомков
        # (листьев и вложенных подгрупп), независимо от глубины иерархии.
        totals: dict[int, list] = {}

        def compute(acc_id):
            if acc_id in totals:
                return totals[acc_id]
            acc = by_id[acc_id]
            if not acc.is_group:
                totals[acc_id] = raw_sums[acc_id]
                return totals[acc_id]
            total = [Decimal('0')] * 4
            for child_id in children_map.get(acc_id, []):
                child_total = compute(child_id)
                for i in range(4):
                    total[i] += child_total[i]
            totals[acc_id] = total
            return total

        for acc_id in by_id:
            compute(acc_id)

        # ✅ "Естественная" (числовая) сортировка кода счёта вместо лексикографической
        # order_by('code') — "9" и "10.5" в виде строк сортируются неправильно
        # ("10.5" < "9"), а как разбитые на числовые сегменты — правильно.
        def code_key(code: str):
            key = []
            for part in code.split('.'):
                try:
                    key.append((0, int(part)))
                except ValueError:
                    key.append((1, part))
            return key

        def sorted_children(ids):
            return sorted(ids, key=lambda i: code_key(by_id[i].code))

        ordered = []

        def walk(acc_id, depth):
            ordered.append((acc_id, depth))
            for child_id in sorted_children(children_map.get(acc_id, [])):
                walk(child_id, depth + 1)

        top_level_ids = [acc.id for acc in by_id.values() if acc.parent_id is None]
        for acc_id in sorted_children(top_level_ids):
            walk(acc_id, 0)

        data = []
        for acc_id, depth in ordered:
            acc = by_id[acc_id]
            pre_dt, pre_kt, dt, kt = totals[acc_id]

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
                'is_group':       acc.is_group,
                'depth':          depth,
                'opening_debit':  opening_debit,
                'opening_credit': opening_credit,
                'debit_turnover':  dt,
                'credit_turnover': kt,
                'closing_debit':  closing_debit,
                'closing_credit': closing_credit,
                # ✅ Есть ли у счёта настроенное субконто (см. SubcontoBreakdownPage.tsx) —
                # у групп своих проводок нет, поэтому для них всегда False, даже если
                # subconto_count > 0 по ошибке конфигурации.
                'has_subconto':   bool(acc.subconto_count) and not acc.is_group,
            })

        return Response(data)

    @action(detail=False, methods=['get'], url_path='subconto-breakdown')
    def subconto_breakdown(self, request):
        """
        Карточка счёта по субконто (уровень 1) — drill-down из ОСВ для счетов с
        настроенным субконто (например "Счёт расчётов с покупателем" + субконто
        "Контрагент"): по каждому значению субконто — начальное сальдо, обороты
        за период, конечное сальдо. Те же формулы, что и в osv(), но сгруппированные
        не по счетам, а по значению JSON-ключа TransactionLine.subcontos[slug].
        """
        from accounting.models import Account, AccountSubconto, TransactionLine

        account_id    = request.query_params.get('account')
        subconto_slug = request.query_params.get('subconto_slug')
        date_from     = request.query_params.get('date_from')
        date_to       = request.query_params.get('date_to')
        show_zero     = request.query_params.get('show_zero', 'false') == 'true'

        if not account_id or not subconto_slug or not date_from or not date_to:
            return Response({'detail': 'Укажите account, subconto_slug, date_from и date_to'}, status=400)

        try:
            account = Account.objects.get(id=account_id)
        except Account.DoesNotExist:
            return Response({'detail': 'Счёт не найден'}, status=404)

        try:
            acc_subconto = AccountSubconto.objects.select_related(
                'subconto_type', 'subconto_type__content_type',
            ).get(account=account, subconto_type__slug=subconto_slug)
        except AccountSubconto.DoesNotExist:
            return Response({'detail': 'У счёта не настроено такое субконто'}, status=400)

        subconto_type = acc_subconto.subconto_type
        if not subconto_type.content_type_id:
            return Response({'detail': f'Субконто «{subconto_type.name}» не привязано к модели данных'}, status=400)

        branch_ids, warehouse_ids = get_user_scope(request.user)
        base_filter = _tl_scope_filter(request, branch_ids, warehouse_ids)
        key_lookup = f'subcontos__{subconto_slug}'

        base_qs = TransactionLine.objects.filter(base_filter, account_id=account_id).exclude(
            **{f'{key_lookup}__isnull': True}
        )

        def sums_by_key(qs):
            rows = qs.values(key_lookup).annotate(
                debit=Sum('amount', filter=Q(side='debit'), default=Decimal('0')),
                credit=Sum('amount', filter=Q(side='credit'), default=Decimal('0')),
            )
            result = {}
            for row in rows:
                try:
                    key = int(row[key_lookup])
                except (TypeError, ValueError):
                    continue
                result[key] = (row['debit'] or Decimal('0'), row['credit'] or Decimal('0'))
            return result

        pre_sums    = sums_by_key(base_qs.filter(journal_entry__date__date__lt=date_from))
        period_sums = sums_by_key(base_qs.filter(
            journal_entry__date__date__gte=date_from, journal_entry__date__date__lte=date_to,
        ))

        all_keys = set(pre_sums) | set(period_sums)
        model_class = subconto_type.content_type.model_class()
        # ✅ Если модель субконто — Counterparty (или любая другая с полем agent) —
        # заранее подтягиваем agent.employee одним запросом, чтобы фронтенд мог
        # сгруппировать список по агенту (см. SubcontoBreakdownPage.tsx groupByAgent),
        # без лишнего запроса на каждую строку.
        has_agent_field = any(f.name == 'agent' for f in model_class._meta.get_fields())
        qs = model_class.objects.all()
        if has_agent_field:
            qs = qs.select_related('agent', 'agent__employee')

        # ✅ "Показать нулевые" должно показывать ВООБЩЕ ВСЕХ (например всех
        # контрагентов), а не только тех, у кого расчётная сумма (открыт./оборот/закрыт.)
        # случайно вышла в ноль — те, у кого на этом счёте вообще нет ни одной проводки,
        # иначе никогда не попадали в all_keys (его строят только pre_sums/period_sums).
        if show_zero:
            all_keys |= set(qs.values_list('id', flat=True))

        objects_by_id = qs.in_bulk(list(all_keys))

        data = []
        totals = {
            'opening_debit': Decimal('0'), 'opening_credit': Decimal('0'),
            'debit_turnover': Decimal('0'), 'credit_turnover': Decimal('0'),
            'closing_debit': Decimal('0'), 'closing_credit': Decimal('0'),
        }

        for key in all_keys:
            pre_dt, pre_kt = pre_sums.get(key, (Decimal('0'), Decimal('0')))
            dt, kt = period_sums.get(key, (Decimal('0'), Decimal('0')))

            opening_balance = pre_dt - pre_kt
            opening_debit  = max(opening_balance,  Decimal('0'))
            opening_credit = max(-opening_balance, Decimal('0'))

            closing_balance = opening_balance + dt - kt
            closing_debit  = max(closing_balance,  Decimal('0'))
            closing_credit = max(-closing_balance, Decimal('0'))

            if not show_zero and dt == 0 and kt == 0 and opening_debit == 0 and opening_credit == 0 and closing_debit == 0 and closing_credit == 0:
                continue

            obj = objects_by_id.get(key)
            label = str(obj) if obj is not None else f'#{key}'
            agent = getattr(obj, 'agent', None) if has_agent_field else None

            totals['opening_debit']  += opening_debit
            totals['opening_credit'] += opening_credit
            totals['debit_turnover']  += dt
            totals['credit_turnover'] += kt
            totals['closing_debit']  += closing_debit
            totals['closing_credit'] += closing_credit

            data.append({
                'subconto_id':    key,
                'subconto_label': label,
                'opening_debit':  opening_debit,
                'opening_credit': opening_credit,
                'debit_turnover':  dt,
                'credit_turnover': kt,
                'closing_debit':  closing_debit,
                'closing_credit': closing_credit,
                # ✅ Только если у модели субконто вообще есть поле agent (Counterparty) —
                # для остальных (Product и т.п.) всегда None, группировка по агенту
                # на фронте в этом случае просто не показывается.
                'agent_id':    agent.id if agent else None,
                'agent_label': str(agent) if agent else None,
            })

        data.sort(key=lambda r: r['subconto_label'])

        return Response({
            'items': data,
            'totals': totals,
            'account_code': account.code,
            'account_name': account.name,
            'subconto_name': subconto_type.name,
        })

    @action(detail=False, methods=['get'], url_path='subconto-card')
    def subconto_card(self, request):
        """
        Карточка счёта по субконто (уровень 2) — хронологический список проводок
        по счёту для ОДНОГО значения субконто (drill-down из subconto_breakdown),
        с бегущим остатком — как обычная "карточка счёта" в 1С.
        """
        from accounting.models import Account, AccountSubconto

        account_id    = request.query_params.get('account')
        subconto_slug = request.query_params.get('subconto_slug')
        subconto_id   = request.query_params.get('subconto_id')
        date_from     = request.query_params.get('date_from')
        date_to       = request.query_params.get('date_to')

        if not all([account_id, subconto_slug, subconto_id, date_from, date_to]):
            return Response({'detail': 'Укажите account, subconto_slug, subconto_id, date_from и date_to'}, status=400)

        try:
            account = Account.objects.get(id=account_id)
        except Account.DoesNotExist:
            return Response({'detail': 'Счёт не найден'}, status=404)

        try:
            acc_subconto = AccountSubconto.objects.select_related(
                'subconto_type', 'subconto_type__content_type',
            ).get(account=account, subconto_type__slug=subconto_slug)
        except AccountSubconto.DoesNotExist:
            return Response({'detail': 'У счёта не настроено такое субконто'}, status=400)

        subconto_type = acc_subconto.subconto_type
        model_class = subconto_type.content_type.model_class()
        try:
            subconto_obj = model_class.objects.get(id=subconto_id)
        except model_class.DoesNotExist:
            return Response({'detail': 'Элемент субконто не найден'}, status=404)

        return Response(_compute_subconto_card(request, account, subconto_slug, subconto_id, subconto_obj, date_from, date_to))

    @action(detail=False, methods=['get'], url_path='account-card')
    def account_card(self, request):
        """
        Карточка счёта (отдельный отчёт "Карточка счёта", см. AccountCardPage.tsx) —
        хронологический список проводок с бегущим остатком, общий движок в
        _compute_account_card. ✅ Счёт (account) НЕОБЯЗАТЕЛЕН — как и
        ProductTurnoverPage.tsx, отчёт по умолчанию показывает карточки СРАЗУ по
        всем счетам с активностью (без пагинации, один экран — не "1 счёт за раз
        с постраничной прокруткой проводок", как было раньше); ?account=<id> сужает
        до одного конкретного счёта (опционально ещё и до одного субконто через
        subconto_slug/subconto_id).
        """
        from accounting.models import Account, AccountSubconto

        date_from = request.query_params.get('date_from')
        date_to   = request.query_params.get('date_to')
        if not date_from or not date_to:
            return Response({'detail': 'Укажите date_from и date_to'}, status=400)

        entry_type = request.query_params.get('entry_type')
        search     = request.query_params.get('search')
        account_id = request.query_params.get('account')

        if not account_id:
            show_zero = request.query_params.get('show_zero', 'false') == 'true'
            return Response({'cards': _account_card_all(request, date_from, date_to, entry_type, search, show_zero)})

        try:
            account = Account.objects.get(id=account_id)
        except Account.DoesNotExist:
            return Response({'detail': 'Счёт не найден'}, status=404)

        if account.is_group:
            return Response({'detail': 'У счёта-группы не бывает своих проводок'}, status=400)

        subconto_slug = request.query_params.get('subconto_slug') or None
        subconto_id   = request.query_params.get('subconto_id') or None
        if subconto_slug and not AccountSubconto.objects.filter(account=account, subconto_type__slug=subconto_slug).exists():
            return Response({'detail': 'У счёта не настроено такое субконто'}, status=400)

        card = _compute_account_card(
            request, account, date_from, date_to,
            subconto_slug=subconto_slug, subconto_id=subconto_id,
            entry_type=entry_type, search=search,
        )
        return Response({'cards': [card]})


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
        date = serializer.validated_data.get('date')
        _, user_warehouses = get_user_scope(self.request.user)

        if user_warehouses and warehouse.pk not in user_warehouses:
            raise ValidationError("Нет доступа к этому складу.")

        # ✅ Закрывать дни можно только по порядку, без пропусков — иначе
        # "последний закрытый день + 1" (см. utils.py::check_period_open)
        # перестаёт однозначно определять разрешённую дату для операций.
        # Если по складу ещё ни разу не закрывали — можно закрыть любую дату
        # (первое закрытие).
        last_closed = (
            ClosedPeriod.objects.filter(warehouse=warehouse).order_by('-date').first()
        )
        if last_closed is not None:
            required_date = last_closed.date + datetime.timedelta(days=1)
            if date != required_date:
                raise ValidationError(
                    f"Нельзя закрыть {date.strftime('%d.%m.%Y')} — по складу «{warehouse.name}» последний "
                    f"закрытый день {last_closed.date.strftime('%d.%m.%Y')}. Закрывать дни можно только "
                    f"по порядку: следующая разрешённая дата закрытия — {required_date.strftime('%d.%m.%Y')}."
                )

        instance = serializer.save(closed_by=self.request.user)
        # ✅ Раньше здесь не передавался changed_data вообще — в AuditLogPage.tsx
        # запись о закрытии дня выглядела пустой ("—"), без единого понятного слова
        # о том, что именно произошло. Даём тот же читаемый {before, after} формат,
        # что и при переоткрытии (см. destroy() ниже).
        self._write_log(
            self.request, instance, AuditLog.Action.CREATE,
            {
                'период': {'before': 'Открыт', 'after': f'Закрыт ({date.strftime("%d.%m.%Y")})'},
                'склад': warehouse.name,
                'примечание': instance.note or '—',
            },
        )

        # ✅ После закрытия дня по складу в нём не должно оставаться черновиков
        # с датой в закрытом периоде — иначе их станет невозможно провести
        # (check_period_open разрешает только "последний закрытый + 1"). Переносим
        # все черновики фактур и проводок этого склада с date <= закрытая дата
        # на следующий день — единственную разрешённую дату для операций дальше.
        # ✅ Обновляем по одной записи (не queryset.update()) — это side-эффект
        # над бизнес-данными, каждую правку логируем в AuditLog отдельно
        # (см. CLAUDE.md: bulk queryset.update()/.delete() обходит аудит).
        next_date = date + datetime.timedelta(days=1)

        stale_docs = Document.objects.filter(
            status=Document.Status.DRAFT,
            date__lte=date,
        ).filter(Q(warehouse=warehouse) | Q(warehouse_to=warehouse))
        for doc in stale_docs:
            old_date = doc.date
            doc.date = next_date
            doc.save(update_fields=['date'])
            self._write_log(
                self.request, doc, AuditLog.Action.UPDATE,
                {'date': {'before': str(old_date), 'after': str(next_date)}, 'reason': f'Закрытие дня склада «{warehouse.name}»'},
            )

        stale_entries = JournalEntry.objects.filter(
            status=JournalEntry.Status.DRAFT,
            warehouse=warehouse,
            date__date__lte=date,
        )
        for entry in stale_entries:
            old_date = entry.date
            entry.date = next_date
            entry.save(update_fields=['date'])
            self._write_log(
                self.request, entry, AuditLog.Action.UPDATE,
                {'date': {'before': str(old_date), 'after': str(next_date)}, 'reason': f'Закрытие дня склада «{warehouse.name}»'},
            )

        # ✅ Снапшот остатков склада на конец закрытого дня — см.
        # warehouse_snapshot.py::create_snapshot_for_closing. Из-за жёсткого
        # последовательного правила закрытия предыдущий снапшот (если есть) всегда
        # ровно на date-1, поэтому досчёт узкий (только за date), а не скан всей
        # истории. Отчёты по оборотам (product_turnover) читают отсюда вместо
        # полного скана DocumentItem с начала времён.
        create_snapshot_for_closing(warehouse, date)

        _broadcast_closed_period(self.request, instance, "closed")

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        _, user_warehouses = get_user_scope(request.user)

        if user_warehouses:
            return Response(
                {'detail': 'Открывать закрытый день может только пользователь без привязки к складу.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # ✅ Примечание обязательно при переоткрытии — это редкое, значимое
        # административное действие (снимает жёсткое ограничение "один рабочий
        # день за раз" для всех операций по складу), причина должна быть
        # зафиксирована явно, а не восстанавливаться по памяти потом.
        note = (request.data.get('note') or '').strip()
        if not note:
            return Response(
                {'detail': 'Укажите причину переоткрытия дня — примечание обязательно.'},
                status=status.HTTP_400_BAD_REQUEST,
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
        # ✅ Раньше тут писался сырой {'snapshot': {...}} — AuditLogPage.tsx умеет
        # красиво рендерить только значения формата {before, after} (показывает
        # "было → стало" красным/зелёным), а обычный вложенный dict рендерился
        # через String(value) → "[object Object]", нечитаемо. Даём понятный текст
        # в том же {before, after} формате вместо сырого снапшота, плюс обязательное
        # примечание — причина, по которой день переоткрыли.
        closed_by_name = instance.closed_by.get_full_name() or instance.closed_by.username if instance.closed_by_id else "—"
        self._write_log(
            request, instance, AuditLog.Action.DELETE,
            {
                'период': {'before': f'Закрыт ({date.strftime("%d.%m.%Y")})', 'after': 'Открыт (переоткрыт)'},
                'склад': instance.warehouse.name if instance.warehouse_id else "—",
                'закрывал': closed_by_name,
                'примечание (причина переоткрытия)': note,
            },
        )
        instance.delete()

        # ✅ Снапшот на эту дату (см. warehouse_snapshot.py) мог устареть — день
        # переоткрыт именно чтобы что-то в нём исправить. Удаляем, чтобы отчёты
        # не читали больше не актуальный остаток; при повторном закрытии этого
        # дня снапшот пересчитается заново с уже исправленными данными.
        WarehouseProductSnapshot.objects.filter(warehouse_id=warehouse_id, date=date).delete()

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