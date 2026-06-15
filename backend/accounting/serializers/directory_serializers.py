# backend/accounting/serializers/directory_serializers.py
from rest_framework import serializers
from django.utils.text import slugify
from ..models import Directory, DirectoryField, DirectoryRecord


class DirectorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Directory
        fields = ["id", "name", "slug", "icon", "description", "is_active", "created_at", "updated_at", "color"]


class DirectoryFieldSerializer(serializers.ModelSerializer):
    # Для отображения человекочитаемого типа поля (text → "Текст")
    field_type_display = serializers.CharField(source='get_field_type_display', read_only=True)

    class Meta:
        model = DirectoryField
        fields = ["id", "directory", "name", "slug", "field_type", "field_type_display", "is_required", "order", "ref_directory"]

    def validate_slug(self, value):
        # Слаг только латиница, без дефисов — заменяем на подчёркивание
        return slugify(value, allow_unicode=False).replace('-', '_')

    def create(self, validated_data):
        # Если slug не передан — генерируем из name
        if not validated_data.get('slug'):
            validated_data['slug'] = slugify(validated_data['name'], allow_unicode=False).replace('-', '_')
        return super().create(validated_data)
