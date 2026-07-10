# backend/accounting/views/report_views.py
import datetime
from decimal import Decimal

from django.db.models import Q, Sum, Case, When, Count, F, DecimalField, ExpressionWrapper, Value
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounting.models import Document, DocumentItem, Product, Warehouse, WarehouseStock, WarehouseProductSnapshot
from users.permissions import _rbac
from users.scoping import get_user_scope

TURNOVER_TYPES = ['in', 'out', 'move', 'return_in', 'return_out']


def _resolve_warehouse_ids(request):
    """
    Множество ID складов для отчёта — пересечение выбранного в шапке (WorkDateWidget,
    правый сайдбар) склада/филиала со scope пользователя (см. CLAUDE.md: "все отчёты
    должны смотреть на branch, warehouse, date_range"):
      - выбран конкретный склад (?warehouse=) — только он, если он доступен по scope
      - выбран только филиал (?branch=), без склада — все склады этого филиала,
        доступные по scope
      - не выбрано ничего — весь scope пользователя (или все склады, если scope
        не задан — см. get_user_scope: пусто и для суперюзера, и для пользователя
        без UserScope вообще, то есть ему доступно всё)
    ✅ Пересечение с scope обязательно даже когда выбран конкретный склад — иначе
    ?warehouse= в query-параметрах позволил бы обойти scope и посмотреть чужой склад.
    """
    branch_ids, warehouse_ids = get_user_scope(request.user)
    if not branch_ids and not warehouse_ids:
        scope_warehouse_ids = set(Warehouse.objects.values_list('id', flat=True))
    else:
        scope_warehouse_ids = set(warehouse_ids)
        if branch_ids:
            scope_warehouse_ids.update(Warehouse.objects.filter(branch_id__in=branch_ids).values_list('id', flat=True))

    warehouse_param = request.query_params.get('warehouse')
    branch_param = request.query_params.get('branch')

    if warehouse_param:
        # ✅ Поддержка списка через запятую (?warehouse=1,2,3) — используется
        # фильтром складов дашборда (правый сайдбар), а не только выбором
        # одного склада в шапке; одиночный id по-прежнему работает как раньше.
        selected_ids = {int(x) for x in warehouse_param.split(',') if x.strip().isdigit()}
    elif branch_param:
        selected_ids = set(Warehouse.objects.filter(branch_id=branch_param).values_list('id', flat=True))
    else:
        return scope_warehouse_ids

    return selected_ids & scope_warehouse_ids


def _main_image(product):
    # ✅ product.images должен быть уже prefetch_related() на вызывающей стороне —
    # иначе .all() тут даёт N+1 (один запрос картинок на каждый товар).
    images = list(product.images.all())
    main = next((img for img in images if img.is_main), None) or (images[0] if images else None)
    if not main:
        return None, None
    thumbnail_url = main.thumbnail.url if main.thumbnail else None
    image_url = main.image.url if main.image else None
    return thumbnail_url, image_url


def _new_bucket(product):
    thumbnail_url, image_url = _main_image(product)
    return {
        'id': product.id,
        'sku': product.sku,
        'name': product.name,
        'unit': product.unit.name if product.unit_id else '',
        'category_id': product.category_id,
        'category_name': product.category.name if product.category_id else 'Без категории',
        'brand_id': product.brand_id,
        'brand_name': product.brand.name if product.brand_id else 'Без бренда',
        'cost_price': product.cost_price,
        'thumbnail_url': thumbnail_url,
        'image_url': image_url,
        'opening_qty': Decimal('0'), 'opening_value': Decimal('0'),
        'in_qty': Decimal('0'), 'in_value': Decimal('0'),
        'return_in_qty': Decimal('0'), 'return_in_value': Decimal('0'),
        'out_qty': Decimal('0'), 'out_before_discount': Decimal('0'), 'out_discount': Decimal('0'), 'out_after_discount': Decimal('0'),
        'return_out_qty': Decimal('0'), 'return_out_value': Decimal('0'),
        'move_qty': Decimal('0'), 'move_value': Decimal('0'),
    }


