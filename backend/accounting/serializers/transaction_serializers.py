# accounting/serializers/transaction_serializers.py

from rest_framework import serializers
from django.db import transaction
from django.contrib.contenttypes.models import ContentType
from accounting.utils import check_period_open
from rest_framework import serializers as drf_serializers


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
        extra_kwargs = {
            'account': {'write_only': True},
        }

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

    # Read-only поля для отображения
    created_by_name = serializers.CharField(
        source='created_by.get_full_name', read_only=True
    )
    status_display = serializers.CharField(
        source='get_status_display', read_only=True
    )

    class Meta:
        model  = JournalEntry
        fields = [
            'id', 'number', 'date', 'status', 'status_display',
            'description', 'lines',
            'source_document_type', 'source_document_id',
            'created_by', 'created_by_name', 'created_at',
        ]
        read_only_fields = ['status', 'created_by', 'created_at']

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

    @transaction.atomic
    def create(self, validated_data):
        lines_data   = validated_data.pop('lines')
        user         = self.context['request'].user
        journal_entry = JournalEntry.objects.create(
            **validated_data,
            created_by=user,
        )
        self._create_lines(journal_entry, lines_data)
        return journal_entry

    @transaction.atomic
    def update(self, instance, validated_data):
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
                **line_data,
            )
            for idx, line_data in enumerate(lines_data)
        ]
        TransactionLine.objects.bulk_create(lines)

    def validate_date(self, value):
        # При создании и редактировании проверяем дату
        try:
            check_period_open(value)
        except Exception as e:
            raise serializers.ValidationError(str(e))
        return value
    
# =====================================================================
# КРАТКИЙ СЕРИАЛИЗАТОР (для списков, без строк)
# =====================================================================

class JournalEntryListSerializer(serializers.ModelSerializer):
    status_display  = serializers.CharField(source='get_status_display', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    debit_total     = serializers.SerializerMethodField()

    class Meta:
        model  = JournalEntry
        fields = [
            'id', 'number', 'date', 'status', 'status_display',
            'description', 'debit_total', 'created_by_name', 'created_at',
        ]

    def get_debit_total(self, obj):
        # Считается через annotate в queryset во view — здесь просто читаем
        return getattr(obj, 'debit_total', None)


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
    closed_by_name = serializers.CharField(
        source='closed_by.username', read_only=True
    )
    class Meta:
        model  = ClosedPeriod
        fields = ['id', 'date', 'closed_by', 'closed_by_name', 'closed_at', 'note']
        read_only_fields = ['closed_by', 'closed_at']