# # backend/accounting/views/directory_views.py
# backend/accounting/views/directory_views.py
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from ..models import Directory, DirectoryField
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


class DirectoryFieldViewSet(viewsets.ModelViewSet):
    serializer_class = DirectoryFieldSerializer

    def get_queryset(self):
        qs = DirectoryField.objects.order_by("order")
        directory_id = self.request.query_params.get("directory")
        if directory_id:
            qs = qs.filter(directory_id=directory_id)
        return qs

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated(), HasPermission('directoryfield', 'GET')()]
        elif self.action == 'create':
            return [IsAuthenticated(), HasPermission('directoryfield', 'POST')()]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), HasPermission('directoryfield', 'PUT')()]
        elif self.action == 'destroy':
            return [IsAuthenticated(), HasPermission('directoryfield', 'DELETE')()]
        return [IsAuthenticated()]
    
    
    
# from rest_framework import viewsets
# from rest_framework.permissions import IsAuthenticated
# from ..models import Directory, DirectoryRecord
# from ..serializers.directory_serializers import DirectorySerializer, DirectoryFieldSerializer
# from users.permissions import HasPermission


# class DirectoryViewSet(viewsets.ModelViewSet):
#     queryset = Directory.objects.order_by("name")
#     serializer_class = DirectorySerializer
    
#     def get_permissions(self):
#         if self.action in ['list', 'retrieve']:
#             return [IsAuthenticated(), HasPermission('directory', 'GET')()]
#         elif self.action == 'create':
#             return [IsAuthenticated(), HasPermission('directory', 'POST')()]
#         elif self.action in ['update', 'partial_update']:
#             return [IsAuthenticated(), HasPermission('directory', 'PUT')()]
#         elif self.action == 'destroy':
#             return [IsAuthenticated(), HasPermission('directory', 'DELETE')()]
#         return [IsAuthenticated()]