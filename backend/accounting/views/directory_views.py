from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from ..models import Directory, DirectoryRecord
from ..serializers.directory_serializers import DirectorySerializer, DirectoryFieldSerializer
from users.permissions import HasPermission


class DirectoryViewSet(viewsets.ModelViewSet):
    queryset = Directory.objects.order_by("name")
    serializer_class = DirectorySerializer
    
    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated(), HasPermission('directory', 'GET')()]
        elif self.action == 'create':
            return [IsAuthenticated(), HasPermission('directory', 'POST')()]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), HasPermission('directory', 'PUT')()]
        elif self.action == 'destroy':
            return [IsAuthenticated(), HasPermission('directory', 'DELETE')()]
        return [IsAuthenticated()]