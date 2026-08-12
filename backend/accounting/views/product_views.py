# backend/accounting/views/product_views.py
from rest_framework import viewsets, status, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from accounting.mixins import AuditMixin, BulkDestroyMixin
# from django.db.models import F
from django.db import models
from decimal import Decimal
from accounting.utils import resolve_product_price, resolve_price_scope_quantity, record_price_change, log_audit
from accounting.models.audit import AuditLog

from ..models import (
    Unit, Brand, Tag, ProductCategory,
    Product, ProductImage, PriceType, ProductPrice,
    Counterparty, Warehouse, WarehouseStock, ProductBundle, VolumeDiscount,
    QuantityPromotion, DocumentItem
)
from ..serializers.product_serializers import (
    UnitSerializer, BrandSerializer, TagSerializer, ProductCategorySerializer,
    ProductSerializer, ProductListSerializer, ProductDocumentSerializer,
    ProductImageSerializer, ProductImageUploadSerializer,
    PriceTypeSerializer, ProductPriceSerializer,
    CounterpartySerializer, WarehouseSerializer, WarehouseStockSerializer, ProductBundleSerializer,
    VolumeDiscountSerializer, QuantityPromotionSerializer
)
from users.permissions import _rbac
from users.scoping import apply_agent_scope
from rest_framework.permissions import IsAuthenticated



class UnitViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
    queryset = Unit.objects.all()
    serializer_class = UnitSerializer

    def get_permissions(self):
        return _rbac(self.action, "unit")


class BrandViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
    queryset = Brand.objects.order_by("name")
    serializer_class = BrandSerializer

    def get_permissions(self):
        return _rbac(self.action, "brand")


class TagViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
    queryset = Tag.objects.order_by("name")
    serializer_class = TagSerializer

    def get_permissions(self):
        return _rbac(self.action, "tag")


class ProductCategoryViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
    queryset = ProductCategory.objects.order_by("name")
    serializer_class = ProductCategorySerializer

    def get_permissions(self):
        return _rbac(self.action, "productcategory")


