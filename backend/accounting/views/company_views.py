# backend/accounting/views/company_views.py
from rest_framework import viewsets
from ..models import CompanyProfile, Branch
from users.models import UserRole
from ..serializers.company_serializers import (
    CompanyProfileAdminSerializer, 
    CompanyProfileUserSerializer,
    BranchAdminSerializer,
    BranchUserSerializer,
    
)
from users.permissions import _rbac



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
        return _rbac(self.action, "companyprofile")
  
  
class BranchViewSet(viewsets.ModelViewSet):
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
        return _rbac(self.action, "branch")
    
    def create(self, request, *args, **kwargs):
        print("DATA:", request.data)
        serializer = BranchAdminSerializer(data=request.data)
        print("VALID:", serializer.is_valid())
        print("ERRORS:", serializer.errors)
        return super().create(request, *args, **kwargs)



