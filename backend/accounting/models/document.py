# backend/accounting/models/document.py
import datetime
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.contrib.contenttypes.models import ContentType
from django.contrib.postgres.indexes import GinIndex
from django.db import models, transaction

from .employee import Employee
from .product import Product, PriceType, Unit
from .stock import Warehouse, StockMovement
from .company import Branch
from .counterparty import Counterparty
from .transaction import JournalEntry
from .audit import AuditLog



class DocumentParticipant(models.Model):
    document = models.ForeignKey(
        'Document', on_delete=models.CASCADE,
        related_name='participants'
    )
    employee = models.ForeignKey(
        Employee, on_delete=models.PROTECT,
        related_name='document_participations'
    )
    # Свободный текст — берётся из названия должности сотрудника (accounting.Position),
    # которое администратор может назвать как угодно, поэтому фиксированный choices-список
    # здесь не подходит (см. баг: "Логист" is not a valid choice).
    role = models.CharField(max_length=100, default='other')

    class Meta:
        verbose_name = "Участник документа"
        verbose_name_plural = "Участники документа"
        constraints = [
            models.UniqueConstraint(
                fields=['document', 'employee', 'role'],
                name='unique_document_employee_role'
            )
        ]

    def __str__(self):
        return f"{self.role}: {self.employee.full_name}"

    def delete(self, *args, **kwargs):
        if self.document.status == Document.Status.POSTED:
            raise ValidationError("Нельзя удалять участников проведённого документа.")
        super().delete(*args, **kwargs)


