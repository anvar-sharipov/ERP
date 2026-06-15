# backend/accounting/tests/test_rbac_branches.py
from accounting.tests.base import BaseRBACTest
from django_tenants.utils import tenant_context
from accounting.models import CompanyProfile


class TestBranchRBAC(BaseRBACTest):
    resource_name = "branch"
    list_url = "/api/accounting/branches/"
    detail_url = "/api/accounting/branches/{id}/"

    def create_target_object(self):
        # Branch требует company_profile — создаём его сначала
        with tenant_context(self.company):
            profile = CompanyProfile.objects.create(name="Test Co")
        
        client = self._client(self.user_manager)
        response = client.post(self.list_url, {
            "name": "Test Branch",
            "company_profile": profile.id,
        }, format='json')
        return response.data.get('id') if response.status_code == 201 else None

    update_payload = {"name": "Updated Branch"}


# backend/accounting/tests/test_rbac_users.py
from accounting.tests.base import BaseRBACTest


class TestUserRBAC(BaseRBACTest):
    resource_name = "user"
    list_url = "/api/users/manage/"
    detail_url = "/api/users/manage/{id}/"
    create_payload = {"username": "testuser123", "password": "pass123", "is_active": True}
    update_payload = {"username": "updateduser", "is_active": True}


# backend/accounting/tests/test_rbac_roles.py
from accounting.tests.base import BaseRBACTest


class TestRoleRBAC(BaseRBACTest):
    resource_name = "role"
    list_url = "/api/users/roles/list/"
    detail_url = "/api/users/roles/{id}/"
    create_payload = {"name": "TestRole"}
    update_payload = {"name": "UpdatedRole", "permissions": []}