class ProductViewSet(AuditMixin, BulkDestroyMixin, viewsets.ModelViewSet):
    pagination_class = None
    serializer_class = ProductSerializer

    def get_queryset(self):
        qs = (
            Product.objects
            .select_related("category", "brand", "unit")
            .prefetch_related(
                # ✅ prices__branch/volume_discounts__price_type/quantity_promotions__price_type
                # раньше не были префетчены, хотя ProductPriceSerializer.branch_name,
                # VolumeDiscountSerializer.price_type_name и QuantityPromotionSerializer.
                # price_type_name читают именно эти поля — это был N+1 (отдельный SQL-запрос
                # на КАЖДУЮ строку цены/скидки/акции у КАЖДОГО товара), из-за чего GET
                # /products/ на большом каталоге фактически "зависал" (DocumentFormPage.tsx
                # ждал этот запрос для SearchableSelect товара — казалось, что товары вообще
                # не появляются).
                "tags", "images", "prices__price_type", "prices__warehouse", "prices__branch",
                "bundle_items__bundle_product__unit", "bundle_items__bundle_product__images",
                "volume_discounts__price_type", "quantity_promotions__price_type", "allowed_warehouses",
            )
            .order_by("name")
        )
        qs = self._filter_by_warehouse_or_branch(qs)
        return qs

    # ✅ Общая для list/list_light матрица "товар × склад" (Product.
    # allowed_warehouses) — опт-аут: товар без привязок виден на любом складе/
    # филиале, иначе только там, куда явно привязан. ?warehouse= имеет
    # приоритет над ?branch=, как и везде в проекте (см. _resolve_warehouse_ids
    # в report_views.py).
    def _filter_by_warehouse_or_branch(self, qs):
        warehouse_id = self.request.query_params.get("warehouse")
        branch_id = self.request.query_params.get("branch")
        if warehouse_id:
            return qs.filter(models.Q(allowed_warehouses__isnull=True) | models.Q(allowed_warehouses__id=warehouse_id)).distinct()
        elif branch_id:
            return qs.filter(models.Q(allowed_warehouses__isnull=True) | models.Q(allowed_warehouses__branch_id=branch_id)).distinct()
        return qs

    def get_permissions(self):
        return _rbac(self.action, "product")

    # ✅ Облегчённый список специально для ProductsListPage.tsx — GET /products/
    # (стандартный list) отдаёт полный ProductSerializer и используется ещё и
    # DocumentFormPage.tsx/BundlesTab.tsx/WarehouseStocksPage.tsx (например,
    # DocumentFormPage.tsx читает prod.prices прямо из этого списка для
    # автоподстановки цены в строке документа) — сужать его нельзя, не сломав
    # эти страницы. Поэтому для тяжёлой карточки в ProductsListPage.tsx заведён
    # отдельный эндпоинт с ProductListSerializer (только то, что список реально
    # показывает — фото/категория/бренд/ед.изм./себестоимость/статус; цены,
    # остатки и оборотность список и так получает отдельными bulk-эндпоинтами).
    @action(detail=False, methods=["get"], url_path="list-light")
    def list_light(self, request):
        qs = (
            Product.objects
            .select_related("category", "brand", "unit")
            .order_by("name")
        )
        qs = self._filter_by_warehouse_or_branch(qs)
        serializer = ProductListSerializer(qs, many=True, context={"request": request})
        return Response(serializer.data)

    # ✅ Фото отдельно от list_light (см. докстринг ProductListSerializer) — bulk
    # {product_id: {main_image, images}}, чтобы ProductsListPage.tsx могла
    # отрисовать текст сразу, не дожидаясь синхронной генерации всех превью
    # (django-imagekit), а фото дорисовать по готовности со своим спиннером.
    @action(detail=False, methods=["get"], url_path="list-light-images")
    def list_light_images(self, request):
        qs = Product.objects.prefetch_related("images")
        qs = self._filter_by_warehouse_or_branch(qs)
        result = {}
        for product in qs:
            images = list(product.images.all())
            if not images:
                continue
            main = next((img for img in images if img.is_main), images[0])
            result[product.id] = {
                "main_image": ProductImageSerializer(main, context={"request": request}).data,
                "images": ProductImageSerializer(images, many=True, context={"request": request}).data,
            }
        return Response(result)

    # ✅ Специально для DocumentFormPage.tsx/ProductRow.tsx — раньше эта форма
    # использовала обычный getAll() (полный ProductSerializer: tags/category/
    # allowed_warehouses/description/extra_data/вся галерея images на КАЖДЫЙ
    # товар), потому что ей нужны prices/bundle_items/volume_discounts/
    # quantity_promotions, которых нет в list-light. На каталоге в тысячи
    # товаров (см. polisem) это и было причиной долгой загрузки SearchableSelect
    # выбора товара — ProductDocumentSerializer отдаёт ровно то подмножество
    # полей, см. его докстринг.
    @action(detail=False, methods=["get"], url_path="list-for-document")
    def list_for_document(self, request):
        qs = (
            Product.objects
            .select_related("unit")
            .prefetch_related(
                "images",
                "bundle_items__bundle_product__unit", "bundle_items__bundle_product__images",
                "volume_discounts__price_type", "quantity_promotions__price_type",
            )
            .order_by("name")
        )
        qs = self._filter_by_warehouse_or_branch(qs)

        # ⚠️ БАГ найден 2026-08-09: раньше "prices" был обычным prefetch_related
        # ("prices" — reverse FK product.prices.all()) и отдавал ВСЕ ProductPrice
        # товара, СО ВСЕХ складов вперемешку, без разбора. DocumentFormPage.tsx
        # берёт нужную цену через prod.prices.find(p => p.price_type === X) —
        # без фильтра по складу это могло подставить цену СОВСЕМ ДРУГОГО склада
        # (напр. Optom с warehouse=14 вместо Optom с текущим warehouse=6) —
        # молча, без ошибки, просто неверная цена в новой накладной.
        # Резолвим здесь сами, ОДНИМ bulk-запросом на весь каталог (не по
        # товару — иначе N+1 на тысячах товаров), по той же приоритетности,
        # что и accounting/utils.py::resolve_product_price (склад -> филиал
        # склада -> глобальная), и отдаём во ProductDocumentSerializer уже
        # готовый {product_id: [{price_type, price}]} через контекст —
        # см. get_prices() в ProductDocumentSerializer.
        warehouse_id = request.query_params.get("warehouse")
        branch_id = request.query_params.get("branch")
        if warehouse_id and not branch_id:
            branch_id = Warehouse.objects.filter(pk=warehouse_id).values_list("branch_id", flat=True).first()

        price_scope = models.Q(warehouse__isnull=True, branch__isnull=True)
        if branch_id:
            price_scope |= models.Q(warehouse__isnull=True, branch_id=branch_id)
        if warehouse_id:
            price_scope |= models.Q(warehouse_id=warehouse_id)

        best = {}  # (product_id, price_type_id) -> (priority, price)
        rows = (
            ProductPrice.objects.filter(is_active=True).filter(price_scope)
            .values("product_id", "price_type_id", "price", "warehouse_id", "branch_id")
        )
        for row in rows:
            if warehouse_id and row["warehouse_id"] is not None and str(row["warehouse_id"]) == str(warehouse_id):
                priority = 0
            elif row["warehouse_id"] is None and branch_id and row["branch_id"] is not None and str(row["branch_id"]) == str(branch_id):
                priority = 1
            elif row["warehouse_id"] is None and row["branch_id"] is None:
                priority = 2
            else:
                continue
            key = (row["product_id"], row["price_type_id"])
            if key not in best or priority < best[key][0]:
                best[key] = (priority, row["price"])

        price_map = {}
        for (product_id, price_type_id), (_, price) in best.items():
            price_map.setdefault(product_id, []).append({"price_type": price_type_id, "price": price})

        serializer = ProductDocumentSerializer(qs, many=True, context={"request": request, "price_map": price_map})
        return Response(serializer.data)

    def perform_update(self, serializer):
        # ✅ allowed_warehouses — ManyToMany, AuditMixin._snapshot() его не видит
        # (перебирает только instance._meta.concrete_fields) — пишем диф вручную,
        # иначе смена ассортиментной матрицы товара вообще не попадёт в AuditLog.
        old_warehouses = set(serializer.instance.allowed_warehouses.values_list("id", flat=True))
        super().perform_update(serializer)
        new_warehouses = set(serializer.instance.allowed_warehouses.values_list("id", flat=True))
        if old_warehouses != new_warehouses:
            from django.contrib.contenttypes.models import ContentType
            from ..models import AuditLog
            names = lambda ids: ", ".join(Warehouse.objects.filter(id__in=ids).order_by("name").values_list("name", flat=True)) or "—"
            AuditLog.objects.create(
                content_type=ContentType.objects.get_for_model(Product),
                object_id=serializer.instance.pk,
                object_repr=str(serializer.instance)[:255],
                action=AuditLog.Action.UPDATE,
                user=self.request.user if self.request.user.is_authenticated else None,
                changed_data={"allowed_warehouses": {"before": names(old_warehouses), "after": names(new_warehouses)}},
            )

    @action(detail=False, methods=["get"], url_path="stocks-map")
    def stocks_map(self, request):
        """
        GET /accounting/products/stocks-map/?warehouse=<id>
        Возвращает dict: { product_id: { quantity, reserved, available } }
        Один запрос вместо N. Используется в форме документа (ProductRow.tsx /
        useWarehouseStocks.ts) для бейджа "Остаток/В резерве/Доступно" в
        SearchableSelect выбора товара.

        ⚠️ reserved считается ТАК ЖЕ, как в report_views.py::stock_balance
        (ProductsListPage) — живым запросом по черновикам расходных накладных
        (Document.status='draft', document_type='out'), а НЕ через
        WarehouseStock.reserved_quantity (то поле нигде в коде не пишется,
        всегда 0 — раньше бейдж резерва тут всегда показывал 0, хотя
        ProductsListPage для того же товара/склада честно показывал резерв).
        Держать эти два места в одной логике обязательно — иначе "Остаток"
        на экране списка товаров и на экране накладной для одного и того же
        товара расходятся (см. CLAUDE.md: экран/печать/отчёты не должны
        расходиться по одной и той же величине).
        """
        warehouse_id = request.query_params.get("warehouse")
        if not warehouse_id:
            return Response(
                {"detail": "warehouse query param required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        stock_rows = (
            WarehouseStock.objects
            .filter(warehouse_id=warehouse_id)
            .values("product_id", "quantity")
        )
        reserved_rows = (
            DocumentItem.objects
            .filter(
                document__status="draft",
                document__document_type="out",
                document__warehouse_id=warehouse_id,
            )
            .values("product_id")
            .annotate(qty=models.Sum("quantity"))
        )
        reserved_map = {r["product_id"]: (r["qty"] or Decimal("0")) for r in reserved_rows}

        result = {}
        for s in stock_rows:
            pid = s["product_id"]
            qty = s["quantity"]
            reserved = reserved_map.get(pid, Decimal("0"))
            result[pid] = {
                "quantity": float(qty),
                "reserved": float(reserved),
                "available": float(qty - reserved),
            }
        # ✅ Товар может быть под резервом (черновик "Расход") без строки
        # WarehouseStock вообще (остаток 0) — не пропускаем такие товары, иначе
        # бейдж вообще не появится там, где по ProductsListPage резерв есть.
        for pid, reserved in reserved_map.items():
            if pid not in result:
                result[pid] = {"quantity": 0.0, "reserved": float(reserved), "available": float(-reserved)}

        return Response(result)
    

    


class ProductImageViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
    """
    GET    /product-images/?product=<id>  — список изображений товара
    POST   /product-images/               — загрузка (multipart)
    PATCH  /product-images/<id>/          — обновить is_main / sort_order
    DELETE /product-images/<id>/          — удалить
    POST   /product-images/<id>/set_main/ — сделать главным
    """
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        qs = ProductImage.objects.select_related("product")
        product_id = self.request.query_params.get("product")
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs.order_by("sort_order", "id")

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ProductImageUploadSerializer
        return ProductImageSerializer

    def get_permissions(self):
        return _rbac(self.action, "productimage")

    # ✅ django-imagekit's ImageSpecField (thumbnail) по умолчанию ленивая
    # (JustInTime) — генерируется СИНХРОННО при первом обращении к .url, а не
    # при загрузке файла. Отчёты, читающие thumbnail_url массово по всему
    # каталогу (product_turnover::_main_image, list_light_images) — раньше
    # этим и тормозили: первый же реальный запрос отчёта после рестарта/
    # переноса данных генерировал сотни/тысячи превью синхронно, в рамках
    # ОДНОГО HTTP-запроса. Генерируем сразу при загрузке/замене фото (один раз,
    # на действие админа, а не на каждое чтение отчёта любым пользователем) —
    # generate() идемпотентен (force=False по умолчанию, не перегенерирует, если
    # уже закэшировано).
    def perform_create(self, serializer):
        super().perform_create(serializer)
        serializer.instance.thumbnail.generate()

    def perform_update(self, serializer):
        super().perform_update(serializer)
        serializer.instance.thumbnail.generate()

    @action(detail=True, methods=["post"], url_path="set_main")
    def set_main(self, request, pk=None):
        image = self.get_object()
        image.is_main = True
        image.save(update_fields=["is_main"])
        return Response(ProductImageSerializer(image, context={"request": request}).data)


class PriceTypeViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
    queryset = PriceType.objects.order_by("name")
    serializer_class = PriceTypeSerializer

    def get_permissions(self):
        return _rbac(self.action, "pricetype")




class ProductPriceViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
    serializer_class = ProductPriceSerializer

    def get_queryset(self):
        qs = (
            ProductPrice.objects
            .select_related("product", "warehouse", "warehouse__branch", "branch", "price_type")
            .order_by("product__name", "price_type__name")
        )
        product_id = self.request.query_params.get("product")
        warehouse_id = self.request.query_params.get("warehouse")
        branch_id = self.request.query_params.get("branch")
        price_type_id = self.request.query_params.get("price_type")

        if product_id:
            qs = qs.filter(product_id=product_id)
        if warehouse_id:
            qs = qs.filter(warehouse_id=warehouse_id)
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        if price_type_id:
            qs = qs.filter(price_type_id=price_type_id)
        return qs

    def get_permissions(self):
        return _rbac(self.action, "productprice")
    
    def _is_global_price(self, instance):
        return instance.warehouse_id is None and instance.branch_id is None

    def perform_update(self, serializer):
        instance = self.get_object()
        if self._is_global_price(instance) and not self.request.user.is_superuser:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Изменять глобальную цену может только администратор.")

        old_price = instance.price
        updated = serializer.save()

        # ✅ perform_update переопределён БЕЗ вызова AuditMixin — раньше изменение
        # цены вообще не попадало в AuditLog (см. CLAUDE.md: RBAC/Scope/Audit
        # обязательны для любого мутирующего действия). Заодно фиксируем в
        # PriceChangeHistory (отчёт "История изменения цен") — та же точка, что и
        # для себестоимости в Document._update_product_cost_prices.
        if old_price != updated.price:
            log_audit(
                self.request, updated, AuditLog.Action.UPDATE,
                changed_data={'price': {'before': str(old_price), 'after': str(updated.price)}},
            )
            quantity, resolved_branch_id = resolve_price_scope_quantity(
                product_id=updated.product_id,
                warehouse_id=updated.warehouse_id,
                branch_id=updated.branch_id,
            )
            record_price_change(
                product_id=updated.product_id,
                price_type_id=updated.price_type_id,
                product_price=updated,
                warehouse_id=updated.warehouse_id,
                branch_id=resolved_branch_id,
                old_price=old_price,
                new_price=updated.price,
                quantity=quantity,
                user=self.request.user,
            )

    def perform_destroy(self, instance):
        if self._is_global_price(instance) and not self.request.user.is_superuser:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Удалять глобальную цену может только администратор.")
        instance.delete()

    @action(detail=False, methods=["get"], url_path="resolve")
    def resolve(self, request):
        """
        GET /accounting/product-prices/resolve/?product=<id>&warehouse=<id>&price_type=<id>
        """
        product_id = request.query_params.get("product")
        warehouse_id = request.query_params.get("warehouse")
        price_type_id = request.query_params.get("price_type")

        if not all([product_id, warehouse_id, price_type_id]):
            return Response(
                {"detail": "product, warehouse, price_type обязательны"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        price = resolve_product_price(product_id, warehouse_id, price_type_id)
        if not price:
            return Response(None)
        return Response(ProductPriceSerializer(price).data)

    @action(detail=False, methods=["get"], url_path="affected-count")
    def affected_count(self, request):
        """
        GET /accounting/product-prices/affected-count/?scope=global
        GET /accounting/product-prices/affected-count/?scope=branch&branch=<id>
        Возвращает количество активных складов, которые затронет global/branch цена.
        """
        scope = request.query_params.get("scope")
        if scope == "global":
            count = Warehouse.objects.filter(is_active=True).count()
        elif scope == "branch":
            branch_id = request.query_params.get("branch")
            count = Warehouse.objects.filter(is_active=True, branch_id=branch_id).count()
        else:
            return Response({"detail": "scope обязателен (global|branch)"}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"affected_warehouses": count})
    
    @action(detail=False, methods=["get"], url_path="prices-map")
    def prices_map(self, request):
        """
        GET /accounting/product-prices/prices-map/?warehouse=<id>
        GET /accounting/product-prices/prices-map/?branch=<id>
        Возвращает: { product_id: { price_type_id: price } }
        Приоритет: точный scope -> global fallback.
        """
        warehouse_id = request.query_params.get("warehouse")
        branch_id = request.query_params.get("branch")

        if not warehouse_id and not branch_id:
            return Response({})

        base_qs = ProductPrice.objects.filter(is_active=True)

        # 1. Сначала кладём global-цены (как базовый слой)
        global_qs = base_qs.filter(warehouse__isnull=True, branch__isnull=True)
        result: dict = {}
        for row in global_qs.values("product_id", "price_type_id", "price"):
            result.setdefault(row["product_id"], {})[row["price_type_id"]] = float(row["price"])

        # 2. Затем перетираем точным scope (warehouse имеет приоритет над branch)
        if warehouse_id:
            scoped_qs = base_qs.filter(warehouse_id=warehouse_id)
        else:
            scoped_qs = base_qs.filter(warehouse__isnull=True, branch_id=branch_id)

        for row in scoped_qs.values("product_id", "price_type_id", "price"):
            result.setdefault(row["product_id"], {})[row["price_type_id"]] = float(row["price"])

        return Response(result)


class CounterpartyViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
    queryset = Counterparty.objects.order_by("name")
    serializer_class = CounterpartySerializer

    def get_permissions(self):
        return _rbac(self.action, "counterparty")

    def get_queryset(self):
        ctype = self.request.query_params.get("type")
        if ctype == "client":
            qs = Counterparty.objects.clients().order_by("name")
        elif ctype == "supplier":
            qs = Counterparty.objects.suppliers().order_by("name")
        else:
            qs = Counterparty.objects.order_by("name")
        # ✅ CounterpartySerializer.agent_detail (AgentShortSerializer) читает
        # agent.employee_name (agent.employee.full_name) — без select_related это
        # N+1: отдельный запрос на agent и на agent.employee для КАЖДОГО контрагента
        # (тот же класс бага, что был в ProductViewSet.get_queryset — см. рядом).
        qs = qs.select_related("agent", "agent__employee")
        return apply_agent_scope(qs, self.request.user)

    @action(detail=True, methods=['get'], url_path='saldo')
    def saldo(self, request, pk=None):
        """
        Сальдо контрагента за период — для модалки по двойному клику/Enter на строке
        в CounterpartiesPage.tsx (вместо открытия формы редактирования). В отличие
        от DocumentViewSet.counterparty_card (день конкретного документа, счёт по
        складу+типу документа) здесь нет ни документа, ни склада — контрагент мог
        фигурировать на РАЗНЫХ счетах (62 "Клиенты", 60 "Поставщики" и т.п.), поэтому
        находим ВСЕ счета, у которых сконфигурировано субконто "Контрагенты"
        (AccountSubconto.content_type=Counterparty), и считаем карточку по каждому —
        обычно он один (62 или 60), но не хардкодим это.
        """
        from django.contrib.contenttypes.models import ContentType
        from accounting.models import AccountSubconto
        from accounting.views.transaction_views import _compute_subconto_card

        counterparty = self.get_object()
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        if not date_from or not date_to:
            return Response({'detail': 'Укажите date_from и date_to'}, status=400)

        acc_subcontos = AccountSubconto.objects.filter(
            subconto_type__content_type=ContentType.objects.get_for_model(Counterparty),
        ).select_related('account', 'subconto_type')

        accounts_data = []
        for acc_subconto in acc_subcontos:
            data = _compute_subconto_card(
                request, acc_subconto.account, acc_subconto.subconto_type.slug,
                counterparty.id, counterparty, date_from, date_to,
            )
            accounts_data.append(data)

        return Response({
            'counterparty_name': counterparty.name,
            'accounts': accounts_data,
        })

    @action(detail=False, methods=['get'], url_path='bulk-saldo')
    def bulk_saldo(self, request):
        """
        Массовое сальдо ВСЕХ контрагентов текущего scope за период — для мини-таблицы
        сальдо в колонке CounterpartiesPage.tsx (тот же паттерн, что и
        ProductsListPage.tsx::Turnovers — один batch-запрос на весь список, а не
        N+1 отдельных запросов по каждой строке). Считает по КАЖДОМУ счёту, где
        настроено субконто "Контрагенты" (обычно 62 "Клиенты" и/или 60
        "Поставщики"), и суммирует по counterparty_id — если контрагент типа "both"
        фигурирует сразу на обоих счетах, для обзорной колонки это ок; полная,
        счёт-по-счёту разбивка — в CounterpartySaldoModal.tsx (по клику на строку).
        Контрагенты без единой проводки в ключ результата не попадают — фронт
        трактует отсутствие ключа как нулевое сальдо (см. ProductsListPage.tsx
        turnoverMap[item.id] с фолбэком ?? 0).
        """
        from django.contrib.contenttypes.models import ContentType
        from django.db.models import Sum, Q
        from accounting.models import AccountSubconto, TransactionLine
        from accounting.views.transaction_views import _tl_scope_filter
        from users.scoping import get_user_scope

        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        if not date_from or not date_to:
            return Response({'detail': 'Укажите date_from и date_to'}, status=400)

        branch_ids, warehouse_ids = get_user_scope(request.user)
        base_filter = _tl_scope_filter(request, branch_ids, warehouse_ids)

        acc_subcontos = AccountSubconto.objects.filter(
            subconto_type__content_type=ContentType.objects.get_for_model(Counterparty),
        ).select_related('account', 'subconto_type')

        def to_int(value):
            try:
                return int(value)
            except (TypeError, ValueError):
                return None

        result = {}

        def entry_for(cid):
            return result.setdefault(cid, {
                'opening_balance': Decimal('0'), 'total_debit': Decimal('0'), 'total_credit': Decimal('0'),
            })

        for acc_subconto in acc_subcontos:
            key_lookup = f'subcontos__{acc_subconto.subconto_type.slug}'
            base_qs = TransactionLine.objects.filter(base_filter, account_id=acc_subconto.account_id).exclude(
                **{f'{key_lookup}__isnull': True}
            )

            pre_rows = base_qs.filter(journal_entry__date__date__lt=date_from).values(key_lookup).annotate(
                debit=Sum('amount', filter=Q(side='debit'), default=Decimal('0')),
                credit=Sum('amount', filter=Q(side='credit'), default=Decimal('0')),
            )
            for row in pre_rows:
                cid = to_int(row[key_lookup])
                if cid is None:
                    continue
                entry_for(cid)['opening_balance'] += (row['debit'] or Decimal('0')) - (row['credit'] or Decimal('0'))

            period_rows = base_qs.filter(
                journal_entry__date__date__gte=date_from, journal_entry__date__date__lte=date_to,
            ).values(key_lookup).annotate(
                debit=Sum('amount', filter=Q(side='debit'), default=Decimal('0')),
                credit=Sum('amount', filter=Q(side='credit'), default=Decimal('0')),
            )
            for row in period_rows:
                cid = to_int(row[key_lookup])
                if cid is None:
                    continue
                entry = entry_for(cid)
                entry['total_debit']  += row['debit'] or Decimal('0')
                entry['total_credit'] += row['credit'] or Decimal('0')

        for entry in result.values():
            entry['closing_balance'] = entry['opening_balance'] + entry['total_debit'] - entry['total_credit']

        return Response(result)



class WarehouseViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
    queryset = Warehouse.objects.select_related("branch").order_by("name")
    serializer_class = WarehouseSerializer

    def get_permissions(self):
        return _rbac(self.action, "warehouse")


class WarehouseStockViewSet(viewsets.ModelViewSet):
    pagination_class = None
    serializer_class = WarehouseStockSerializer

    # def get_queryset(self):
    #     qs = (
    #         WarehouseStock.objects
    #         .select_related("warehouse", "product", "product__unit")
    #         .order_by("warehouse", "product__name")
    #     )
    #     warehouse_id = self.request.query_params.get("warehouse")
    #     product_id = self.request.query_params.get("product")
    #     if warehouse_id:
    #         qs = qs.filter(warehouse_id=warehouse_id)
    #     if product_id:
    #         qs = qs.filter(product_id=product_id)
    #     return qs
    
    def get_queryset(self):
        # 1. Базовая выборка с оптимизацией связей
        qs = (
            WarehouseStock.objects
            .select_related("warehouse", "product", "product__unit")
        )
        
        # 2. Добавляем расчет "на лету" прямо в SQL
        qs = qs.annotate(
            available_quantity=models.F('quantity') - models.F('reserved_quantity')
        )
        
        # 3. Фильтрация
        warehouse_id = self.request.query_params.get("warehouse")
        product_id = self.request.query_params.get("product")
        if warehouse_id:
            qs = qs.filter(warehouse_id=warehouse_id)
        if product_id:
            qs = qs.filter(product_id=product_id)
            
        return qs.order_by("warehouse", "product__name")

    def get_permissions(self):
        return _rbac(self.action, "warehousestock")
    
    
    


class ProductBundleViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    GET    /api/accounting/products/{product_id}/bundles/        — список
    POST   /api/accounting/products/{product_id}/bundles/        — создать
    PATCH  /api/accounting/products/{product_id}/bundles/{id}/   — обновить
    DELETE /api/accounting/products/{product_id}/bundles/{id}/   — удалить
    """
    serializer_class = ProductBundleSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ProductBundle.objects.filter(
            product_id=self.kwargs["product_pk"]
        ).select_related("bundle_product__unit").order_by("id")

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["product_id"] = int(self.kwargs["product_pk"])
        return ctx
    
    
    
class VolumeDiscountViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    GET    /api/accounting/products/{product_pk}/volume-discounts/
    POST   /api/accounting/products/{product_pk}/volume-discounts/
    PATCH  /api/accounting/products/{product_pk}/volume-discounts/{id}/
    DELETE /api/accounting/products/{product_pk}/volume-discounts/{id}/
    """
    serializer_class = VolumeDiscountSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return VolumeDiscount.objects.filter(
            product_id=self.kwargs["product_pk"]
        ).select_related("price_type").order_by("price_type", "min_qty")

    def perform_create(self, serializer):
        serializer.save(product_id=int(self.kwargs["product_pk"]))


class QuantityPromotionViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    GET    /api/accounting/products/{product_pk}/quantity-promotions/
    POST   /api/accounting/products/{product_pk}/quantity-promotions/
    PATCH  /api/accounting/products/{product_pk}/quantity-promotions/{id}/
    DELETE /api/accounting/products/{product_pk}/quantity-promotions/{id}/
    """
    serializer_class = QuantityPromotionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return QuantityPromotion.objects.filter(
            product_id=self.kwargs["product_pk"]
        ).select_related("price_type").order_by("price_type", "min_qty")

    def perform_create(self, serializer):
        serializer.save(product_id=int(self.kwargs["product_pk"]))
        
        
        
            
    
    
    
    
    