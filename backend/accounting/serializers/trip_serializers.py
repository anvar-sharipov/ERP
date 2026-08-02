# backend/accounting/serializers/trip_serializers.py
from rest_framework import serializers

from accounting.models import Trip, Document
from .document_serializers import EmployeeShortSerializer, WarehouseShortSerializer, CounterpartyShortSerializer


class TripDocumentSerializer(serializers.ModelSerializer):
    """Короткое представление накладной внутри рейса (TripDetailPage.tsx)."""
    counterparty_detail = CounterpartyShortSerializer(source='counterparty', read_only=True)

    class Meta:
        model = Document
        fields = [
            'id', 'number', 'date',
            'counterparty', 'counterparty_detail',
            'total', 'delivery_percent',
        ]


class TripSerializer(serializers.ModelSerializer):
    driver_detail = EmployeeShortSerializer(source='driver', read_only=True)
    warehouse_detail = WarehouseShortSerializer(source='warehouse', read_only=True)
    warehouse_currency = serializers.CharField(source='warehouse.currency', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    delivered_by_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    documents = TripDocumentSerializer(many=True, read_only=True)
    documents_count = serializers.IntegerField(source='documents.count', read_only=True)
    documents_total = serializers.SerializerMethodField()

    class Meta:
        model = Trip
        fields = [
            'id',
            'driver', 'driver_detail',
            'warehouse', 'warehouse_detail', 'warehouse_currency',
            'date', 'status', 'status_display', 'comment',
            'salary_total', 'salary_total_tmt', 'exchange_rate_used',
            'documents', 'documents_count', 'documents_total',
            'delivered_at', 'delivered_by', 'delivered_by_name',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'status', 'salary_total', 'salary_total_tmt', 'exchange_rate_used',
            'delivered_at', 'delivered_by',
            'created_by', 'created_at', 'updated_at',
        ]

    def get_delivered_by_name(self, obj):
        if not obj.delivered_by_id:
            return None
        return obj.delivered_by.get_full_name() or obj.delivered_by.username

    def get_created_by_name(self, obj):
        if not obj.created_by_id:
            return None
        return obj.created_by.get_full_name() or obj.created_by.username

    def get_documents_total(self, obj):
        return sum((d.total for d in obj.documents.all()), 0)


class TripListSerializer(TripSerializer):
    """Список рейсов (TripsListPage.tsx) — без вложенных накладных, чтобы не тянуть
    лишние JOIN'ы на каждую строку таблицы; documents_count/total через агрегаты
    ViewSet.get_queryset() (annotate), не через .all() на каждый объект."""

    class Meta(TripSerializer.Meta):
        fields = [f for f in TripSerializer.Meta.fields if f != 'documents']
