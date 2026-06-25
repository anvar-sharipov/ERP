# /backend/users/views/user_views.py
from rest_framework.views import APIView, Response
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from ..serializers.user_serializer import ProfileUpdateSerializer, UserSerializer, UserListSerializer
from rest_framework import generics
from ..models import User, UserRole
from django.db.models import Prefetch
from icecream import ic
from users.permissions import _rbac


# users/views/user_views.py

from rest_framework import generics
from users.models import User
from ..serializers.user_serializer import (
    UserLookupSerializer,
)
from users.permissions import _rbac

# user update edit for admin
class UserManagementView(generics.ListCreateAPIView):
    pagination_class = None
    # Доступ только для тех, кто имеет право 'users:POST'
    # permission_classes = [IsAuthenticated, HasPermission('user', 'POST')]
    serializer_class = UserSerializer
    
    def get_permissions(self):
        # GET -> 'list', POST -> 'create'
        action = 'list' if self.request.method == 'GET' else 'create'
        return _rbac(action, "user")
    # queryset = User.objects.all()
    
    def get_queryset(self):
        return User.objects.prefetch_related(
            'userrole_set__role__rolepermission_set__permission'
        ).all()
    
# user update edit for user   
class ProfileUpdateView(generics.UpdateAPIView):
    pagination_class = None
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        # Если нужно, можно менять сериализатор динамически
        return ProfileUpdateSerializer

    def get_object(self):
        return self.request.user  # Гарантирует, что юзер правит только СВОЙ профиль



class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    pagination_class = None
    serializer_class = UserSerializer

    def get_queryset(self):
        return User.objects.prefetch_related(
            'userrole_set__role__rolepermission_set__permission'
        ).all()

    def get_permissions(self):
        action_map = {
            'GET': 'retrieve',
            'PUT': 'update',
            'PATCH': 'update',
            'DELETE': 'destroy'
        }
        action = action_map.get(self.request.method, 'retrieve')
        return _rbac(action, "user")
    
    
    
class MeView(APIView):
    pagination_class = None
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        user = (
            User.objects
            .prefetch_related(
                "userrole_set__role__rolepermission_set__permission"
            )
            .get(pk=request.user.pk)
        )

        serializer = UserSerializer(user)

        return Response(serializer.data)
  
    
    
class UserListView(generics.ListAPIView):
    pagination_class = None
    # permission_classes = [IsAuthenticated, HasPermission('user', 'GET')]
    serializer_class = UserListSerializer
    
    
    def get_permissions(self):
        return _rbac('list', 'user')
    
    
    def get_queryset(self):
        # Явно говорим Django: "Загрузи все роли для этих пользователей одним махом"
        return User.objects.prefetch_related(
            Prefetch(
                'userrole_set',
                queryset=UserRole.objects.select_related('role')
            )
        ).all()




class UserLookupView(generics.ListAPIView):
    pagination_class = None
    serializer_class = UserLookupSerializer

    def get_permissions(self):
        return _rbac("list", "user")

    def get_queryset(self):
        qs = (
            User.objects
            .only(
                "id",
                "username",
                "first_name",
                "last_name",
                "is_active",
            )
            .filter(is_active=True)
            .order_by("username")
        )

        search = self.request.query_params.get("search")

        if search:
            qs = qs.filter(
                username__icontains=search
            )

        return qs
   
   
   
   
class MyScopeView(APIView):
    """
    GET /users/my-scope/
    Возвращает список складов и филиалов доступных текущему пользователю.
    Если записей нет — пользователь видит всё (is_global=True).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from accounting.models import UserScope, Warehouse, Branch

        scopes = UserScope.objects.filter(
            user=request.user
        ).select_related('branch', 'warehouse')

        if not scopes.exists():
            warehouses = list(Warehouse.objects.filter(is_active=True).values('id', 'name', 'branch'))
            branches   = list(Branch.objects.filter(is_active=True).values('id', 'name'))
            return Response({
                'is_global':  True,
                'warehouses': warehouses,
                'branches':   branches,
            })

        warehouse_ids = scopes.filter(warehouse__isnull=False).values_list('warehouse_id', flat=True)
        branch_ids    = scopes.filter(branch__isnull=False).values_list('branch_id', flat=True)

        warehouses = list(Warehouse.objects.filter(id__in=warehouse_ids).values('id', 'name', 'branch'))
        branches   = list(Branch.objects.filter(id__in=branch_ids).values('id', 'name'))

        return Response({
            'is_global':  False,
            'warehouses': warehouses,
            'branches':   branches,
        })
 
 
        