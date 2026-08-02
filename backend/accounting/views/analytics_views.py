# backend/accounting/views/analytics_views.py
"""
Раздел "Аналитика" (левый сайдбар, ROUTES.APP.ANALYTICS/Analytics.tsx) — BI-отчёты
поверх той же транзакционной истории (Document/DocumentItem), что и обычные отчёты
в report_views.py, но с другим фокусом (тренды/сегментация/статистика, а не
построчная детализация). Отдельный ViewSet/файл — чтобы не раздувать и без того
большой ReportViewSet, и потому что здесь будет постепенно расти ~15 разных видов
анализа (см. Analytics.tsx tabs).
"""
import statistics
from datetime import datetime, timedelta
from decimal import Decimal

from django.db.models import Sum, Case, When, Count, F, Q, Value, DecimalField, ExpressionWrapper
from django.db.models.functions import TruncDay, TruncWeek, TruncMonth
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounting.models import Document, DocumentItem
from users.permissions import _rbac
from .report_views import _resolve_warehouse_ids

DEC = DecimalField(max_digits=18, decimal_places=2)


class AnalyticsViewSet(viewsets.ViewSet):
    """
    Как и ReportViewSet — не привязан к одной модели. Гейтится тем же resource,
    что и обычные отчёты/документы ('document') — вся аналитика читает Document/
    DocumentItem, отдельный resource под read-only BI-срез не нужен.
    """

    def get_permissions(self):
        return _rbac(self.action, 'document')

    @action(detail=False, methods=['get'], url_path='sales-dynamics')
    def sales_dynamics(self, request):
        """
        Динамика продаж по дням/неделям/месяцам — тренд выручки за период.
        Выручка считается ТЕМ ЖЕ способом, что и в report_views.py::revenue_by_warehouse
        (сумма Document.total проведённых "Расходных" накладных минус "Возврат
        поставщику" — то есть ровно то значение, что стоит на самом документе, без
        пересчёта через проводки, см. CLAUDE.md: "система никогда не хардкодит,
        откуда взялось значение") — те же цифры, что и везде в отчётах, не
        отдельная "своя" методика для аналитики.
        """
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        granularity = request.query_params.get('granularity', 'day')
        if not date_from or not date_to:
            return Response({'detail': 'Укажите date_from и date_to'}, status=400)
        if granularity not in ('day', 'week', 'month'):
            granularity = 'day'

        wh_set = _resolve_warehouse_ids(request)
        if not wh_set:
            return Response({'points': [], 'total_revenue': '0', 'total_documents': 0, 'avg_check': '0', 'granularity': granularity})

        trunc_fn = {'day': TruncDay, 'week': TruncWeek, 'month': TruncMonth}[granularity]

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
            default=0, output_field=DEC,
        ))

        rows = (
            base_qs
            .annotate(bucket=trunc_fn('date'))
            .values('bucket')
            .annotate(
                revenue=revenue_expr,
                # ✅ Считаем только реальные продажи (OUT), а не возвраты — иначе
                # "среднего чека" искажался бы строками, где выручка отрицательная,
                # а документ никто не покупал.
                documents_count=Count('id', filter=Q(document_type=Document.Type.OUT)),
            )
            .order_by('bucket')
        )

        points = []
        total_revenue = Decimal('0')
        total_documents = 0
        best_point = None
        for r in rows:
            revenue = r['revenue'] or Decimal('0')
            docs = r['documents_count'] or 0
            total_revenue += revenue
            total_documents += docs
            point = {
                'date': r['bucket'],
                'revenue': revenue,
                'documents_count': docs,
                'avg_check': (revenue / docs) if docs else Decimal('0'),
            }
            points.append(point)
            if best_point is None or revenue > best_point['revenue']:
                best_point = point

        avg_check = (total_revenue / total_documents) if total_documents else Decimal('0')

        return Response({
            'points': points,
            'total_revenue': total_revenue,
            'total_documents': total_documents,
            'avg_check': avg_check,
            'best_point': best_point,
            'granularity': granularity,
        })

    @action(detail=False, methods=['get'], url_path='abc-analysis')
    def abc_analysis(self, request):
        """
        ABC-анализ — классификация товаров по вкладу в выручку за период (принцип
        Парето): класс A — товары, дающие первые threshold_a% совокупной выручки
        (по умолчанию 80), B — следующие до threshold_b% (по умолчанию 95), C —
        остальное. Выручка на уровне строки документа — та же методика, что и
        report_views.py::top_products (net для "Расхода", gross со знаком минус
        для "Возврата поставщику", тот же принцип "не хардкодить источник суммы").
        Товары с нулевой/отрицательной суммарной выручкой за период в ранжирование
        не попадают — им нечего вносить в распределение.
        """
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        if not date_from or not date_to:
            return Response({'detail': 'Укажите date_from и date_to'}, status=400)

        wh_set = _resolve_warehouse_ids(request)
        if not wh_set:
            return Response({'items': [], 'total_revenue': '0', 'total_count': 0, 'summary': []})

        try:
            threshold_a = Decimal(request.query_params.get('threshold_a') or '80')
            threshold_b = Decimal(request.query_params.get('threshold_b') or '95')
        except Exception:
            threshold_a, threshold_b = Decimal('80'), Decimal('95')

        category_id = request.query_params.get('category')
        brand_id = request.query_params.get('brand')

        line_factor = Value(Decimal('1')) - F('discount_percent') / Value(Decimal('100'))
        net_expr = ExpressionWrapper(F('quantity') * F('price') * line_factor, output_field=DEC)
        gross_expr = ExpressionWrapper(F('quantity') * F('price'), output_field=DEC)

        qs = DocumentItem.objects.filter(
            document__status='posted',
            document__document_type__in=[Document.Type.OUT, Document.Type.RETURN_OUT],
            document__date__gte=date_from,
            document__date__lte=date_to,
            document__warehouse_id__in=wh_set,
        )
        if category_id:
            qs = qs.filter(product__category_id=category_id)
        if brand_id:
            qs = qs.filter(product__brand_id=brand_id)

        grouped = (
            qs.values('product_id', 'product__name', 'product__sku')
            .annotate(
                revenue=Sum(Case(
                    When(document__document_type=Document.Type.OUT, then=net_expr),
                    When(document__document_type=Document.Type.RETURN_OUT, then=-gross_expr),
                    default=0, output_field=DEC,
                )),
                quantity=Sum(Case(
                    When(document__document_type=Document.Type.OUT, then=F('quantity')),
                    When(document__document_type=Document.Type.RETURN_OUT, then=-F('quantity')),
                    default=0, output_field=DEC,
                )),
            )
            .order_by('-revenue')
        )
        rows = [r for r in grouped if (r['revenue'] or Decimal('0')) > 0]

        total_revenue = sum((r['revenue'] for r in rows), Decimal('0'))

        items = []
        cumulative = Decimal('0')
        class_counts = {'A': 0, 'B': 0, 'C': 0}
        class_revenue = {'A': Decimal('0'), 'B': Decimal('0'), 'C': Decimal('0')}
        for i, r in enumerate(rows):
            revenue = r['revenue'] or Decimal('0')
            cumulative += revenue
            share_pct = (revenue / total_revenue * 100) if total_revenue else Decimal('0')
            cumulative_pct = (cumulative / total_revenue * 100) if total_revenue else Decimal('0')
            cls = 'A' if cumulative_pct <= threshold_a else ('B' if cumulative_pct <= threshold_b else 'C')
            class_counts[cls] += 1
            class_revenue[cls] += revenue
            items.append({
                'rank': i + 1,
                'product_id': r['product_id'],
                'product_name': r['product__name'],
                'product_sku': r['product__sku'],
                'revenue': revenue,
                'quantity': r['quantity'] or Decimal('0'),
                'share_pct': share_pct,
                'cumulative_pct': cumulative_pct,
                'class': cls,
            })

        total_count = len(items)
        summary = [
            {
                'class': cls,
                'count': class_counts[cls],
                'count_pct': (Decimal(class_counts[cls]) / total_count * 100) if total_count else Decimal('0'),
                'revenue': class_revenue[cls],
                'revenue_pct': (class_revenue[cls] / total_revenue * 100) if total_revenue else Decimal('0'),
            }
            for cls in ('A', 'B', 'C')
        ]

        return Response({
            'items': items,
            'total_revenue': total_revenue,
            'total_count': total_count,
            'summary': summary,
            'threshold_a': threshold_a,
            'threshold_b': threshold_b,
        })

    @action(detail=False, methods=['get'], url_path='xyz-analysis')
    def xyz_analysis(self, request):
        """
        XYZ-анализ — классификация товаров по стабильности (предсказуемости) спроса.
        Период разбивается на месяцы; для каждого товара считается количество
        проданных единиц по каждому месяцу (месяцы БЕЗ продаж считаются нулём —
        иначе коэффициент вариации занижался бы для товаров, продающихся не
        каждый месяц), затем коэффициент вариации CV = σ/μ×100% (population
        stdev — вся история месяцев в периоде, не выборка). Класс X — стабильный
        спрос (CV ≤ threshold_x, по умолчанию 10%), Y — колеблющийся (≤
        threshold_y, по умолчанию 25%), Z — нерегулярный/трудно прогнозируемый
        спрос (остальное). Знак количества — та же методика (OUT минус
        RETURN_OUT), что и в abc_analysis.
        """
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        if not date_from or not date_to:
            return Response({'detail': 'Укажите date_from и date_to'}, status=400)

        wh_set = _resolve_warehouse_ids(request)
        if not wh_set:
            return Response({'items': [], 'total_quantity': '0', 'total_count': 0, 'summary': [], 'periods_count': 0})

        try:
            threshold_x = Decimal(request.query_params.get('threshold_x') or '10')
            threshold_y = Decimal(request.query_params.get('threshold_y') or '25')
        except Exception:
            threshold_x, threshold_y = Decimal('10'), Decimal('25')

        category_id = request.query_params.get('category')
        brand_id = request.query_params.get('brand')

        try:
            date_from_obj = datetime.strptime(date_from, '%Y-%m-%d').date()
            date_to_obj = datetime.strptime(date_to, '%Y-%m-%d').date()
        except ValueError:
            return Response({'detail': 'Некорректный формат даты, ожидается YYYY-MM-DD'}, status=400)

        months = []
        cursor = date_from_obj.replace(day=1)
        end_marker = date_to_obj.replace(day=1)
        while cursor <= end_marker:
            months.append(cursor)
            cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)

        qs = DocumentItem.objects.filter(
            document__status='posted',
            document__document_type__in=[Document.Type.OUT, Document.Type.RETURN_OUT],
            document__date__gte=date_from,
            document__date__lte=date_to,
            document__warehouse_id__in=wh_set,
        )
        if category_id:
            qs = qs.filter(product__category_id=category_id)
        if brand_id:
            qs = qs.filter(product__brand_id=brand_id)

        rows = (
            qs.annotate(bucket=TruncMonth('document__date'))
            .values('product_id', 'product__name', 'product__sku', 'bucket')
            .annotate(
                quantity=Sum(Case(
                    When(document__document_type=Document.Type.OUT, then=F('quantity')),
                    When(document__document_type=Document.Type.RETURN_OUT, then=-F('quantity')),
                    default=0, output_field=DEC,
                )),
            )
        )

        products = {}
        for r in rows:
            pid = r['product_id']
            info = products.setdefault(pid, {
                'product_name': r['product__name'],
                'product_sku': r['product__sku'],
                'by_month': {},
            })
            bucket = r['bucket']
            bucket = bucket.date() if hasattr(bucket, 'date') else bucket
            info['by_month'][bucket] = float(r['quantity'] or 0)

        items = []
        class_counts = {'X': 0, 'Y': 0, 'Z': 0}
        class_quantity = {'X': Decimal('0'), 'Y': Decimal('0'), 'Z': Decimal('0')}
        total_quantity = Decimal('0')
        for pid, info in products.items():
            series = [info['by_month'].get(m, 0.0) for m in months]
            total_qty = sum(series)
            if total_qty <= 0:
                continue
            mean = statistics.mean(series)
            std = statistics.pstdev(series) if len(series) > 1 else 0.0
            cv = Decimal(str(round((std / mean * 100) if mean else 0, 2)))
            cls = 'X' if cv <= threshold_x else ('Y' if cv <= threshold_y else 'Z')
            class_counts[cls] += 1
            qty_dec = Decimal(str(round(total_qty, 4)))
            class_quantity[cls] += qty_dec
            total_quantity += qty_dec
            items.append({
                'product_id': pid,
                'product_name': info['product_name'],
                'product_sku': info['product_sku'],
                'total_quantity': qty_dec,
                'avg_quantity': Decimal(str(round(mean, 2))),
                'cv': cv,
                'class': cls,
            })

        items.sort(key=lambda x: x['cv'])
        for i, it in enumerate(items):
            it['rank'] = i + 1

        total_count = len(items)
        summary = [
            {
                'class': cls,
                'count': class_counts[cls],
                'count_pct': (Decimal(class_counts[cls]) / total_count * 100) if total_count else Decimal('0'),
                'quantity': class_quantity[cls],
                'quantity_pct': (class_quantity[cls] / total_quantity * 100) if total_quantity else Decimal('0'),
            }
            for cls in ('X', 'Y', 'Z')
        ]

        return Response({
            'items': items,
            'total_quantity': total_quantity,
            'total_count': total_count,
            'summary': summary,
            'threshold_x': threshold_x,
            'threshold_y': threshold_y,
            'periods_count': len(months),
        })

    @action(detail=False, methods=['get'], url_path='margin-analysis')
    def margin_analysis(self, request):
        """
        Анализ маржинальности/рентабельности — по каждому товару: выручка (та же
        методика net/gross, что и в abc_analysis/top_products), себестоимость =
        проданное количество × ТЕКУЩАЯ Product.cost_price (тот же принцип, что и
        "Остаток" в ProductCardPage.tsx/ProductTurnoverPage.tsx — себестоимость
        всегда по актуальной цене, не по исторической цене прихода), прибыль =
        выручка - себестоимость, маржа% = прибыль/выручка, наценка% = прибыль/
        себестоимость. Товары делятся на полосы (band) по марже: "убыточные"
        (прибыль < 0), "низкая маржа" (0 ≤ маржа% < low_margin_threshold,
        по умолчанию 15%), "нормальная" (остальное) — порог настраивается.
        """
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        if not date_from or not date_to:
            return Response({'detail': 'Укажите date_from и date_to'}, status=400)

        wh_set = _resolve_warehouse_ids(request)
        if not wh_set:
            return Response({'items': [], 'total_revenue': '0', 'total_cost': '0', 'total_profit': '0', 'total_margin_pct': '0', 'band_summary': [], 'total_count': 0})

        try:
            low_margin_threshold = Decimal(request.query_params.get('low_margin_threshold') or '15')
        except Exception:
            low_margin_threshold = Decimal('15')

        category_id = request.query_params.get('category')
        brand_id = request.query_params.get('brand')

        line_factor = Value(Decimal('1')) - F('discount_percent') / Value(Decimal('100'))
        net_expr = ExpressionWrapper(F('quantity') * F('price') * line_factor, output_field=DEC)
        gross_expr = ExpressionWrapper(F('quantity') * F('price'), output_field=DEC)

        qs = DocumentItem.objects.filter(
            document__status='posted',
            document__document_type__in=[Document.Type.OUT, Document.Type.RETURN_OUT],
            document__date__gte=date_from,
            document__date__lte=date_to,
            document__warehouse_id__in=wh_set,
        )
        if category_id:
            qs = qs.filter(product__category_id=category_id)
        if brand_id:
            qs = qs.filter(product__brand_id=brand_id)

        grouped = (
            qs.values('product_id', 'product__name', 'product__sku', 'product__cost_price')
            .annotate(
                revenue=Sum(Case(
                    When(document__document_type=Document.Type.OUT, then=net_expr),
                    When(document__document_type=Document.Type.RETURN_OUT, then=-gross_expr),
                    default=0, output_field=DEC,
                )),
                quantity=Sum(Case(
                    When(document__document_type=Document.Type.OUT, then=F('quantity')),
                    When(document__document_type=Document.Type.RETURN_OUT, then=-F('quantity')),
                    default=0, output_field=DEC,
                )),
            )
            .order_by('-revenue')
        )

        items = []
        total_revenue = Decimal('0')
        total_cost = Decimal('0')
        total_profit = Decimal('0')
        band_counts = {'negative': 0, 'low': 0, 'normal': 0}
        band_revenue = {'negative': Decimal('0'), 'low': Decimal('0'), 'normal': Decimal('0')}
        band_profit = {'negative': Decimal('0'), 'low': Decimal('0'), 'normal': Decimal('0')}

        for r in grouped:
            revenue = r['revenue'] or Decimal('0')
            quantity = r['quantity'] or Decimal('0')
            if revenue == 0 and quantity == 0:
                continue
            cost_price = r['product__cost_price'] or Decimal('0')
            cost = quantity * cost_price
            profit = revenue - cost
            margin_pct = (profit / revenue * 100) if revenue else Decimal('0')
            markup_pct = (profit / cost * 100) if cost else Decimal('0')

            if profit < 0:
                band = 'negative'
            elif margin_pct < low_margin_threshold:
                band = 'low'
            else:
                band = 'normal'

            band_counts[band] += 1
            band_revenue[band] += revenue
            band_profit[band] += profit
            total_revenue += revenue
            total_cost += cost
            total_profit += profit

            items.append({
                'product_id': r['product_id'],
                'product_name': r['product__name'],
                'product_sku': r['product__sku'],
                'quantity': quantity,
                'revenue': revenue,
                'cost': cost,
                'profit': profit,
                'margin_pct': margin_pct,
                'markup_pct': markup_pct,
                'band': band,
            })

        items.sort(key=lambda x: x['profit'], reverse=True)
        for i, it in enumerate(items):
            it['rank'] = i + 1

        total_count = len(items)
        total_margin_pct = (total_profit / total_revenue * 100) if total_revenue else Decimal('0')
        band_summary = [
            {
                'band': band,
                'count': band_counts[band],
                'count_pct': (Decimal(band_counts[band]) / total_count * 100) if total_count else Decimal('0'),
                'revenue': band_revenue[band],
                'profit': band_profit[band],
            }
            for band in ('negative', 'low', 'normal')
        ]

        return Response({
            'items': items,
            'total_revenue': total_revenue,
            'total_cost': total_cost,
            'total_profit': total_profit,
            'total_margin_pct': total_margin_pct,
            'total_count': total_count,
            'band_summary': band_summary,
            'low_margin_threshold': low_margin_threshold,
        })

    @action(detail=False, methods=['get'], url_path='category-analysis')
    def category_analysis(self, request):
        """
        Анализ по категориям/номенклатуре — та же выручка/себестоимость/прибыль,
        что и в margin_analysis, но свёрнутая по категории или бренду товара
        (group_by), а не по отдельному товару. ✅ Группировка ПЛОСКАЯ, по прямой
        (не корневой) категории товара — тот же принцип, что и в существующей
        группировке ProductTurnoverPage.tsx (frontend/.../productTurnoverGrouping.ts::
        groupByCategory) — здесь она же перенесена на бэкенд для отдельного отчёта
        с суммами по выручке/марже, а не по остаткам/оборотам склада. Товары без
        категории/бренда попадают в отдельную группу "Без категории"/"Без бренда".
        """
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        if not date_from or not date_to:
            return Response({'detail': 'Укажите date_from и date_to'}, status=400)

        group_by = request.query_params.get('group_by', 'category')
        if group_by not in ('category', 'brand'):
            group_by = 'category'

        wh_set = _resolve_warehouse_ids(request)
        if not wh_set:
            return Response({
                'items': [], 'total_revenue': '0', 'total_quantity': '0', 'total_cost': '0', 'total_profit': '0',
                'total_count': 0, 'group_by': group_by,
            })

        line_factor = Value(Decimal('1')) - F('discount_percent') / Value(Decimal('100'))
        net_expr = ExpressionWrapper(F('quantity') * F('price') * line_factor, output_field=DEC)
        gross_expr = ExpressionWrapper(F('quantity') * F('price'), output_field=DEC)

        qs = DocumentItem.objects.filter(
            document__status='posted',
            document__document_type__in=[Document.Type.OUT, Document.Type.RETURN_OUT],
            document__date__gte=date_from,
            document__date__lte=date_to,
            document__warehouse_id__in=wh_set,
        )

        group_id_field = f'product__{group_by}_id'
        group_name_field = f'product__{group_by}__name'

        # ✅ Алиас аннотации НЕ должен совпадать с именем реального поля модели
        # ('quantity') — Django резолвит .annotate() по порядку аргументов и, встретив
        # такой алиас, начинает подставлять его вместо поля во ВСЕХ последующих
        # выражениях той же цепочки .annotate(), которые тоже пишут F('quantity');
        # 'cost' ниже как раз такое — F('quantity') в нём резолвился бы уже в SUM(...)
        # (сам являющийся агрегатом) → "Cannot compute Sum(...): ... is an aggregate".
        # Поэтому считаем количество под именем qty_sum и переименовываем в 'quantity'
        # только в Python-словаре ответа, а не через сам алиас аннотации.
        grouped = (
            qs.values(group_id_field, group_name_field)
            .annotate(
                revenue=Sum(Case(
                    When(document__document_type=Document.Type.OUT, then=net_expr),
                    When(document__document_type=Document.Type.RETURN_OUT, then=-gross_expr),
                    default=0, output_field=DEC,
                )),
                qty_sum=Sum(Case(
                    When(document__document_type=Document.Type.OUT, then=F('quantity')),
                    When(document__document_type=Document.Type.RETURN_OUT, then=-F('quantity')),
                    default=0, output_field=DEC,
                )),
                # ✅ Себестоимость реализованного количества — по ТЕКУЩЕЙ цене каждого
                # товара (тот же принцип, что и margin_analysis), суммируется через
                # qty × cost_price на уровне строки документа, не через средний cost_price
                # группы (у товаров одной категории себестоимость обычно разная).
                cost=Sum(Case(
                    When(document__document_type=Document.Type.OUT, then=ExpressionWrapper(F('quantity') * F('product__cost_price'), output_field=DEC)),
                    When(document__document_type=Document.Type.RETURN_OUT, then=ExpressionWrapper(-F('quantity') * F('product__cost_price'), output_field=DEC)),
                    default=0, output_field=DEC,
                )),
                products_count=Count('product_id', distinct=True),
            )
            .order_by('-revenue')
        )

        items = []
        total_revenue = Decimal('0')
        total_quantity = Decimal('0')
        total_cost = Decimal('0')
        total_profit = Decimal('0')

        no_name = 'NoCategory' if group_by == 'category' else 'NoBrand'
        for r in grouped:
            revenue = r['revenue'] or Decimal('0')
            quantity = r['qty_sum'] or Decimal('0')
            if revenue == 0 and quantity == 0:
                continue
            cost = r['cost'] or Decimal('0')
            profit = revenue - cost
            margin_pct = (profit / revenue * 100) if revenue else Decimal('0')

            total_revenue += revenue
            total_quantity += quantity
            total_cost += cost
            total_profit += profit

            items.append({
                'group_id': r[group_id_field],
                'group_name': r[group_name_field] or None,
                'no_name_key': no_name if r[group_id_field] is None else None,
                'quantity': quantity,
                'revenue': revenue,
                'cost': cost,
                'profit': profit,
                'margin_pct': margin_pct,
                'products_count': r['products_count'],
            })

        for it in items:
            it['revenue_pct'] = (it['revenue'] / total_revenue * 100) if total_revenue else Decimal('0')

        items.sort(key=lambda x: x['revenue'], reverse=True)
        for i, it in enumerate(items):
            it['rank'] = i + 1

        return Response({
            'items': items,
            'total_revenue': total_revenue,
            'total_quantity': total_quantity,
            'total_cost': total_cost,
            'total_profit': total_profit,
            'total_count': len(items),
            'group_by': group_by,
        })
