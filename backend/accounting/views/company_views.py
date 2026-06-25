# backend/accounting/views/company_views.py
from rest_framework import viewsets
from ..models import CompanyProfile, Branch
from users.models import UserRole
from accounting.mixins import AuditMixin
from ..serializers.company_serializers import (
    CompanyProfileAdminSerializer, 
    CompanyProfileUserSerializer,
    BranchAdminSerializer,
    BranchUserSerializer,
    UserScopeSerializer
    
)
from users.permissions import _rbac



class CompanyProfileViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
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
  
  
class BranchViewSet(AuditMixin, viewsets.ModelViewSet):
    pagination_class = None
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
    
    
    
    
class UserScopeViewSet(viewsets.ModelViewSet):
    """
    CRUD для областей доступа пользователей.
    GET    /accounting/user-scopes/?user=<id>  — scope конкретного пользователя
    POST   /accounting/user-scopes/            — добавить scope
    DELETE /accounting/user-scopes/<id>/       — удалить scope
    """
    pagination_class = None
    serializer_class = UserScopeSerializer
 
    def get_permissions(self):
        return _rbac(self.action, 'branch')  # только кто может управлять филиалами
 
    def get_queryset(self):
        from accounting.models import UserScope
        qs = UserScope.objects.select_related('branch', 'warehouse').all()
        user_id = self.request.query_params.get('user')
        if user_id:
            qs = qs.filter(user_id=user_id)
        return qs
 
 
 
    
