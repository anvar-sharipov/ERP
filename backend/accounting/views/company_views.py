# backend/accounting/views/company_views.py
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from users.permissions import HasPermission
from django.db import connection
from ..models import CompanyProfile, Branch
from users.models import UserRole
from rest_framework import serializers
from ..serializers.company_serializers import (
    CompanyProfileAdminSerializer, 
    CompanyProfileUserSerializer,
    # CompanyProfileCreateUpdateSerializer,
    BranchAdminSerializer,
    BranchUserSerializer,
    # BranchCreateUpdateSerializer
    
)



class CompanyProfileViewSet(viewsets.ModelViewSet):
    queryset = CompanyProfile.objects.prefetch_related('branches').all()

    def get_serializer_class(self):
        from users.models import UserRole
        user_perms = set(
            UserRole.objects.filter(user=self.request.user)
            .values_list('role__rolepermission__permission__resource',
                        'role__rolepermission__permission__action')
        )
        if ('companyprofile', 'POST') in user_perms or self.request.user.is_superuser:
            return CompanyProfileAdminSerializer
        return CompanyProfileUserSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated(), HasPermission('companyprofile', 'GET')()]
        elif self.action == 'create':
            return [IsAuthenticated(), HasPermission('companyprofile', 'POST')()]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), HasPermission('companyprofile', 'PUT')()]
        elif self.action == 'destroy':
            return [IsAuthenticated(), HasPermission('companyprofile', 'DELETE')()]
        return [IsAuthenticated()]
            
        # return [permission() for permission in permission_classes]
    
    # def create(self, request, *args, **kwargs):
    #     print("DATA:", request.data)
    #     serializer = CompanyProfileCreateUpdateSerializer(data=request.data)
    #     print("VALID:", serializer.is_valid())
    #     print("ERRORS:", serializer.errors)
    #     return super().create(request, *args, **kwargs)
  
  
class BranchViewSet(viewsets.ModelViewSet):
    # queryset = Branch.objects.all()
    queryset = Branch.objects.select_related('company_profile').all()
    
    def get_serializer_class(self):
        
        user_perms = set(
            UserRole.objects.filter(user=self.request.user)
            .values_list('role__rolepermission__permission__resource',
                        'role__rolepermission__permission__action')
        )
        # print(user_perms)
        if ('branch', 'POST') in user_perms or self.request.user.is_superuser:
            return BranchAdminSerializer  # было CompanyProfileAdminSerializer
        return BranchUserSerializer       # было CompanyProfileUserSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated(), HasPermission('branch', 'GET')()]
        elif self.action == 'create':
            return [IsAuthenticated(), HasPermission('branch', 'POST')()]
        elif self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), HasPermission('branch', 'PUT')()]
        elif self.action == 'destroy':
            return [IsAuthenticated(), HasPermission('branch', 'DELETE')()]
        return [IsAuthenticated()]
    
    # def perform_create(self, serializer):
    #     # Допустим, профиль компании у нас всегда один на тенант или мы можем его найти
    #     try:
    #         profile = CompanyProfile.objects.first() # Или логика поиска профиля
    #         serializer.save(company_profile=profile)
    #     except CompanyProfile.DoesNotExist:
    #         raise serializers.ValidationError("Не найден профиль компании.")
    
    def create(self, request, *args, **kwargs):
        print("DATA:", request.data)
        serializer = BranchAdminSerializer(data=request.data)
        print("VALID:", serializer.is_valid())
        print("ERRORS:", serializer.errors)
        return super().create(request, *args, **kwargs)

# def list(self, request, *args, **kwargs):
#         response = super().list(request, *args, **kwargs)
#         print(f"Количество запросов к БД: {len(connection.queries)}")
#         return response


