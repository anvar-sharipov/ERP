from rest_framework import serializers
from ..models import Directory, DirectoryField, DirectoryRecord
from django.utils.text import slugify


        
        
class DirectorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Directory
        fields = ["id", "name", "slug", "icon", "description", "is_active", "created_at", "updated_at", "color"]
        
        
class DirectoryFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = DirectoryField
        fields = ["id", "directory", "name", "slug", "field_type", "is_required", "order", "ref_directory"]