from rest_framework import serializers
from ..models import PlatformContact


class PlatformContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlatformContact
        fields = ['full_name', 'phone', 'phone2', 'email', 'telegram', 'address', 'photo']