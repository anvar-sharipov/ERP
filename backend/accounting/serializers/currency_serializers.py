# backend/accounting/serializers/currency_serializers.py
from rest_framework import serializers
from ..models import Currency, ExchangeRate


class CurrencySerializer(serializers.ModelSerializer):
    class Meta:
        model = Currency
        fields = ['id', 'code', 'name', 'symbol', 'is_active']


class ExchangeRateSerializer(serializers.ModelSerializer):
    currency_code = serializers.CharField(source='currency.code', read_only=True)
    currency_symbol = serializers.CharField(source='currency.symbol', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = ExchangeRate
        fields = [
            'id',
            'currency',
            'currency_code',
            'currency_symbol',
            'rate',
            'date',
            'created_by',
            'created_by_username',
            'created_at',
        ]
        read_only_fields = ['created_by', 'created_at']