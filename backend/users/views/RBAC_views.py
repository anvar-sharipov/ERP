# /backend/users/views/RBAC_views.py
from rest_framework.permissions import IsAuthenticated
from ..serializers.user_serializer import RoleSerializer
from ..permissions import HasPermission
from rest_framework import generics
from ..models import Role, Permission, UserRole, User
from collections import defaultdict
from rest_framework.response import Response

from rest_framework.views import APIView


# class RoleListView(generics.ListCreateAPIView):
#     permission_classes = [IsAuthenticated, HasPermission('role', 'GET')]
#     serializer_class = RoleSerializer
#     queryset = Role.objects.all()

class RoleListView(generics.ListCreateAPIView):
    serializer_class = RoleSerializer
    queryset = Role.objects.all()
    
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated(), HasPermission('role', 'GET')()]
        return [IsAuthenticated(), HasPermission('role', 'POST')()]
    
    
class PermissionMatrixView(APIView):
    def get(self, request):
        # Группируем права: { "users": ["GET", "POST"...], "accounting": [...] }
        perms = Permission.objects.all()
        matrix = defaultdict(list)
        for p in perms:
            matrix[p.resource].append({"id": p.id, "action": p.action})
        return Response(matrix)
    
    
# class RoleDetailView(generics.RetrieveUpdateDestroyAPIView):
#     permission_classes = [IsAuthenticated, HasPermission('role', 'GET')]
#     serializer_class = RoleSerializer
#     queryset = Role.objects.all()


class RoleDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = RoleSerializer
    queryset = Role.objects.all()
    
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated(), HasPermission('role', 'GET')()]
        elif self.request.method in ['PUT', 'PATCH']:
            return [IsAuthenticated(), HasPermission('role', 'PUT')()]
        elif self.request.method == 'DELETE':
            return [IsAuthenticated(), HasPermission('role', 'DELETE')()]
        return [IsAuthenticated()]
    
    
# class AssignRoleView(APIView):
#     def post(self, request, user_id):
#         # 1. Получаем пользователя
#         user = User.objects.get(id=user_id)
#         # 2. Получаем список ID ролей из запроса
#         role_ids = request.data.get('roles', []) 
        
#         # 3. Очищаем старые роли и назначаем новые
#         user.userrole_set.all().delete() # Предполагаем наличие связи UserRole
#         for role_id in role_ids:
#             UserRole.objects.create(user=user, role_id=role_id)
            
#         return Response({"status": "roles updated"})

class AssignRoleView(APIView):
    permission_classes = [IsAuthenticated, HasPermission('userrole', 'PUT')]
    
    def post(self, request, user_id):
        user = User.objects.get(id=user_id)
        role_ids = request.data.get('roles', []) 
        user.userrole_set.all().delete()
        for role_id in role_ids:
            UserRole.objects.create(user=user, role_id=role_id)
        return Response({"status": "roles updated"})
    
    
    
    