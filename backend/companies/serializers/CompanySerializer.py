# backend/companies/serializers/CompanySerializer.py
from rest_framework import serializers
from ..models import Company


class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = "__all__"
        

class CompanyUpdateSerializer(serializers.ModelSerializer):
    """Только то, что реально можно менять у живого тенанта."""
    class Meta:
        model = Company
        fields = ["name", "is_active"]
        # schema_name намеренно НЕ включаем — его менять нельзя через API