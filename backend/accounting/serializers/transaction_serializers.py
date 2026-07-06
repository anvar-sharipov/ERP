# accounting/serializers/transaction_serializers.py

from rest_framework import serializers
from django.db import transaction
from django.contrib.contenttypes.models import ContentType
from accounting.utils import check_period_open, generate_journal_number
from rest_framework import serializers as drf_serializers
from users.scoping import get_user_scope



from accounting.models import (
    JournalEntry, TransactionLine, Account, StockMovement, ClosedPeriod
)


# =====================================================================
# ВСПОМОГАТЕЛЬНЫЙ СЕРИАЛИЗАТОР ДЛЯ СУБКОНТО
# =====================================================================

class SubcontoValueSerializer(serializers.Serializer):
    """
    Валидирует один элемент субконто: {"id": 5, "name": "ИП Ахмедов"}.
    Используется внутри TransactionLineSerializer.
    """
    id   = serializers.IntegerField()
    name = serializers.CharField(max_length=255)


# =====================================================================
# СТРОКА ОПЕРАЦИИ
# =====================================================================

class TransactionLineSerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source='account.code', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)

    class Meta:
        model  = TransactionLine
        fields = [
            'id', 'order', 'side',
            'account', 'account_code', 'account_name',
            'amount', 'subcontos',
        ]
        # extra_kwargs = {
        #     'account': {'write_only': True},
        # }

    def validate_account(self, account):
        if account.is_group:
            raise serializers.ValidationError(
                f"Счёт {account.code} является группой — проводки запрещены."
            )
        if not account.is_active:
            raise serializers.ValidationError(
                f"Счёт {account.code} неактивен."
            )
        return account

    def validate(self, attrs):
        account   = attrs.get('account') or self.instance.account
        subcontos = attrs.get('subcontos', {})

        required = set(account.subcontos.values_list('slug', flat=True))
        provided = set(subcontos.keys())

        missing = required - provided
        if missing:
            raise serializers.ValidationError({
                'subcontos': f"Не заполнены субконто для счёта {account.code}: {missing}"
            })
        extra = provided - required
        if extra:
            raise serializers.ValidationError({
                'subcontos': f"Лишние субконто для счёта {account.code}: {extra}"
            })

        # Валидируем структуру каждого субконто
        for slug, value in subcontos.items():
            s = SubcontoValueSerializer(data=value)
            if not s.is_valid():
                raise serializers.ValidationError({
                    'subcontos': f"Неверный формат субконто '{slug}': {s.errors}"
                })

        return attrs


# =====================================================================
# ЖУРНАЛЬНАЯ ОПЕРАЦИЯ (основной)
# =====================================================================

