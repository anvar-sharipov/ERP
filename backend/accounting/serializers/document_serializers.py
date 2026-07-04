from rest_framework import serializers
from accounting.models import (
    Document, DocumentItem, DocumentParticipant,
    Product, Unit, PriceType, Warehouse, Counterparty, Employee
)
from accounting.models.company import Branch
from ..serializers.product_serializers import BundleItemSerializer, ProductImageSerializer


# ── Short serializers (для detail-полей) ──────────────────────────────────────


class ProductShortSerializer(serializers.ModelSerializer):
    """Используется в DocumentFormPage для списка товаров"""
    unit_detail = serializers.SerializerMethodField()
    prices = serializers.SerializerMethodField()
    bundle_items = BundleItemSerializer(many=True, read_only=True)
    main_image = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "sku",
            "barcode",
            "unit",
            "unit_detail",
            "cost_price",
            "prices",
            "bundle_items",
            "main_image",
            "weight", "volume_m3", "length", "width", "height",
        ]

    def get_unit_detail(self, obj):
        if obj.unit:
            return {"id": obj.unit.id, "name": obj.unit.name}
        return None

    def get_prices(self, obj):
        return [
            {"price_type": p.price_type_id, "price": str(p.price)}
            for p in obj.prices.filter(is_active=True)
        ]

    def get_main_image(self, obj):
        images = obj.images.all()
        main = next((img for img in images if img.is_main), None)
        if main is None and images:
            main = images[0]
        if main:
            return ProductImageSerializer(main, context=self.context).data
        return None



class UnitShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unit
        fields = ['id', 'name']


class PriceTypeShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = PriceType
        fields = ['id', 'name']


class WarehouseShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = Warehouse
        fields = ['id', 'name']


class CounterpartyShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = Counterparty
        fields = ['id', 'name']


class EmployeeShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = ['id', 'full_name']


class BranchShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ['id', 'name']


# ── DocumentItem ──────────────────────────────────────────────────────────────

class DocumentItemSerializer(serializers.ModelSerializer):
    product_detail   = ProductShortSerializer(source='product', read_only=True)
    unit_detail      = UnitShortSerializer(source='unit', read_only=True)
    price_type_detail = PriceTypeShortSerializer(source='price_type', read_only=True)

    # Вычисляемое поле: итого по строке
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = DocumentItem
        fields = [
            'id', 'line_no',
            'product', 'product_detail',
            'unit', 'unit_detail',
            'quantity',
            'price', 'price_type', 'price_type_detail',
            'discount_percent',
            'cost_price',
            'line_total',
            'extra_data',
        ]

    def get_line_total(self, obj):
        total = obj.price * obj.quantity
        if obj.discount_percent:
            total = total * (1 - obj.discount_percent / 100)
        return total.quantize(__import__('decimal').Decimal('0.01'))


# ── DocumentParticipant ───────────────────────────────────────────────────────

class DocumentParticipantSerializer(serializers.ModelSerializer):
    employee_detail = EmployeeShortSerializer(source='employee', read_only=True)
    # role — свободный текст (название должности), больше не choices-поле
    role_display    = serializers.CharField(source='role', read_only=True)

    class Meta:
        model = DocumentParticipant
        fields = [
            'id',
            'employee', 'employee_detail',
            'role', 'role_display',
        ]


# ── Document ──────────────────────────────────────────────────────────────────

class DocumentSerializer(serializers.ModelSerializer):
    # Вложенные данные (read only)
    items        = DocumentItemSerializer(many=True, read_only=True)
    participants = DocumentParticipantSerializer(many=True, read_only=True)

    # Detail-поля
    warehouse_detail         = WarehouseShortSerializer(source='warehouse', read_only=True)
    warehouse_to_detail      = WarehouseShortSerializer(source='warehouse_to', read_only=True)
    counterparty_detail      = CounterpartyShortSerializer(source='counterparty', read_only=True)
    branch_detail            = BranchShortSerializer(source='branch', read_only=True)
    default_price_type_detail = PriceTypeShortSerializer(source='default_price_type', read_only=True)

    # Человекочитаемые choices
    document_type_display = serializers.CharField(source='get_document_type_display', read_only=True)
    status_display        = serializers.CharField(source='get_status_display', read_only=True)

    # Сальдо контрагента — считаем на лету
    counterparty_balance = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            'id', 'number',
            'document_type', 'document_type_display',
            'status', 'status_display',
            'date',

            'warehouse', 'warehouse_detail',
            'warehouse_to', 'warehouse_to_detail',
            'branch', 'branch_detail',
            'counterparty', 'counterparty_detail',
            'counterparty_balance',
            'base_document',
            'default_price_type', 'default_price_type_detail',

            'subtotal', 'discount_percent', 'discount_amount',
            'total', 'total_profit',

            'note', 'extra_data',

            'items',
            'participants',

            'posted_at', 'posted_by',
            'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'number', 'subtotal', 'discount_amount',
            'total', 'total_profit',
            'posted_at', 'posted_by',
            'created_at', 'updated_at',
        ]

    def get_counterparty_balance(self, obj):
        """
        Простое сальдо: сумма всех OUT-документов минус IN-документов
        по данному контрагенту (проведённые).
        Позже можно заменить на расчёт через TransactionLine.
        """
        if not obj.counterparty_id:
            return None
        from django.db.models import Sum, Q
        from decimal import Decimal

        qs = Document.objects.filter(
            counterparty_id=obj.counterparty_id,
            status=Document.Status.POSTED,
        )
        out = qs.filter(
            document_type__in=[Document.Type.OUT, Document.Type.RETURN_IN]
        ).aggregate(s=Sum('total'))['s'] or Decimal('0')

        inp = qs.filter(
            document_type__in=[Document.Type.IN, Document.Type.RETURN_OUT]
        ).aggregate(s=Sum('total'))['s'] or Decimal('0')

        return out - inp


# ── DocumentListSerializer (лёгкий, без items/participants) ───────────────────

class DocumentListSerializer(serializers.ModelSerializer):
    document_type_display = serializers.CharField(source='get_document_type_display', read_only=True)
    status_display        = serializers.CharField(source='get_status_display', read_only=True)
    counterparty_detail   = CounterpartyShortSerializer(source='counterparty', read_only=True)
    warehouse_detail      = WarehouseShortSerializer(source='warehouse', read_only=True)
    branch_detail         = BranchShortSerializer(source='branch', read_only=True) 

    class Meta:
        model = Document
        fields = [
            'id', 'number',
            'document_type', 'document_type_display',
            'status', 'status_display',
            'date',
            'branch', 'branch_detail',
            'counterparty', 'counterparty_detail',
            'warehouse', 'warehouse_detail',
            'total',
            'created_at',
        ]