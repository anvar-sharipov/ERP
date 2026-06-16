# /backend/users/views/RBAC_views.py
from ..serializers.user_serializer import RoleSerializer
from rest_framework import generics
from ..models import Role, Permission, UserRole, User
from collections import defaultdict
from rest_framework.response import Response

from rest_framework.views import APIView
from users.permissions import _rbac


class RoleListView(generics.ListCreateAPIView):
    serializer_class = RoleSerializer
    queryset = Role.objects.all()
    
    def get_permissions(self):
        action = 'list' if self.request.method == 'GET' else 'create'
        return _rbac(action, "role")

    
class PermissionMatrixView(APIView):
    def get(self, request):
        # Группируем права: { "users": ["GET", "POST"...], "accounting": [...] }
        perms = Permission.objects.all()
        matrix = defaultdict(list)
        for p in perms:
            matrix[p.resource].append({"id": p.id, "action": p.action})
        return Response(matrix)
    

class RoleDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = RoleSerializer
    queryset = Role.objects.all()
    
    def get_permissions(self):
        action_map = {
            'GET': 'retrieve',
            'PUT': 'update',
            'PATCH': 'update',
            'DELETE': 'destroy'
        }
        action = action_map.get(self.request.method, 'retrieve')
        return _rbac(action, "role")


class AssignRoleView(APIView):

    
    def get_permissions(self):
        # Мы явно указываем, что это действие равно 'update' (или 'create', зависит от бизнес-логики)
        return _rbac('update', 'userrole')
    
    def post(self, request, user_id):
        user = User.objects.get(id=user_id)
        role_ids = request.data.get('roles', []) 
        user.userrole_set.all().delete()
        for role_id in role_ids:
            UserRole.objects.create(user=user, role_id=role_id)
        return Response({"status": "roles updated"})
    
    
    
    