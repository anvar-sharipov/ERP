# accounting/views/transaction_views.py

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum, Q
from django.db import transaction
import datetime

from accounting.models import JournalEntry, TransactionLine, StockMovement, ClosedPeriod, Document, WarehouseProductSnapshot
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
            qs = qs.filter(
                Q(number__icontains=search) |
                Q(description__icontains=search)
            )
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

    def destroy(self, request, *args, **kwargs):
        entry = self.get_object()
        if rejected := self._reject_if_document_entry(entry):
            return rejected
        return super().destroy(request, *args, **kwargs)

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