class Document(models.Model):
    class Type(models.TextChoices):
        IN         = 'in',         'Приходная накладная'
        OUT        = 'out',        'Расходная накладная'
        MOVE       = 'move',       'Перемещение'
        RETURN_IN  = 'return_in',  'Возврат от покупателя'
        RETURN_OUT = 'return_out', 'Возврат поставщику'

    class Status(models.TextChoices):
        DRAFT  = 'draft',  'Черновик'
        POSTED = 'posted', 'Проведён'

    number        = models.CharField(max_length=30, unique=True, blank=True)
    document_type = models.CharField(max_length=10, choices=Type.choices, db_index=True)
    status        = models.CharField(
        max_length=10, choices=Status.choices,
        default=Status.DRAFT, db_index=True
    )
    date = models.DateField(default=datetime.date.today, db_index=True)

    warehouse = models.ForeignKey(
        Warehouse, on_delete=models.PROTECT,
        null=True, blank=True, related_name='documents'
    )
    warehouse_to = models.ForeignKey(
        Warehouse, on_delete=models.PROTECT,
        null=True, blank=True, related_name='documents_in'
    )
    branch = models.ForeignKey(
        Branch, on_delete=models.PROTECT,
        null=True, blank=True, related_name='documents'
    )
    counterparty = models.ForeignKey(
        Counterparty, on_delete=models.PROTECT,
        null=True, blank=True, related_name='documents'
    )
    base_document = models.ForeignKey(
        'self', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='child_documents'
    )
    # ✅ Рейс водителя, в который включена эта накладная (см. accounting/models/trip.py::Trip).
    # Только для document_type=OUT — Trip.add_document сам это проверяет.
    trip = models.ForeignKey(
        'Trip', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='documents',
        verbose_name="Рейс",
    )

    default_price_type = models.ForeignKey(
        PriceType, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='documents',
        verbose_name="Тип цены по умолчанию"
    )

    subtotal         = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    discount_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        validators=[MinValueValidator(0)]
    )
    discount_amount  = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total            = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_profit     = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    # ✅ Снимок Counterparty.delivery_percent на момент ПРОВЕДЕНИЯ (не создания —
    # черновик ещё может поменять контрагента) — используется Trip.deliver() для
    # расчёта ЗП водителя. Намеренно копия, а не обращение к живому полю
    # контрагента: если процент потом поменяют, уже проведённые (и тем более уже
    # доставленные в рейсе) накладные не должны задним числом пересчитаться —
    # см. CLAUDE.md про "хранить то, что реально произошло".
    delivery_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        verbose_name="Процент водителю за доставку (снимок с контрагента)",
    )

    note       = models.CharField(max_length=500, blank=True)
    extra_data = models.JSONField(default=dict, blank=True)

    journal_entry = models.OneToOneField(
        JournalEntry, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='document'
    )

    posted_at = models.DateTimeField(null=True, blank=True)
    posted_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='posted_documents'
    )
    created_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='created_documents'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-number']
        verbose_name = "Документ"
        verbose_name_plural = "Документы"
        indexes = [
            models.Index(fields=['document_type', 'status', 'date']),
            models.Index(fields=['counterparty', 'date']),
            models.Index(fields=['warehouse', 'date']),
            GinIndex(fields=['extra_data'], name='document_extra_data_gin'),
        ]

    def __str__(self):
        return f"{self.get_document_type_display()} №{self.number} от {self.date}"

    def save(self, *args, **kwargs):
        if self.pk:
            try:
                old = Document.objects.get(pk=self.pk)
                if old.status == self.Status.POSTED:
                    allowed = {
                        'status', 'posted_at', 'posted_by',
                        'journal_entry', 'subtotal', 'discount_amount',
                        'total', 'total_profit', 'delivery_percent',
                        # ✅ Единственное поле, которое Trip.add_document/remove_document
                        # трогает на уже проведённом документе — состав рейса не меняет
                        # ни одну проведённую сумму/проводку самого документа (см.
                        # accounting/models/trip.py).
                        'trip',
                    }
                    update_fields = kwargs.get('update_fields')
                    if update_fields is None:
                        raise ValidationError("Нельзя изменять проведённый документ.")
                    if not set(update_fields).issubset(allowed):
                        raise ValidationError("Нельзя изменять проведённый документ.")
            except Document.DoesNotExist:
                pass

        is_new = self.pk is None
        super().save(*args, **kwargs)

        if is_new and not self.number:
            from django.utils import timezone
            prefix_map = {
                'in':         'IN',
                'out':        'OUT',
                'move':       'MOV',
                'return_in':  'RIN',
                'return_out': 'ROUT',
            }
            prefix = prefix_map.get(self.document_type, 'DOC')
            year = timezone.now().year
            self.number = f'{prefix}-{year}-{self.pk:06d}'
            Document.objects.filter(pk=self.pk).update(number=self.number)

    def clean(self):
        if self.document_type == self.Type.MOVE:
            if not self.warehouse:
                raise ValidationError("Укажите склад-источник.")
            if not self.warehouse_to:
                raise ValidationError("Укажите склад-получатель.")
            if self.warehouse_id and self.warehouse_id == self.warehouse_to_id:
                raise ValidationError("Склад-источник и склад-получатель не могут совпадать.")
        if self.document_type in (
            self.Type.IN, self.Type.OUT,
            self.Type.RETURN_IN, self.Type.RETURN_OUT
        ):
            if not self.warehouse:
                raise ValidationError("Укажите склад.")
            if not self.counterparty:
                raise ValidationError("Укажите контрагента.")

    def delete(self, *args, **kwargs):
        if self.status == self.Status.POSTED:
            raise ValidationError("Нельзя удалить проведённый документ.")
        super().delete(*args, **kwargs)

    def recalculate(self):
        """
        subtotal     — сумма БЕЗ каких-либо скидок (price × quantity), "по прайсу".
        net_subtotal — после построчных скидок (акции по объёму/ручные), но ДО скидки
                       документа — соответствует frontend `netSubtotal` (Vars.ts::lineTotal).
        total        — net_subtotal минус скидка документа (discount_percent) — то, что
                       реально должен клиент, и то, что идёт в проводку (Дт60/Кт90.1).
        discount_amount — subtotal - total, т.е. ОБЩАЯ скидка (построчная + документа
                       вместе) — раньше здесь учитывалась только скидка документа,
                       построчные скидки визуально показывались на экране, но не влияли
                       на total/проводку — это было исправлено по просьбе заказчика.
        """
        from django.db.models import Sum, F, ExpressionWrapper, Value
        from django.db.models import DecimalField as DF
        from django.db.models.functions import Coalesce

        dec_field = DF(max_digits=15, decimal_places=2)
        line_factor = Value(Decimal('1')) - F('discount_percent') / Value(Decimal('100'))

        agg = self.items.aggregate(
            subtotal=Coalesce(
                Sum(ExpressionWrapper(
                    F('price') * F('quantity'),
                    output_field=dec_field
                )),
                Decimal('0'),
                output_field=dec_field
            ),
            net_subtotal=Coalesce(
                Sum(ExpressionWrapper(
                    F('price') * F('quantity') * line_factor,
                    output_field=dec_field
                )),
                Decimal('0'),
                output_field=dec_field
            ),
            profit=Coalesce(
                Sum(ExpressionWrapper(
                    (F('price') * line_factor - F('cost_price')) * F('quantity'),
                    output_field=dec_field
                )),
                Decimal('0'),
                output_field=dec_field
            ),
        )

        subtotal        = agg['subtotal'].quantize(Decimal('0.01'))
        net_subtotal    = agg['net_subtotal'].quantize(Decimal('0.01'))
        header_discount = (net_subtotal * self.discount_percent / 100).quantize(Decimal('0.01'))
        total           = net_subtotal - header_discount
        discount_amount = subtotal - total
        total_profit    = agg['profit'].quantize(Decimal('0.01')) if self.document_type in (
            self.Type.OUT, self.Type.RETURN_IN
        ) else Decimal('0')

        Document.objects.filter(pk=self.pk).update(
            subtotal=subtotal,
            discount_amount=discount_amount,
            total=total,
            total_profit=total_profit,
        )
        self.subtotal        = subtotal
        self.discount_amount = discount_amount
        self.total           = total
        self.total_profit    = total_profit

    @transaction.atomic
    def post(self, user=None):
        from accounting.utils import check_period_open
        from django.utils import timezone
        if self.status == self.Status.POSTED:
            raise ValidationError("Документ уже проведён.")
        if not self.items.exists():
            raise ValidationError("Нельзя провести пустой документ.")
        # check_period_open(self.date)
        check_period_open(self.date, branch_id=self.branch_id, warehouse_id=self.warehouse_id)
        # ✅ Та же проверка, что и при сохранении строки (DocumentItem.save() —
        # см. accounting/utils.py::check_stock_availability) — повторяем и здесь
        # на случай, если резерв на складе успел измениться (другой черновик
        # сохранён/удалён) между сохранением строки и нажатием "Провести".
        if self.document_type in (self.Type.OUT, self.Type.RETURN_OUT, self.Type.MOVE):
            from accounting.utils import check_stock_availability
            for item in self.items.select_related('product'):
                check_stock_availability(
                    self.warehouse_id, item.product, item.quantity,
                    exclude_document_id=self.id,
                )
        self._create_stock_movements()
        if self.document_type == self.Type.IN:
            self._update_product_cost_prices(user=user)
            self._generate_in_posting(user=user)
        if self.document_type == self.Type.OUT:
            self._generate_out_posting(user=user)
        if self.document_type == self.Type.RETURN_IN:
            self._generate_return_in_posting(user=user)
        if self.document_type == self.Type.RETURN_OUT:
            self._generate_return_out_posting(user=user)
        if self.document_type == self.Type.OUT and self.counterparty_id:
            self.delivery_percent = self.counterparty.delivery_percent
        self.status    = self.Status.POSTED
        self.posted_at = timezone.now()
        self.posted_by = user
        self.save(update_fields=['status', 'posted_at', 'posted_by', 'journal_entry', 'delivery_percent'])
        self._write_audit_log(user, AuditLog.Action.POST, before_status=self.Status.DRAFT)
        if self.document_type in (self.Type.OUT, self.Type.RETURN_OUT):
            from accounting.broadcasts import broadcast_dashboard_update
            broadcast_dashboard_update()

    def _update_product_cost_prices(self, user=None):
        """
        При проведении приходной накладной цена строки становится текущей
        себестоимостью товара (модель "последняя цена закупки") — используется
        затем в расходных документах для расчёта дохода/маржи. Каждое изменение
        себестоимости пишется в AuditLog (см. CLAUDE.md: RBAC/Scope/Audit — товары
        входят в список того, что обязательно аудировать).

        Отдельно фиксируется переоценка (см. ProductRevaluation, отчёт "Переоценка
        товаров") — cost_price ГЛОБАЛЬНОЕ поле товара (не по складам), поэтому
        изменение себестоимости переоценивает остаток НА КАЖДОМ складе, где товар
        есть, а не только на складе этого документа. Фиксируется явным вызовом
        здесь (а не сигналом post_save) — Product.objects.filter(...).update(...)
        выше не триггерит Django-сигналы вообще (см. CLAUDE.md про QuerySet.update()
        и AuditMixin), так что сигнал этот момент никогда бы не поймал.
        """
        from accounting.models import Product, ProductRevaluation, WarehouseStock
        from accounting.utils import record_price_change
        for item in self.items.select_related('product'):
            old_cost_price = item.product.cost_price
            if old_cost_price == item.price:
                continue
            Product.objects.filter(pk=item.product_id).update(cost_price=item.price)
            AuditLog.objects.create(
                content_type=ContentType.objects.get_for_model(Product),
                object_id=item.product_id,
                object_repr=str(item.product)[:255],
                action=AuditLog.Action.UPDATE,
                user=user if user and user.is_authenticated else None,
                changed_data={'cost_price': {'before': str(old_cost_price), 'after': str(item.price)}},
            )

            # ✅ На складе ЭТОГО документа WarehouseStock.quantity уже включает
            # только что поступившее количество (_create_stock_movements() отработал
            # раньше, см. post()) — эти единицы получили новую себестоимость как
            # свою РЕАЛЬНУЮ цену прихода, а не были "переоценены", поэтому вычитаем
            # item.quantity именно на складе документа, чтобы не задвоить сумму.
            revaluations = []
            stocks = (
                WarehouseStock.objects
                .filter(product_id=item.product_id)
                .exclude(quantity=0)
                .select_related('warehouse')
            )
            for stock in stocks:
                qty = stock.quantity
                if stock.warehouse_id == self.warehouse_id:
                    qty -= item.quantity
                if qty <= 0:
                    continue
                revaluations.append(ProductRevaluation(
                    product_id=item.product_id,
                    warehouse=stock.warehouse,
                    branch_id=stock.warehouse.branch_id,
                    document=self,
                    date=self.date,
                    quantity=qty,
                    old_cost_price=old_cost_price,
                    new_cost_price=item.price,
                    diff_amount=(qty * (item.price - old_cost_price)).quantize(Decimal('0.01')),
                    created_by=user if user and user.is_authenticated else None,
                ))
            if revaluations:
                ProductRevaluation.objects.bulk_create(revaluations)

            # ✅ Отчёт "История изменения цен" (PriceChangeHistory, price_type=None
            # означает "Себестоимость") — ОДНА обзорная строка на событие, а не
            # по складу, как ProductRevaluation выше; остаток — сумма тех же
            # per-warehouse qty, что уже посчитаны в revaluations (без второго
            # запроса к БД).
            record_price_change(
                product_id=item.product_id,
                price_type_id=None,
                document=self,
                old_price=old_cost_price,
                new_price=item.price,
                quantity=sum((r.quantity for r in revaluations), Decimal('0')),
                user=user,
                date=self.date,
            )

    def _resolve_role_account(self, wh, default_field, supplier_field):
        """
        Возвращает счёт для роли (receivable/payable/profit), учитывая, что у
        контрагента-поставщика (Counterparty.Type.SUPPLIER) эта роль может вестись
        по СОВСЕМ ДРУГОМУ счёту, чем у обычного покупателя — см. Warehouse.
        *_account_supplier в accounting/models/stock.py. Если override не настроен
        (или контрагент не поставщик) — используется обычный default_field.
        """
        from accounting.models import Counterparty
        override = getattr(wh, supplier_field, None)
        if (
            override is not None
            and self.counterparty is not None
            and self.counterparty.type == Counterparty.Type.SUPPLIER
        ):
            return override
        return getattr(wh, default_field)

    def _resolve_account_subcontos(self, account, counterparty=None, product=None):
        """
        Строит {slug: id} для всех субконто, настроенных на счёте (через AccountSubconto),
        используя доступный контекст (контрагент документа / товар строки). Ничего не
        подставляется "наугад" — если для какого-то субконто контекст недоступен или
        субконто не привязано к модели данных, явная ошибка, а не тихая пропажа данных.
        """
        from django.contrib.contenttypes.models import ContentType
        from accounting.models import Counterparty, Product as ProductModel

        context = {}
        if counterparty is not None:
            context[ContentType.objects.get_for_model(Counterparty).id] = counterparty.pk
        if product is not None:
            context[ContentType.objects.get_for_model(ProductModel).id] = product.pk

        result = {}
        for st in account.subcontos.all():
            if not st.content_type_id:
                raise ValidationError(
                    f"Субконто «{st.name}» счёта {account.code} не привязано к модели данных — "
                    f"автоматическая проводка невозможна. Настройте «Какую модель подключаем» "
                    f"у этого вида субконто."
                )
            value = context.get(st.content_type_id)
            if value is None:
                raise ValidationError(
                    f"Не удалось определить значение субконто «{st.name}» для счёта {account.code} "
                    f"при проведении документа №{self.number} — эта аналитика недоступна на этом "
                    f"уровне проводки (например «Номенклатура» нельзя использовать на счёте расчётов "
                    f"с покупателем/выручки — товар известен только по строкам)."
                )
            result[st.slug] = value
        return result

    def _generate_out_posting(self, user=None, sign=Decimal('1'), description=None):
        """
        Генерирует проводку для "Расхода" — счета берутся со СКЛАДА документа
        (см. правило "1 накладная = 1 склад"), а не хардкодятся — пользователь сам
        настраивает 4 счёта в карточке склада (см. CLAUDE.md).

        Нога 1 (одна строка на весь документ): Дт receivable_account — Кт revenue_account,
        на сумму документа (self.total) — субконто "Контрагент", если настроено.
        Нога 2 (отдельная проводка на каждую строку товара): Дт cogs_account —
        Кт inventory_account, на себестоимость строки — субконто "Номенклатура", если настроено.

        ✅ sign=-1 используется для "Возврата от покупателя" (см. _generate_return_in_posting) —
        те же счета и те же стороны (Дт/Кт), но с отрицательной суммой ("красное сторно" по
        просьбе заказчика), а не разворот дебета/кредита. Баланс (Дт=Кт) при этом сходится
        так же, как при обычном развороте, но оборот по счёту за период не раздувается.

        ✅ Если на складе настроен discount_account И есть скидка (self.discount_amount != 0) —
        receivable/revenue проводятся ПО ПОЛНОЙ цене (self.subtotal), а скидка — отдельной
        строкой Дт discount_account / Кт receivable_account, чтобы в ОСВ было видно сумму
        предоставленных скидок отдельно от выручки. Если счёт не настроен — поведение как
        раньше: receivable/revenue = self.total (уже netted со скидкой).

        ✅ Альтернативная схема (Warehouse.profit_account И fund_account оба заполнены) —
        для складов, унаследовавших учёт в стиле "инвентарь списывается по полной цене
        продажи, прибыль — отдельной ногой на фонд" (см. обсуждение с пользователем про
        перенос данных из исторической системы). В этом режиме revenue_account/cogs_account
        не используются вовсе: Нога 1 — Дт receivable/Кт inventory_account на полную сумму
        (вместо revenue_account), Нога 2 (по каждой строке) — Дт profit_account/Кт
        fund_account на прибыль строки ((price*(1-discount_percent/100) - cost_price)*qty),
        вместо Дт cogs_account/Кт inventory_account на себестоимость.
        """
        from accounting.models import JournalEntry, TransactionLine
        from accounting.utils import generate_journal_number

        wh = self.warehouse
        if wh is None:
            raise ValidationError("У документа не указан склад — проводка невозможна.")

        alt_scheme = wh.profit_account_id is not None and wh.fund_account_id is not None
        if alt_scheme:
            required = ['receivable_account_id', 'inventory_account_id', 'profit_account_id', 'fund_account_id']
        else:
            required = ['receivable_account_id', 'revenue_account_id', 'cogs_account_id', 'inventory_account_id']
        missing = [f for f in required if getattr(wh, f, None) is None]
        if missing:
            raise ValidationError(
                f"Для склада «{wh.name}» не настроены счета для проводки расхода: "
                f"{', '.join(missing)}. Настройте их в карточке склада перед проведением."
            )

        entry = JournalEntry.objects.create(
            number=generate_journal_number(),
            date=self.date,
            description=description or f"Реализация по документу №{self.number}",
            branch=self.branch,
            warehouse=self.warehouse,
            source_document_type=ContentType.objects.get_for_model(Document),
            source_document_id=self.pk,
            created_by=user,
        )

        order = 1
        receivable_account = self._resolve_role_account(wh, 'receivable_account', 'receivable_account_supplier')

        if alt_scheme:
            # ✅ В альт-схеме "Нога 1" (receivable/inventory) кредитует inventory_account —
            # а этот счёт обычно требует субконто "Номенклатура", которое доступно только на
            # уровне СТРОКИ документа (несколько разных товаров в одном документе). Поэтому,
            # в отличие от классической схемы (где receivable/revenue — одна строка на весь
            # документ), здесь и эта нога, и нога прибыли строятся ПО КАЖДОЙ СТРОКЕ отдельно —
            # так же, как в исходной системе (create_entries вызывался внутри цикла по товарам).
            profit_account = self._resolve_role_account(wh, 'profit_account', 'profit_account_supplier')
            for item in self.items.select_related('product'):
                line_factor = Decimal('1') - item.discount_percent / Decimal('100')
                sale_amount = (item.price * line_factor * item.quantity * sign).quantize(Decimal('0.01'))
                if sale_amount != 0:
                    ar_subcontos = self._resolve_account_subcontos(receivable_account, counterparty=self.counterparty)
                    inv_subcontos = self._resolve_account_subcontos(wh.inventory_account, counterparty=self.counterparty, product=item.product)
                    TransactionLine.objects.create(
                        journal_entry=entry, order=order, side=TransactionLine.Side.DEBIT,
                        account=receivable_account, amount=sale_amount, subcontos=ar_subcontos,
                    )
                    order += 1
                    TransactionLine.objects.create(
                        journal_entry=entry, order=order, side=TransactionLine.Side.CREDIT,
                        account=wh.inventory_account, amount=sale_amount, subcontos=inv_subcontos,
                    )
                    order += 1

                profit_amount = ((item.price * line_factor - item.cost_price) * item.quantity * sign).quantize(Decimal('0.01'))
                if profit_amount != 0:
                    profit_subcontos = self._resolve_account_subcontos(profit_account, counterparty=self.counterparty, product=item.product)
                    fund_subcontos = self._resolve_account_subcontos(wh.fund_account, counterparty=self.counterparty, product=item.product)
                    TransactionLine.objects.create(
                        journal_entry=entry, order=order, side=TransactionLine.Side.DEBIT,
                        account=profit_account, amount=profit_amount, subcontos=profit_subcontos,
                    )
                    order += 1
                    TransactionLine.objects.create(
                        journal_entry=entry, order=order, side=TransactionLine.Side.CREDIT,
                        account=wh.fund_account, amount=profit_amount, subcontos=fund_subcontos,
                    )
                    order += 1

            if order == 1:
                entry.delete()
                return
            entry.post()
            self.journal_entry = entry
            return

        discount_amount = (self.discount_amount * sign).quantize(Decimal('0.01'))
        use_gross = wh.discount_account_id is not None and discount_amount != 0
        total_amount = ((self.subtotal if use_gross else self.total) * sign).quantize(Decimal('0.01'))

        if total_amount != 0:
            ar_subcontos = self._resolve_account_subcontos(receivable_account, counterparty=self.counterparty)
            rev_subcontos = self._resolve_account_subcontos(wh.revenue_account, counterparty=self.counterparty)
            TransactionLine.objects.create(
                journal_entry=entry, order=order, side=TransactionLine.Side.DEBIT,
                account=receivable_account, amount=total_amount, subcontos=ar_subcontos,
            )
            order += 1
            TransactionLine.objects.create(
                journal_entry=entry, order=order, side=TransactionLine.Side.CREDIT,
                account=wh.revenue_account, amount=total_amount, subcontos=rev_subcontos,
            )
            order += 1

            if use_gross:
                disc_subcontos = self._resolve_account_subcontos(wh.discount_account, counterparty=self.counterparty)
                TransactionLine.objects.create(
                    journal_entry=entry, order=order, side=TransactionLine.Side.DEBIT,
                    account=wh.discount_account, amount=discount_amount, subcontos=disc_subcontos,
                )
                order += 1
                TransactionLine.objects.create(
                    journal_entry=entry, order=order, side=TransactionLine.Side.CREDIT,
                    account=receivable_account, amount=discount_amount, subcontos=ar_subcontos,
                )
                order += 1

        for item in self.items.select_related('product'):
            item_cost = (item.cost_price * item.quantity * sign).quantize(Decimal('0.01'))
            if item_cost == 0:
                continue
            cogs_subcontos = self._resolve_account_subcontos(wh.cogs_account, counterparty=self.counterparty, product=item.product)
            inv_subcontos = self._resolve_account_subcontos(wh.inventory_account, counterparty=self.counterparty, product=item.product)
            TransactionLine.objects.create(
                journal_entry=entry, order=order, side=TransactionLine.Side.DEBIT,
                account=wh.cogs_account, amount=item_cost, subcontos=cogs_subcontos,
            )
            order += 1
            TransactionLine.objects.create(
                journal_entry=entry, order=order, side=TransactionLine.Side.CREDIT,
                account=wh.inventory_account, amount=item_cost, subcontos=inv_subcontos,
            )
            order += 1

        if order == 1:
            # Ни одной строки не создано (нулевой документ) — проводка не нужна.
            entry.delete()
            return

        entry.post()
        self.journal_entry = entry

    def _generate_return_in_posting(self, user=None):
        """
        "Возврат от покупателя" — те же счета и структура, что и в _generate_out_posting
        (Дт receivable/Кт revenue, Дт cogs/Кт inventory), но с отрицательной суммой
        ("красное сторно"): уменьшает выручку/долг клиента и уменьшает себестоимость,
        одновременно возвращая товар на inventory_account.
        """
        self._generate_out_posting(
            user=user, sign=Decimal('-1'),
            description=f"Возврат от покупателя по документу №{self.number}",
        )

    def _generate_in_posting(self, user=None, sign=Decimal('1'), description=None):
        """
        Генерирует проводку для "Прихода" — счета берутся со СКЛАДА документа, как и в
        _generate_out_posting. В отличие от Расхода, здесь нет ни выручки, ни себестоимости —
        просто товар приходит на баланс, и растёт долг перед поставщиком:

        Дт inventory_account (тот же счёт товара, что кредитуется в Расходе) —
        Кт payable_account (задолженность перед поставщиком),
        на сумму item.price × item.quantity по каждой строке — то, что реально указано
        в документе (тот же принцип, что и в _update_product_cost_prices).

        Строится по каждой позиции отдельно (а не одной строкой на документ), потому что
        inventory_account обычно требует субконто "Номенклатура" — а в документе может
        быть несколько разных товаров.

        ✅ sign=-1 используется для "Возврата поставщику" (см. _generate_return_out_posting) —
        те же счета и стороны, но с отрицательной суммой ("красное сторно"), а не разворот.
        """
        from accounting.models import JournalEntry, TransactionLine
        from accounting.utils import generate_journal_number

        wh = self.warehouse
        if wh is None:
            raise ValidationError("У документа не указан склад — проводка невозможна.")

        required = ['inventory_account_id', 'payable_account_id']
        missing = [f for f in required if getattr(wh, f, None) is None]
        if missing:
            raise ValidationError(
                f"Для склада «{wh.name}» не настроены счета для проводки прихода: "
                f"{', '.join(missing)}. Настройте их в карточке склада перед проведением."
            )

        entry = JournalEntry.objects.create(
            number=generate_journal_number(),
            date=self.date,
            description=description or f"Приход по документу №{self.number}",
            branch=self.branch,
            warehouse=self.warehouse,
            source_document_type=ContentType.objects.get_for_model(Document),
            source_document_id=self.pk,
            created_by=user,
        )

        order = 1
        payable_account = self._resolve_role_account(wh, 'payable_account', 'payable_account_supplier')
        for item in self.items.select_related('product'):
            item_amount = (item.price * item.quantity * sign).quantize(Decimal('0.01'))
            if item_amount == 0:
                continue
            inv_subcontos = self._resolve_account_subcontos(wh.inventory_account, counterparty=self.counterparty, product=item.product)
            payable_subcontos = self._resolve_account_subcontos(payable_account, counterparty=self.counterparty, product=item.product)
            TransactionLine.objects.create(
                journal_entry=entry, order=order, side=TransactionLine.Side.DEBIT,
                account=wh.inventory_account, amount=item_amount, subcontos=inv_subcontos,
            )
            order += 1
            TransactionLine.objects.create(
                journal_entry=entry, order=order, side=TransactionLine.Side.CREDIT,
                account=payable_account, amount=item_amount, subcontos=payable_subcontos,
            )
            order += 1

        if order == 1:
            # Ни одной строки не создано (нулевой документ) — проводка не нужна.
            entry.delete()
            return

        entry.post()
        self.journal_entry = entry

    def _generate_return_out_posting(self, user=None):
        """
        "Возврат поставщику" — те же счета и структура, что и в _generate_in_posting
        (Дт inventory/Кт payable), но с отрицательной суммой ("красное сторно"):
        уменьшает остаток товара и уменьшает долг перед поставщиком.
        """
        self._generate_in_posting(
            user=user, sign=Decimal('-1'),
            description=f"Возврат поставщику по документу №{self.number}",
        )

    def _write_audit_log(self, user, action, before_status):
        AuditLog.objects.create(
            content_type=ContentType.objects.get_for_model(Document),
            object_id=self.pk,
            object_repr=str(self)[:255],
            action=action,
            user=user if user and user.is_authenticated else None,
            changed_data={'status': {'before': before_status, 'after': self.status}},
        )

    @transaction.atomic
    def unpost(self, user=None):
        from accounting.utils import check_period_open
        if self.status == self.Status.DRAFT:
            raise ValidationError("Документ ещё не проведён.")
        if self.trip_id:
            raise ValidationError(
                "Накладная включена в рейс — сначала уберите её из рейса (или отмените "
                "доставку рейса, если он уже закрыт), затем отменяйте проведение."
            )
        # check_period_open(self.date)
        check_period_open(self.date, branch_id=self.branch_id, warehouse_id=self.warehouse_id)
        self._rollback_stock_movements()
        if self.journal_entry:
            self.journal_entry.delete()
            self.journal_entry = None
        self.status    = self.Status.DRAFT
        self.posted_at = None
        self.posted_by = None
        self.save(update_fields=['status', 'posted_at', 'posted_by', 'journal_entry'])
        self._write_audit_log(user, AuditLog.Action.UNPOST, before_status=self.Status.POSTED)
        if self.document_type in (self.Type.OUT, self.Type.RETURN_OUT):
            from accounting.broadcasts import broadcast_dashboard_update
            broadcast_dashboard_update()

    def _stock_direction(self, reverse=False):
        fwd = {
            self.Type.IN:         StockMovement.Direction.IN,
            self.Type.OUT:        StockMovement.Direction.OUT,
            self.Type.MOVE:       StockMovement.Direction.MOVE,
            self.Type.RETURN_IN:  StockMovement.Direction.IN,
            self.Type.RETURN_OUT: StockMovement.Direction.OUT,
        }
        rev = {
            self.Type.IN:         StockMovement.Direction.OUT,
            self.Type.OUT:        StockMovement.Direction.IN,
            self.Type.MOVE:       StockMovement.Direction.MOVE,
            self.Type.RETURN_IN:  StockMovement.Direction.OUT,
            self.Type.RETURN_OUT: StockMovement.Direction.IN,
        }
        return rev[self.document_type] if reverse else fwd[self.document_type]

    def _create_stock_movements(self):
        direction = self._stock_direction()
        for item in self.items.select_related('product'):
            StockMovement.objects.create(
                warehouse    = self.warehouse,
                warehouse_to = self.warehouse_to,
                product      = item.product,
                direction    = direction,
                quantity     = item.quantity,
                cost_price   = item.cost_price,
                note         = f"Документ №{self.number}",
                date         = self.date,
            )

    def _rollback_stock_movements(self):
        direction = self._stock_direction(reverse=True)
        for item in self.items.select_related('product'):
            wh    = self.warehouse_to if self.document_type == self.Type.MOVE else self.warehouse
            wh_to = self.warehouse    if self.document_type == self.Type.MOVE else None
            StockMovement.objects.create(
                warehouse    = wh,
                warehouse_to = wh_to,
                product      = item.product,
                direction    = direction,
                quantity     = item.quantity,
                cost_price   = item.cost_price,
                note         = f"Отмена документа №{self.number}",
                date         = self.date,
            )