def _closing(b):
    """
    ✅ По просьбе пользователя: "Начало"/"Конец" — ВСЕГДА qty × текущая
    себестоимость товара (b['cost_price']), не накопленная историческая сумма.
    "Приход"/"Расход" при этом остаются реальными суммами по факту документа
    (см. основной цикл ниже) — это отдельная витрина "что реально было по
    накладным", она сознательно НЕ обязана арифметически сходиться с
    Начало/Конец (это разные вещи: факт движения денег vs текущая оценка
    остатка). Раньше Конец считался как Начало+Приход-Расход по историческим
    суммам — из-за разницы цены продажи и себестоимости на разных документах
    сумма могла уйти в минус, хотя количество было верным.
    """
    closing_qty = (
        b['opening_qty'] + b['in_qty'] + b['return_in_qty']
        - b['out_qty'] - b['return_out_qty'] + b['move_qty']
    )
    closing_value = closing_qty * b['cost_price']
    return closing_qty, closing_value


class ReportViewSet(viewsets.ViewSet):
    """
    Отчёты, которые не привязаны к одной модели один-в-один (в отличие от ОСВ,
    который живёт на JournalEntryViewSet — см. transaction_views.py::osv).
    """

    def get_permissions(self):
        if self.action == 'stock_balance':
            # ✅ Читает WarehouseStock — гейтим тем же resource, что и саму
            # страницу остатков (WarehouseStocksPage::usePageAccess("warehousestock")),
            # а не 'document' (эти данные вообще не о документах).
            return _rbac(self.action, 'warehousestock')
        # ✅ Читает Document/DocumentItem — гейтим тем же ресурсом, что и сами
        # документы (нет смысла заводить отдельный resource для read-only отчёта).
        return _rbac(self.action, 'document')

    @action(detail=False, methods=['get'], url_path='stock-balance')
    def stock_balance(self, request):
        """
        Остаток по товару + сколько уже "зарезервировано" черновиками расходных
        накладных (Document.status='draft', document_type='out' — ещё не проведены,
        товар физически на складе, но уже под заказом) + доступно (остаток - резерв).
        Просуммировано по нужному набору складов — тот же принцип пересечения
        выбора в шапке (warehouse/branch) со scope пользователя, что и в
        _resolve_warehouse_ids (см. CLAUDE.md: отчёты должны реагировать на
        branch/warehouse/scope). Использовано в ProductsListPage — колонка "Name"
        с остатком нужна сразу по всему списку товаров, поэтому один bulk-запрос
        с группировкой на бэкенде, а не N+1 с фронта.

        ⚠️ Это НЕ то же самое, что WarehouseStock.reserved_quantity — то поле нигде
        в коде не пишется (всегда 0), резерв здесь считается заново из живых
        черновиков на каждый запрос.
        """
        wh_set = _resolve_warehouse_ids(request)
        if not wh_set:
            return Response({})

        stock_rows = (
            WarehouseStock.objects
            .filter(warehouse_id__in=wh_set)
            .values('product_id')
            .annotate(qty=Sum('quantity'))
        )
        reserved_rows = (
            DocumentItem.objects
            .filter(
                document__status='draft',
                document__document_type='out',
                document__warehouse_id__in=wh_set,
            )
            .values('product_id')
            .annotate(qty=Sum('quantity'))
        )
        reserved_map = {r['product_id']: (r['qty'] or Decimal('0')) for r in reserved_rows}

        # ✅ is_low — остаток (quantity, не available) ниже Product.min_stock_level
        # в ВЫБРАННОМ scope (warehouse/branch), не через SystemAlert (та таблица
        # обновляется только по расписанию Celery Beat / ручному "проверить сейчас"
        # и может быть устаревшей) — используется для маркировки в ProductsListPage
        # и фильтра "Только с нехваткой" в сайдбаре.
        min_stock_map = dict(Product.objects.filter(min_stock_level__gt=0, is_active=True).values_list('id', 'min_stock_level'))

        # ✅ "Мало" считаем ТОЛЬКО для товара, который хоть раз реально фигурировал
        # в накладной (любой, необязательно проведённой) — иначе остаток 0 у
        # товара, который никогда не закупали/продавали (например заведён
        # массовым импортом с WarehouseStock=0), даёт ложную "нехватку", а не
        # настоящий сигнал. Проверяем ОДИН РАЗ для всех кандидатов сразу — раньше
        # эта проверка была только в ветке "нет вообще никаких строк" (ниже), из-за
        # чего в ProductsListPage всё ещё подсвечивалось намного больше товаров,
        # чем реальных уведомлений в колокольчике (accounting/tasks.py::_check_low_stock,
        # там та же проверка уже применяется ко всем случаям). Тот же принцип —
        # единообразно на все три ветки ниже (со строкой WarehouseStock, с резервом,
        # и вообще без движений).
        pids_with_turnover = set(
            DocumentItem.objects.filter(product_id__in=list(min_stock_map)).values_list('product_id', flat=True).distinct()
        ) if min_stock_map else set()

        def is_low(pid, qty):
            min_level = min_stock_map.get(pid)
            return min_level is not None and pid in pids_with_turnover and qty < min_level

        result = {}
        for r in stock_rows:
            pid = r['product_id']
            qty = r['qty'] or Decimal('0')
            reserved = reserved_map.pop(pid, Decimal('0'))
            result[str(pid)] = {
                'quantity': str(qty), 'reserved': str(reserved), 'available': str(qty - reserved),
                'min_stock_level': min_stock_map.get(pid), 'is_low': is_low(pid, qty),
            }
        # ✅ Товар без строк WarehouseStock (остаток 0), но с резервом по черновикам —
        # тоже нужно показать: остаток 0, доступно уходит в минус — явный сигнал,
        # что заказано больше, чем реально есть на складе.
        for pid, reserved in reserved_map.items():
            result[str(pid)] = {
                'quantity': '0', 'reserved': str(reserved), 'available': str(Decimal('0') - reserved),
                'min_stock_level': min_stock_map.get(pid), 'is_low': is_low(pid, Decimal('0')),
            }

        # ✅ Товар без ЛЮБЫХ движений в этом scope (ни остатка, ни резерва), но с
        # min_stock_level > 0 — тоже нужно вернуть (остаток фактически 0 < порога),
        # is_low считаем той же общей функцией is_low() выше.
        for pid, min_level in min_stock_map.items():
            key = str(pid)
            if key not in result:
                result[key] = {
                    'quantity': '0', 'reserved': '0', 'available': '0',
                    'min_stock_level': min_level, 'is_low': is_low(pid, Decimal('0')),
                }

        return Response(result)

    @action(detail=False, methods=['get'], url_path='revenue-by-warehouse')
    def revenue_by_warehouse(self, request):
        """
        Выручка = сумма Document.total проведённых "Расходных" накладных (out)
        минус "Возврат поставщику" (return_out) — то есть ровно то значение,
        что стоит на самом документе (см. CLAUDE.md: "система никогда не
        хардкодит, откуда взялось значение"), без пересчёта через проводки.
        Разбивка по складам — тот же принцип пересечения выбора в шапке
        (WorkDateWidget) со scope пользователя, что и в остальных отчётах
        (см. _resolve_warehouse_ids).
        """
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        if not date_from or not date_to:
            return Response({'detail': 'Укажите date_from и date_to'}, status=400)

        wh_set = _resolve_warehouse_ids(request)
        if not wh_set:
            return Response({'total_revenue': '0', 'total_documents': 0, 'by_warehouse': [], 'daily': []})

        base_qs = Document.objects.filter(
            status='posted',
            document_type__in=[Document.Type.OUT, Document.Type.RETURN_OUT],
            date__gte=date_from,
            date__lte=date_to,
            warehouse_id__in=wh_set,
        )
        revenue_expr = Sum(Case(
            When(document_type=Document.Type.OUT, then=F('total')),
            When(document_type=Document.Type.RETURN_OUT, then=-F('total')),
            default=0, output_field=DecimalField(max_digits=18, decimal_places=2),
        ))

        by_warehouse_rows = (
            base_qs
            .values('warehouse_id', 'warehouse__name')
            .annotate(
                revenue=revenue_expr,
                documents_count=Count('id', filter=Q(document_type=Document.Type.OUT)),
            )
            .order_by('-revenue')
        )
        by_warehouse = [
            {
                'warehouse_id': r['warehouse_id'],
                'warehouse_name': r['warehouse__name'],
                'revenue': r['revenue'] or Decimal('0'),
                'documents_count': r['documents_count'],
            }
            for r in by_warehouse_rows
        ]

        # ✅ Группировка по (дата, склад), а не только по дате — иначе фильтр складов
        # в сайдбаре (правый сайдбар дашборда) не мог бы корректно пересчитать тренд
        # под выбранное подмножество складов, только общий график по всем сразу.
        daily_rows = base_qs.values('date', 'warehouse_id', 'warehouse__name').annotate(revenue=revenue_expr).order_by('date')
        daily = [
            {
                'date': r['date'],
                'warehouse_id': r['warehouse_id'],
                'warehouse_name': r['warehouse__name'],
                'revenue': r['revenue'] or Decimal('0'),
            }
            for r in daily_rows
        ]

        total_revenue = sum((w['revenue'] for w in by_warehouse), Decimal('0'))
        total_documents = sum(w['documents_count'] for w in by_warehouse)

        return Response({
            'total_revenue': total_revenue,
            'total_documents': total_documents,
            'by_warehouse': by_warehouse,
            'daily': daily,
        })

    @action(detail=False, methods=['get'], url_path='top-products')
    def top_products(self, request):
        """
        Топ-5 товаров по выручке за период — на уровне строк документа
        (DocumentItem), а не Document.total, потому что нужна разбивка по
        товару. Та же логика "out минус return_out", что и в product_turnover
        выше: "Расход" — по факту документа СО СКИДКОЙ (net), "Возврат
        поставщику" — БЕЗ скидки (gross), см. комментарий в product_turnover.
        """
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        if not date_from or not date_to:
            return Response({'detail': 'Укажите date_from и date_to'}, status=400)

        wh_set = _resolve_warehouse_ids(request)
        if not wh_set:
            return Response([])

        dec_field = DecimalField(max_digits=18, decimal_places=2)
        line_factor = Value(Decimal('1')) - F('discount_percent') / Value(Decimal('100'))
        net_expr = ExpressionWrapper(F('quantity') * F('price') * line_factor, output_field=dec_field)
        gross_expr = ExpressionWrapper(F('quantity') * F('price'), output_field=dec_field)

        rows = (
            DocumentItem.objects
            .filter(
                document__status='posted',
                document__document_type__in=[Document.Type.OUT, Document.Type.RETURN_OUT],
                document__date__gte=date_from,
                document__date__lte=date_to,
                document__warehouse_id__in=wh_set,
            )
            .values('product_id', 'product__name')
            .annotate(
                revenue=Sum(Case(
                    When(document__document_type=Document.Type.OUT, then=net_expr),
                    When(document__document_type=Document.Type.RETURN_OUT, then=-gross_expr),
                    default=0, output_field=dec_field,
                )),
                quantity=Sum(Case(
                    When(document__document_type=Document.Type.OUT, then=F('quantity')),
                    When(document__document_type=Document.Type.RETURN_OUT, then=-F('quantity')),
                    default=0, output_field=dec_field,
                )),
            )
            .order_by('-revenue')[:5]
        )
        return Response([
            {
                'product_id': r['product_id'],
                'product_name': r['product__name'],
                # ✅ ExpressionWrapper-умножение/деление (line_factor) даёт NUMERIC
                # произвольной точности от Postgres — округляем явно, как и в
                # Document.recalculate(), а не отдаём "600.0000000000000000000000000".
                'revenue': (r['revenue'] or Decimal('0')).quantize(Decimal('0.01')),
                'quantity': (r['quantity'] or Decimal('0')).quantize(Decimal('0.001')),
            }
            for r in rows
        ])

    @action(detail=False, methods=['get'], url_path='top-counterparties')
    def top_counterparties(self, request):
        """
        Топ-5 контрагентов по выручке за период — та же выручка (out минус
        return_out по Document.total), что и в revenue_by_warehouse, только
        сгруппированная по контрагенту, а не по складу.
        """
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        if not date_from or not date_to:
            return Response({'detail': 'Укажите date_from и date_to'}, status=400)

        wh_set = _resolve_warehouse_ids(request)
        if not wh_set:
            return Response([])

        revenue_expr = Sum(Case(
            When(document_type=Document.Type.OUT, then=F('total')),
            When(document_type=Document.Type.RETURN_OUT, then=-F('total')),
            default=0, output_field=DecimalField(max_digits=18, decimal_places=2),
        ))
        rows = (
            Document.objects
            .filter(
                status='posted',
                document_type__in=[Document.Type.OUT, Document.Type.RETURN_OUT],
                date__gte=date_from,
                date__lte=date_to,
                warehouse_id__in=wh_set,
            )
            .values('counterparty_id', 'counterparty__name')
            .annotate(
                revenue=revenue_expr,
                documents_count=Count('id', filter=Q(document_type=Document.Type.OUT)),
            )
            .order_by('-revenue')[:5]
        )
        return Response([
            {
                'counterparty_id': r['counterparty_id'],
                'counterparty_name': r['counterparty__name'],
                'revenue': r['revenue'] or Decimal('0'),
                'documents_count': r['documents_count'],
            }
            for r in rows
        ])

    @action(detail=False, methods=['get'], url_path='today-documents')
    def today_documents(self, request):
        """
        Проведённые сегодня "Расходные"/"Возврат поставщику" — источник данных
        для бегущей строки на дашборде. Всегда СЕГОДНЯШНЯЯ дата сервера (не
        periodFrom/periodTo из шапки — бегущая строка про "прямо сейчас", а не
        про выбранный отчётный период), но тот же принцип scope/фильтра
        складов (_resolve_warehouse_ids), что и у остальных виджетов дашборда.
        """
        wh_set = _resolve_warehouse_ids(request)
        if not wh_set:
            return Response([])

        today = timezone.localdate()
        rows = (
            Document.objects
            .filter(
                status='posted',
                document_type__in=[Document.Type.OUT, Document.Type.RETURN_OUT],
                date=today,
                warehouse_id__in=wh_set,
            )
            .select_related('counterparty', 'warehouse')
            .order_by('-posted_at')[:30]
        )
        return Response([
            {
                'id': d.id,
                'number': d.number,
                'document_type': d.document_type,
                'counterparty_name': d.counterparty.name if d.counterparty_id else '',
                'warehouse_name': d.warehouse.name if d.warehouse_id else '',
                'total': d.total,
                'posted_at': d.posted_at,
            }
            for d in rows
        ])

    @action(detail=False, methods=['get'], url_path='product-turnover')
    def product_turnover(self, request):
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        if not date_from or not date_to:
            return Response({'detail': 'Укажите date_from и date_to'}, status=400)

        date_from_obj = datetime.date.fromisoformat(date_from)

        wh_set = _resolve_warehouse_ids(request)
        if not wh_set:
            return Response([])

        category_param = request.query_params.get('category')
        category_ids = None
        if category_param:
            category_ids = [int(c) for c in category_param.split(',') if c.strip().isdigit()]

        balance = {}

        # ✅ Обрабатываем каждый склад из wh_set ОТДЕЛЬНО (а не одним общим
        # запросом с warehouse_id__in=wh_set, как раньше) — это позволяет у
        # каждого склада взять СВОЙ ближайший снапшот (см. WarehouseProductSnapshot,
        # создаётся при закрытии дня — warehouse_snapshot.py) и сканировать
        # DocumentItem только начиная со дня ПОСЛЕ него, а не с абсолютного начала
        # истории склада. Если снапшота ещё нет (склад ни разу не закрывали) —
        # старое поведение, полный скан до date_to.
        for warehouse_id in wh_set:
            snapshot_date = (
                WarehouseProductSnapshot.objects
                .filter(warehouse_id=warehouse_id, date__lt=date_from_obj)
                .order_by('-date')
                .values_list('date', flat=True)
                .first()
            )

            if snapshot_date:
                snap_qs = (
                    WarehouseProductSnapshot.objects
                    .filter(warehouse_id=warehouse_id, date=snapshot_date)
                    .select_related('product', 'product__unit', 'product__category', 'product__brand')
                    .prefetch_related('product__images')
                )
                if category_ids:
                    snap_qs = snap_qs.filter(product__category_id__in=category_ids)
                for snap in snap_qs.iterator(chunk_size=500):
                    b = balance.setdefault(snap.product.id, _new_bucket(snap.product))
                    b['opening_qty'] += snap.quantity
                    # ✅ opening_value НЕ берём из снапшота — см. _closing() выше,
                    # оно всегда пересчитывается как opening_qty × текущая
                    # себестоимость, в конце функции.
                date_filter = Q(document__date__gt=snapshot_date, document__date__lte=date_to)
            else:
                date_filter = Q(document__date__lte=date_to)

            items_qs = (
                DocumentItem.objects
                .filter(
                    document__status='posted',
                    document__document_type__in=TURNOVER_TYPES,
                )
                .filter(date_filter)
                .filter(Q(document__warehouse_id=warehouse_id) | Q(document__warehouse_to_id=warehouse_id))
                .select_related('document', 'product', 'product__unit', 'product__category', 'product__brand')
                .prefetch_related('product__images')
            )
            if category_ids:
                items_qs = items_qs.filter(product__category_id__in=category_ids)

            for item in items_qs.iterator(chunk_size=500):
                doc = item.document
                product = item.product
                b = balance.setdefault(product.id, _new_bucket(product))

                qty = item.quantity
                gross = qty * item.price
                discount_amt = (gross * item.discount_percent / Decimal('100'))
                net = gross - discount_amt
                is_pre = doc.date < date_from_obj

                # ✅ "Приход"/"Расход" — РЕАЛЬНЫЕ суммы по факту документа (что
                # реально указано в накладной), не себестоимость — по просьбе
                # пользователя эта витрина сознательно не обязана арифметически
                # сходиться с Начало/Конец (см. _closing() выше — там Начало/
                # Конец = qty × текущая себестоимость, независимо от истории).
                flows = []  # (qty_delta, value_delta, bucket)
                if doc.document_type == 'in' and doc.warehouse_id == warehouse_id:
                    flows.append((qty, gross, 'in'))
                elif doc.document_type == 'return_in' and doc.warehouse_id == warehouse_id:
                    flows.append((qty, gross, 'return_in'))
                elif doc.document_type == 'out' and doc.warehouse_id == warehouse_id:
                    flows.append((qty, net, 'out'))
                elif doc.document_type == 'return_out' and doc.warehouse_id == warehouse_id:
                    flows.append((qty, gross, 'return_out'))
                elif doc.document_type == 'move':
                    if doc.warehouse_id == warehouse_id:
                        flows.append((qty, gross, 'move_out'))
                    if doc.warehouse_to_id == warehouse_id:
                        flows.append((qty, gross, 'move_in'))

                for qty_delta, value_delta, bucket in flows:
                    if is_pre:
                        # ✅ До снапшота нужен только qty (opening_value считается
                        # в конце как opening_qty × текущая себестоимость) —
                        # value здесь больше не накапливаем.
                        sign = -1 if bucket in ('out', 'return_out', 'move_out') else 1
                        b['opening_qty'] += sign * qty_delta
                        continue

                    if bucket == 'in':
                        b['in_qty'] += qty_delta
                        b['in_value'] += value_delta
                    elif bucket == 'return_in':
                        b['return_in_qty'] += qty_delta
                        b['return_in_value'] += value_delta
                    elif bucket == 'out':
                        b['out_qty'] += qty_delta
                        b['out_before_discount'] += gross
                        b['out_discount'] += discount_amt
                        b['out_after_discount'] += net
                    elif bucket == 'return_out':
                        b['return_out_qty'] += qty_delta
                        b['return_out_value'] += value_delta
                    elif bucket == 'move_out':
                        b['move_qty'] -= qty_delta
                        b['move_value'] -= value_delta
                    elif bucket == 'move_in':
                        b['move_qty'] += qty_delta
                        b['move_value'] += value_delta

        data = []
        for b in balance.values():
            b['opening_value'] = b['opening_qty'] * b['cost_price']
            closing_qty, closing_value = _closing(b)
            b['closing_qty'] = closing_qty
            b['closing_value'] = closing_value
            data.append(b)

        return Response(data)

    @action(detail=False, methods=['get'], url_path='product-turnover-detail')
    def product_turnover_detail(self, request):
        product_id = request.query_params.get('product')
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        if not product_id or not date_from or not date_to:
            return Response({'detail': 'Укажите product, date_from и date_to'}, status=400)

        date_from_obj = datetime.date.fromisoformat(date_from)

        wh_set = _resolve_warehouse_ids(request)
        if not wh_set:
            return Response({'detail': 'Нет доступных складов'}, status=400)

        from accounting.models import Product
        try:
            product = Product.objects.select_related('unit').prefetch_related('images').get(pk=product_id)
        except Product.DoesNotExist:
            return Response({'detail': 'Товар не найден'}, status=404)

        thumbnail_url, image_url = _main_image(product)

        # ✅ Как и в product_turnover — берём снапшот (см. WarehouseProductSnapshot,
        # создаётся при закрытии дня) отдельно по каждому складу из wh_set вместо
        # полного скана истории до date_from. Если для склада снапшота нет (ни разу
        # не закрывали) — старое поведение, полный скан для этого склада.
        opening_qty = Decimal('0')

        for warehouse_id in wh_set:
            snapshot_date = (
                WarehouseProductSnapshot.objects
                .filter(warehouse_id=warehouse_id, product_id=product_id, date__lt=date_from_obj)
                .order_by('-date')
                .values_list('date', flat=True)
                .first()
            )
            if snapshot_date:
                snap = WarehouseProductSnapshot.objects.filter(
                    warehouse_id=warehouse_id, product_id=product_id, date=snapshot_date
                ).first()
                if snap:
                    opening_qty += snap.quantity
                    # ✅ opening_value не берём из снапшота — см. ниже, "Начало"
                    # всегда пересчитывается как opening_qty × текущая себестоимость.
                date_filter = Q(document__date__gt=snapshot_date, document__date__lt=date_from)
            else:
                date_filter = Q(document__date__lt=date_from)

            items_qs = (
                DocumentItem.objects
                .filter(
                    product_id=product_id,
                    document__status='posted',
                    document__document_type__in=TURNOVER_TYPES,
                )
                .filter(date_filter)
                .filter(Q(document__warehouse_id=warehouse_id) | Q(document__warehouse_to_id=warehouse_id))
                .select_related('document')
            )
            for item in items_qs.iterator():
                doc = item.document
                qty = item.quantity
                # ✅ По просьбе пользователя: "Начало"/"Конец" — ВСЕГДА
                # qty × текущая себестоимость (см. ниже opening_value=...),
                # поэтому здесь достаточно накопить только количество.
                if doc.document_type == 'in' and doc.warehouse_id == warehouse_id:
                    opening_qty += qty
                elif doc.document_type == 'return_in' and doc.warehouse_id == warehouse_id:
                    opening_qty += qty
                elif doc.document_type == 'out' and doc.warehouse_id == warehouse_id:
                    opening_qty -= qty
                elif doc.document_type == 'return_out' and doc.warehouse_id == warehouse_id:
                    opening_qty -= qty
                elif doc.document_type == 'move':
                    if doc.warehouse_id == warehouse_id:
                        opening_qty -= qty
                    if doc.warehouse_to_id == warehouse_id:
                        opening_qty += qty

        opening_value = opening_qty * product.cost_price

        period_items = (
            DocumentItem.objects
            .filter(
                product_id=product_id,
                document__status='posted',
                document__document_type__in=TURNOVER_TYPES,
                document__date__gte=date_from,
                document__date__lte=date_to,
            )
            .filter(Q(document__warehouse_id__in=wh_set) | Q(document__warehouse_to_id__in=wh_set))
            .select_related('document', 'document__counterparty', 'document__warehouse', 'document__warehouse_to')
            .order_by('document__date', 'document_id', 'line_no')
        )

        rows = []
        balance_qty = opening_qty
        turnover = {'in_qty': Decimal('0'), 'in_value': Decimal('0'), 'return_qty': Decimal('0'), 'return_value': Decimal('0'), 'out_qty': Decimal('0'), 'out_value': Decimal('0')}

        # ✅ По просьбе пользователя: "Приход"/"Расход" ниже — РЕАЛЬНЫЕ суммы по
        # факту документа (gross/net от item.price), не себестоимость. А вот
        # "Остаток" (balance_sum на каждой строке, и итоговый end_value) —
        # ВСЕГДА qty × текущая себестоимость (product.cost_price), пересчитывается
        # заново на каждой строке, а не накапливается — поэтому эти два ряда
        # цифр сознательно не обязаны биться "Начало+Приход-Расход=Остаток" по
        # сумме (только по количеству), см. _closing() в product_turnover выше.
        for item in period_items:
            doc = item.document
            qty = item.quantity
            price = item.price
            gross = qty * price
            discount_amt = gross * item.discount_percent / Decimal('100')
            net = gross - discount_amt

            in_qty = out_qty = return_qty = Decimal('0')
            value = Decimal('0')

            if doc.document_type == 'in' and doc.warehouse_id in wh_set:
                in_qty = qty
                value = gross
                balance_qty += qty
                turnover['in_qty'] += qty
                turnover['in_value'] += gross
            elif doc.document_type == 'return_in' and doc.warehouse_id in wh_set:
                return_qty = qty
                value = gross
                balance_qty += qty
                turnover['return_qty'] += qty
                turnover['return_value'] += gross
            elif doc.document_type == 'out' and doc.warehouse_id in wh_set:
                out_qty = qty
                value = net
                balance_qty -= qty
                turnover['out_qty'] += qty
                turnover['out_value'] += net
            elif doc.document_type == 'return_out' and doc.warehouse_id in wh_set:
                out_qty = qty
                value = gross
                balance_qty -= qty
                turnover['out_qty'] += qty
                turnover['out_value'] += gross
            elif doc.document_type == 'move':
                if doc.warehouse_id in wh_set:
                    out_qty = qty
                    value = gross
                    balance_qty -= qty
                if doc.warehouse_to_id in wh_set:
                    in_qty = qty
                    value = gross
                    balance_qty += qty

            balance_value = balance_qty * product.cost_price

            rows.append({
                'date': doc.date,
                'document_id': doc.id,
                'document_number': doc.number,
                'document_type': doc.document_type,
                'partner': doc.counterparty.name if doc.counterparty_id else '',
                'note': doc.note,
                'price': price,
                'discount_percent': item.discount_percent,
                'discount_amount': discount_amt,
                'in_qty': in_qty,
                'in_sum': value if in_qty else Decimal('0'),
                'return_qty': return_qty,
                'return_sum': value if return_qty else Decimal('0'),
                'out_qty': out_qty,
                'out_sum': value if out_qty else Decimal('0'),
                'balance_qty': balance_qty,
                'balance_sum': balance_value,
            })

        end_qty = balance_qty
        end_value = end_qty * product.cost_price

        return Response({
            'product_id': product.id,
            'product_name': product.name,
            'product_sku': product.sku,
            'product_unit': product.unit.name if product.unit_id else '',
            'product_cost_price': product.cost_price,
            'product_thumbnail_url': thumbnail_url,
            'product_image_url': image_url,
            'start_quantity': opening_qty,
            'start_value': opening_value,
            'turnover': turnover,
            'end': {'quantity': end_qty, 'value': end_value},
            'rows': rows,
        })
