# backend/accounting/views/company_views.py
from rest_framework import viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from ..models import CompanyProfile, Branch, DocumentSettings
from users.models import UserRole
from accounting.mixins import AuditMixin
from ..serializers.company_serializers import (
    CompanyProfileAdminSerializer,
    CompanyProfileUserSerializer,
    BranchAdminSerializer,
    BranchUserSerializer,
    UserScopeSerializer,
    DocumentSettingsSerializer,
)
from users.permissions import _rbac


class TenantSettingsView(APIView):
    """
    Публичные для авторизованных пользователей tenant'а настройки самой
    компании (public-схема, companies.Company) — то, что нужно знать
    фронтенду, но что не относится к RBAC-правам конкретного пользователя.
    Пока только allow_branch_creation (см. Company.allow_branch_creation,
    управляется из global-admin панели) — сюда же добавлять другие подобные
    флаги в будущем, а не плодить по эндпоинту на каждый.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = getattr(request, 'tenant', None)
        return Response({
            'allow_branch_creation': getattr(tenant, 'allow_branch_creation', False),
        })



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

    def perform_create(self, serializer):
        # ✅ Company.allow_branch_creation (см. global-admin панель) — скрытая
        # кнопка в Branchs.tsx сама по себе не мешает отправить POST напрямую
        # в API, поэтому проверяем и здесь. Superuser (сам владелец платформы)
        # не ограничен этим флагом — это его собственный переключатель.
        tenant = getattr(self.request, 'tenant', None)
        if not self.request.user.is_superuser and not getattr(tenant, 'allow_branch_creation', False):
            raise PermissionDenied("Добавление филиалов отключено администратором платформы.")
        super().perform_create(serializer)


    
    
class UserScopeViewSet(AuditMixin, viewsets.ModelViewSet):
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


class DocumentSettingsViewSet(AuditMixin, viewsets.ModelViewSet):
    """
    Общие настройки документов (singleton по конвенции, как CompanyProfile) —
    фронтенд берёт [0] из списка, либо создаёт первую запись, если её ещё нет.
    """
    pagination_class = None
    queryset = DocumentSettings.objects.select_related('purchase_price_type').all()
    serializer_class = DocumentSettingsSerializer

    def get_permissions(self):
        return _rbac(self.action, "documentsettings")
 
 
 
    