class DocumentItem(models.Model):
    document   = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='items')
    product    = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='document_items')
    unit       = models.ForeignKey(Unit, on_delete=models.PROTECT, null=True, blank=True)
    line_no    = models.PositiveIntegerField(default=1, verbose_name="№ строки")

    quantity         = models.DecimalField(
        max_digits=15, decimal_places=3,
        validators=[MinValueValidator(Decimal('0.001'))]
    )
    price            = models.DecimalField(max_digits=15, decimal_places=3, default=0)
    price_type       = models.ForeignKey(
        PriceType, on_delete=models.SET_NULL,
        null=True, blank=True
    )
    discount_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        validators=[MinValueValidator(0)]
    )
    cost_price = models.DecimalField(max_digits=15, decimal_places=3, default=0)
    extra_data = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Строка документа"
        ordering = ['line_no', 'id']
        constraints = [
            models.CheckConstraint(
                check=models.Q(quantity__gt=0),
                name='document_item_quantity_gt_zero'
            )
        ]

    def __str__(self):
        return f"{self.product.name} x {self.quantity}"

    def save(self, *args, **kwargs):
        if self.document.status == Document.Status.POSTED:
            raise ValidationError("Нельзя изменять строки проведённого документа.")
        if not self.unit_id and self.product_id:
            self.unit = self.product.unit
        if not self.cost_price and self.product_id:
            self.cost_price = self.product.cost_price
        # ✅ Расход/Возврат поставщику/Перемещение списывают товар со склада
        # документа при проведении (см. Document._stock_direction) — запрет
        # сохранять строку с количеством больше доступного (остаток минус то,
        # что уже занято другими черновиками) действует уже здесь, при
        # сохранении строки, а не только при проведении документа (см.
        # accounting/utils.py::check_stock_availability).
        if self.document.document_type in (
            Document.Type.OUT, Document.Type.RETURN_OUT, Document.Type.MOVE
        ):
            from accounting.utils import check_stock_availability
            check_stock_availability(
                self.document.warehouse_id, self.product, self.quantity,
                exclude_document_id=self.document_id,
            )
        super().save(*args, **kwargs)
        self.document.recalculate()

    def delete(self, *args, **kwargs):
        if self.document.status == Document.Status.POSTED:
            raise ValidationError("Нельзя удалять строки проведённого документа.")
        document = self.document
        super().delete(*args, **kwargs)
        document.recalculate()
        
        
        
        

        