class JournalEntrySerializer(serializers.ModelSerializer):
    lines = TransactionLineSerializer(many=True)
    # branch_name = serializers.CharField(source='branch.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True, default=None)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True, default=None)

    # Read-only поля для отображения
    created_by_name = serializers.CharField(
        source='created_by.get_full_name', read_only=True
    )
    status_display = serializers.CharField(
        source='get_status_display', read_only=True
    )
    # ✅ Ручная проводка (создана вручную через журнал) vs проводка, сгенерированная
    # документом (Document.post() → _generate_out_posting/_generate_in_posting и т.д.) —
    # см. is_manual в JournalEntryListSerializer ниже и UI-фильтр в JournalPage.tsx.
    is_manual = serializers.SerializerMethodField()

    def get_is_manual(self, obj):
        return obj.source_document_id is None

    class Meta:
        model  = JournalEntry
        fields = [
            'id', 'number', 'date', 'status', 'status_display',
            'description', 'lines',
            'branch', 'branch_name',
            'warehouse', 'warehouse_name',
            'source_document_type', 'source_document_id', 'is_manual',
            'created_by', 'created_by_name', 'created_at',
        ]
        read_only_fields = ['status', 'created_by', 'created_at', 'number']

    def validate_lines(self, lines):
        if len(lines) < 2:
            raise serializers.ValidationError(
                "Операция должна содержать минимум 2 строки (Дт и Кт)."
            )

        debit_total  = sum(l['amount'] for l in lines if l['side'] == 'debit')
        credit_total = sum(l['amount'] for l in lines if l['side'] == 'credit')

        if debit_total != credit_total:
            raise serializers.ValidationError(
                f"Дт ({debit_total}) ≠ Кт ({credit_total}). Операция не сбалансирована."
            )

        if debit_total == 0:
            raise serializers.ValidationError("Сумма операции не может быть равна нулю.")

        return lines
    
    
    def validate_branch(self, branch):
        user = self.context['request'].user
        if user.is_superuser:
            return branch
        user_branches, _ = get_user_scope(user)
        if user_branches:
            if not branch:
                raise serializers.ValidationError(
                    "Выберите филиал в правой панели перед созданием операции."
                )
            if branch.pk not in user_branches:
                raise serializers.ValidationError("Нет доступа к этому филиалу.")
        return branch

    @transaction.atomic
    def create(self, validated_data):
        lines_data = validated_data.pop('lines')
        user = self.context['request'].user

        # ✅ Автоподстановка branch, если у пользователя ровно один филиал в scope
        if not validated_data.get('branch') and not user.is_superuser:
            user_branches, _ = get_user_scope(user)
            if len(user_branches) == 1:
                from accounting.models import Branch
                validated_data['branch'] = Branch.objects.get(pk=user_branches[0])

        journal_entry = JournalEntry.objects.create(
            **validated_data,
            created_by=user,
            number=generate_journal_number(),
        )
        self._create_lines(journal_entry, lines_data)
        return journal_entry

    @transaction.atomic
    def update(self, instance, validated_data):
        # ✅ Проводки, сгенерированные документом, редактируются только через сам
        # документ (см. CLAUDE.md/обсуждение: изменение document-проводок из журнала
        # запрещено) — иначе журнал и документ разойдутся (документ думает, что он
        # всё ещё проведён с определённой суммой, а проводка под ним уже другая).
        if instance.source_document_id:
            raise serializers.ValidationError(
                "Эта проводка создана документом — редактируйте сам документ, а не проводку в журнале."
            )
        if instance.status == JournalEntry.Status.POSTED:
            raise serializers.ValidationError(
                "Нельзя редактировать проведённую операцию. Сначала отмените проведение."
            )

        lines_data = validated_data.pop('lines', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if lines_data is not None:
            instance.lines.all().delete()
            self._create_lines(instance, lines_data)

        return instance

    def _create_lines(self, journal_entry, lines_data):
        lines = [
            TransactionLine(
                journal_entry=journal_entry,
                order=idx,
                # **line_data,
                **{k: v for k, v in line_data.items() if k != "order"},
            )
            for idx, line_data in enumerate(lines_data)
        ]
        TransactionLine.objects.bulk_create(lines)

    def validate_date(self, value):
        # При создании и редактировании проверяем дату — включая жёсткое
        # последовательное правило по складу (см. check_period_open), поэтому
        # warehouse нужно взять из сырых входных данных (validate_<field>
        # вызывается раньше object-level validate(), self.instance/warehouse
        # ещё не гарантированно установлены).
        warehouse_id = self.initial_data.get('warehouse') or (self.instance.warehouse_id if self.instance else None)
        try:
            check_period_open(value, warehouse_id=warehouse_id)
        except Exception as e:
            raise serializers.ValidationError(str(e))
        return value
    
# =====================================================================
# КРАТКИЙ СЕРИАЛИЗАТОР (для списков, без строк)
# =====================================================================

class JournalEntryListSerializer(serializers.ModelSerializer):
    status_display  = serializers.CharField(source='get_status_display', read_only=True)
    # created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    branch_name     = serializers.CharField(source='branch.name', read_only=True, default=None) 
    debit_total     = serializers.SerializerMethodField()
    
    debit_accounts = serializers.SerializerMethodField()
    credit_accounts = serializers.SerializerMethodField()
    
    # debit_subcontos = serializers.SerializerMethodField()
    # credit_subcontos = serializers.SerializerMethodField()
    debit_subconto1 = serializers.SerializerMethodField()
    debit_subconto2 = serializers.SerializerMethodField()
    debit_subconto3 = serializers.SerializerMethodField()

    credit_subconto1 = serializers.SerializerMethodField()
    credit_subconto2 = serializers.SerializerMethodField()
    credit_subconto3 = serializers.SerializerMethodField()
    
    def get_created_by_name(self, obj):
        user = obj.created_by
        if not user:
            return None

        name_parts = [user.last_name, user.first_name]
        full_name = " ".join([p for p in name_parts if p])
        return full_name or user.username
    
    def get_debit_accounts(self, obj):
        parts = []

        for line in obj.lines.all():
            if line.side != 'debit':
                continue
            parts.append(line.account.code)

        return ", ".join(parts)

    def get_credit_accounts(self, obj):
        parts = []

        for line in obj.lines.all():
            if line.side != 'credit':
                continue
            parts.append(line.account.code)

        return ", ".join(parts)

    # ✅ Ручная проводка vs сгенерированная документом — см. JournalEntrySerializer.is_manual.
    is_manual = serializers.SerializerMethodField()

    def get_is_manual(self, obj):
        return obj.source_document_id is None

    class Meta:
        model  = JournalEntry


        # fields = [
        #     'id', 'number', 'date', 
        #     'debit_accounts', 'debit_subcontos',   # добавить
        #     'credit_accounts', 'credit_subcontos', # добавить
        #     'status', 'status_display',
        #     'description', 'debit_total', 'created_by_name', 'created_at',
        # ]
        
        fields = [
            'id',
            'number',
            'date',
            'branch_name',

            'debit_accounts',
            'debit_subconto1',
            'debit_subconto2',
            'debit_subconto3',

            'credit_accounts',
            'credit_subconto1',
            'credit_subconto2',
            'credit_subconto3',

            'status',
            'status_display',
            'description',
            'debit_total',
            'created_by_name',
            'created_at',
            'is_manual',
        ]

    def get_debit_total(self, obj):
        # Считается через annotate в queryset во view — здесь просто читаем
        return getattr(obj, 'debit_total', None)
    

    
    def _get_subconto_type_map(self):
        # ✅ TransactionLine.subcontos хранится как {slug: pk} (см. Document.
        # _resolve_account_subcontos) — plain int, а не {"name": ...}. Чтобы вывести
        # читаемое значение (имя контрагента/товара/склада), нужно по slug узнать
        # content_type и подтянуть объект. Кэшируем на инстансе сериализатора —
        # он один на весь list-запрос, так что справочник субконто читается 1 раз.
        if not hasattr(self, '_subconto_type_map'):
            from accounting.models.subconto import SubcontoType
            self._subconto_type_map = {
                st.slug: st.content_type for st in SubcontoType.objects.select_related('content_type').all()
            }
        return self._subconto_type_map

    def _resolve_subconto_label(self, slug, pk):
        if not hasattr(self, '_subconto_label_cache'):
            self._subconto_label_cache = {}
        cache_key = (slug, pk)
        if cache_key in self._subconto_label_cache:
            return self._subconto_label_cache[cache_key]

        label = None
        content_type = self._get_subconto_type_map().get(slug)
        if content_type is not None:
            model = content_type.model_class()
            if model is not None:
                instance = model.objects.filter(pk=pk).first()
                if instance is not None:
                    label = str(instance)

        self._subconto_label_cache[cache_key] = label
        return label

    def _get_subcontos(self, obj, side):
        result = []

        for line in obj.lines.all():
            if line.side != side:
                continue

            if not line.subcontos:
                continue

            for slug, pk in line.subcontos.items():
                if pk is None:
                    continue
                label = self._resolve_subconto_label(slug, pk)
                if label:
                    result.append(label)

        while len(result) < 3:
            result.append("")

        return result[:3]
    
    def get_debit_subconto1(self, obj):
        return self._get_subcontos(obj, 'debit')[0]

    def get_debit_subconto2(self, obj):
        return self._get_subcontos(obj, 'debit')[1]

    def get_debit_subconto3(self, obj):
        return self._get_subcontos(obj, 'debit')[2]


    def get_credit_subconto1(self, obj):
        return self._get_subcontos(obj, 'credit')[0]

    def get_credit_subconto2(self, obj):
        return self._get_subcontos(obj, 'credit')[1]

    def get_credit_subconto3(self, obj):
        return self._get_subcontos(obj, 'credit')[2]


# =====================================================================
# ДВИЖЕНИЯ ПО СКЛАДУ
# =====================================================================

class StockMovementSerializer(serializers.ModelSerializer):
    product_name   = serializers.CharField(source='product.name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    warehouse_to_name = serializers.CharField(
        source='warehouse_to.name', read_only=True, default=None
    )
    direction_display = serializers.CharField(
        source='get_direction_display', read_only=True
    )
    created_by_name = serializers.CharField(
        source='created_by.get_full_name', read_only=True
    )

    class Meta:
        model  = StockMovement
        fields = [
            'id', 'warehouse', 'warehouse_name',
            'warehouse_to', 'warehouse_to_name',
            'product', 'product_name',
            'direction', 'direction_display',
            'quantity', 'cost_price',
            'journal_entry', 'note',
            'created_by', 'created_by_name', 'created_at',
        ]
        read_only_fields = ['created_by', 'created_at']

    def validate(self, attrs):
        direction    = attrs.get('direction')
        warehouse_to = attrs.get('warehouse_to')

        if direction == StockMovement.Direction.MOVE and not warehouse_to:
            raise serializers.ValidationError({
                'warehouse_to': "Укажите склад-получатель для перемещения."
            })
        if direction != StockMovement.Direction.MOVE and warehouse_to:
            raise serializers.ValidationError({
                'warehouse_to': "warehouse_to заполняется только для перемещений."
            })
        return attrs

    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)
    
    
    
