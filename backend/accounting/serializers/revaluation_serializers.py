from rest_framework import serializers

from accounting.models.revaluation import ProductRevaluation


class ProductRevaluationSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    document_number = serializers.CharField(source='document.number', read_only=True, default=None)
    created_by_display = serializers.SerializerMethodField()

    def get_created_by_display(self, obj):
        if not obj.created_by:
            return 'Система'
        return obj.created_by.get_full_name() or obj.created_by.username

    class Meta:
        model = ProductRevaluation
        fields = [
            'id',
            'product', 'product_name', 'product_sku',
            'warehouse', 'warehouse_name',
            'branch', 'branch_name',
            'document', 'document_number',
            'date',
            'quantity', 'old_cost_price', 'new_cost_price', 'diff_amount',
            'created_by', 'created_by_display', 'created_at',
        ]
