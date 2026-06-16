# # backend/accounting/views/directory_views.py
# backend/accounting/views/directory_views.py
from rest_framework import viewsets
from ..models import Directory, DirectoryField, DirectoryRecord
from ..serializers.directory_serializers import DirectorySerializer, DirectoryFieldSerializer, DirectoryRecordSerializer
from users.permissions import _rbac


class DirectoryViewSet(viewsets.ModelViewSet):
    queryset = Directory.objects.order_by("name")
    serializer_class = DirectorySerializer

    def get_permissions(self):
        return _rbac(self.action, "directory")


class DirectoryFieldViewSet(viewsets.ModelViewSet):
    serializer_class = DirectoryFieldSerializer

    def get_queryset(self):
        qs = DirectoryField.objects.order_by("order")
        directory_id = self.request.query_params.get("directory")
        if directory_id:
            qs = qs.filter(directory_id=directory_id)
        return qs

    def get_permissions(self):
        return _rbac(self.action, "directoryfield")

    
class DirectoryRecordViewSet(viewsets.ModelViewSet):
    serializer_class = DirectoryRecordSerializer

    def get_queryset(self):
        qs = DirectoryRecord.objects.order_by("-created_at")
        directory_id = self.request.query_params.get("directory")
        if directory_id:
            qs = qs.filter(directory_id=directory_id)
        return qs

    def get_permissions(self):
        return _rbac(self.action, "directoryrecord")