class ClosedPeriodSerializer(serializers.ModelSerializer):
    closed_by_name   = serializers.CharField(source='closed_by.username', read_only=True)
    branch_name      = serializers.CharField(source='branch.name', read_only=True)
    warehouse_name   = serializers.CharField(source='warehouse.name', read_only=True)
    scope_display    = serializers.SerializerMethodField()

    class Meta:
        model  = ClosedPeriod
        fields = [
            'id', 'date',
            'branch', 'branch_name',
            'warehouse', 'warehouse_name',
            'scope_display',
            'closed_by', 'closed_by_name',
            'closed_at', 'note',
        ]
        read_only_fields = ['closed_by', 'closed_at']

    def validate_warehouse(self, warehouse):
        # Вариант А: закрытие возможно ТОЛЬКО по конкретному складу.
        # Никаких закрытий "на весь филиал" или "глобально".
        if not warehouse:
            raise serializers.ValidationError(
                "Укажите склад — закрытие дня возможно только по конкретному складу."
            )
        return warehouse

    def validate(self, attrs):
        # branch не участвует в закрытии — если пришёл, игнорируем/обнуляем,
        # чтобы не плодить неявных "закрытий филиала".
        attrs['branch'] = None
        return attrs

    def get_scope_display(self, obj):
        if obj.warehouse:
            return f'Склад: {obj.warehouse.name}'
        return 'Глобально'  # не должно возникать при новых записях
 