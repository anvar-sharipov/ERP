# /backend/users/views/user_views.py
from rest_framework.views import APIView, Response
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from ..serializers.user_serializer import ProfileUpdateSerializer, UserSerializer, UserListSerializer
from ..permissions import HasPermission
from rest_framework import generics
from ..models import User, Role, UserRole
from rest_framework import serializers
from django.db.models import Prefetch
from icecream import ic

# user update edit for admin
class UserManagementView(generics.ListCreateAPIView):
    # Доступ только для тех, кто имеет право 'users:POST'
    permission_classes = [IsAuthenticated, HasPermission('user', 'POST')]
    serializer_class = UserSerializer
    # queryset = User.objects.all()
    def get_queryset(self):
        return User.objects.prefetch_related(
            'userrole_set__role__rolepermission_set__permission'
        ).all()
    
# user update edit for user   
class ProfileUpdateView(generics.UpdateAPIView):
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        # Если нужно, можно менять сериализатор динамически
        return ProfileUpdateSerializer

    def get_object(self):
        return self.request.user  # Гарантирует, что юзер правит только СВОЙ профиль



class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = UserSerializer

    def get_queryset(self):
        return User.objects.prefetch_related(
            'userrole_set__role__rolepermission_set__permission'
        ).all()

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated(), HasPermission('user', 'GET')()]
        elif self.request.method in ['PUT', 'PATCH']:
            return [IsAuthenticated(), HasPermission('user', 'PUT')()]
        elif self.request.method == 'DELETE':
            return [IsAuthenticated(), HasPermission('user', 'DELETE')()]
        return [IsAuthenticated()]
    
    
    
class MeView(APIView):
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
    permission_classes = [IsAuthenticated, HasPermission('user', 'GET')]
    serializer_class = UserListSerializer
    
    
    def get_queryset(self):
        # Явно говорим Django: "Загрузи все роли для этих пользователей одним махом"
        return User.objects.prefetch_related(
            Prefetch(
                'userrole_set',
                queryset=UserRole.objects.select_related('role')
            )
        ).all()
    