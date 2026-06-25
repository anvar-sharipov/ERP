# backend/users/urls.py
from django.urls import path
from .views import MeView
from .views import CheckGlobalAdminView, UserListView, RoleListView, PermissionMatrixView, RoleDetailView, AssignRoleView, UserDetailView, UserManagementView, ProfileUpdateView
from .views.user_views import UserLookupView
from .views.user_views import UserLookupView, MyScopeView


app_name = 'users'

urlpatterns = [
    path('me/', MeView.as_view(), name='user-me'),
    path('check-global-admin/', CheckGlobalAdminView.as_view(), name='check-global-admin'),
    path('list/', UserListView.as_view(), name="user-list"),
    # path('list/', UserManagementView.as_view(), name="user-list-create"),
    
    # Новый путь для создания (POST) и обновления (PUT/PATCH)
    path('manage/', UserManagementView.as_view(), name="user-manage"),
    path('manage/<int:pk>/', UserDetailView.as_view(), name="user-manage-detail"),
    
    path('roles/list/', RoleListView.as_view(), name="role-list"),
    path('list/<int:pk>/', UserDetailView.as_view(), name="user-detail"),
    
    path('permissions/matrix/', PermissionMatrixView.as_view(), name="permissions-matrix"),
    
    
    
    path('roles/<int:pk>/', RoleDetailView.as_view(), name="role-detail"),
    
    path('<int:user_id>/assign-role/', AssignRoleView.as_view(), name="assign-role"),
    
    path('profile/update/', ProfileUpdateView.as_view(), name='profile-update'),
    
    path("lookup/", UserLookupView.as_view(), name="users-lookup"),
    
    path('my-scope/', MyScopeView.as_view(), name='my-scope'),
    
    
    
]