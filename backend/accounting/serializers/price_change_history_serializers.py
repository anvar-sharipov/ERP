from rest_framework import serializers

from accounting.models.price_change_history import PriceChangeHistory


class PriceChangeHistorySerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    product_unit = serializers.SerializerMethodField()
    price_type_name = serializers.SerializerMethodField()
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True, default=None)
    branch_name = serializers.CharField(source='branch.name', read_only=True, default=None)
    document_number = serializers.CharField(source='document.number', read_only=True, default=None)
    created_by_display = serializers.SerializerMethodField()

    def get_product_unit(self, obj):
        return obj.product.unit.short_name if obj.product.unit_id else ''

    def get_price_type_name(self, obj):
        return obj.price_type.name if obj.price_type_id else 'Себестоимость'

    def get_created_by_display(self, obj):
        if not obj.created_by:
            return 'Система'
        return obj.created_by.get_full_name() or obj.created_by.username

    class Meta:
        model = PriceChangeHistory
        fields = [
            'id',
            'product', 'product_name', 'product_sku', 'product_unit',
            'price_type', 'price_type_name',
            'warehouse', 'warehouse_name',
            'branch', 'branch_name',
            'document', 'document_number',
            'date',
            'old_price', 'new_price', 'quantity_at_change', 'old_sum', 'new_sum', 'diff_amount',
            'created_by', 'created_by_display', 'created_at',
        ]
