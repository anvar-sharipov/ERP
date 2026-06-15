# backend/accounting/tests/test_rbac_all.py
from accounting.tests.base import BaseRBACTest
from django_tenants.utils import tenant_context
from accounting.models import CompanyProfile


# ----------------------------------------------------------------
# Users
# ----------------------------------------------------------------
class TestUserRBAC(BaseRBACTest):
    resource_name = "user"
    list_url = "/api/users/manage/"
    detail_url = "/api/users/manage/{id}/"
    create_payload = {"username": "testuser123", "password": "pass123", "is_active": True}
    update_payload = {"username": "updateduser", "is_active": True}


# ----------------------------------------------------------------
# Roles
# ----------------------------------------------------------------
class TestRoleRBAC(BaseRBACTest):
    resource_name = "role"
    list_url = "/api/users/roles/list/"
    detail_url = "/api/users/roles/{id}/"
    create_payload = {"name": "TestRole"}
    update_payload = {"name": "UpdatedRole", "permissions": []}


# ----------------------------------------------------------------
# Company Profile
# ----------------------------------------------------------------
class TestCompanyProfileRBAC(BaseRBACTest):
    resource_name = "companyprofile"
    list_url = "/api/accounting/company-profile/"
    detail_url = "/api/accounting/company-profile/{id}/"
    create_payload = {"name": "Test Company"}
    update_payload = {"name": "Updated Company"}


# ----------------------------------------------------------------
# Branches
# ----------------------------------------------------------------
class TestBranchRBAC(BaseRBACTest):
    resource_name = "branch"
    list_url = "/api/accounting/branches/"
    detail_url = "/api/accounting/branches/{id}/"
    update_payload = {"name": "Updated Branch"}

    def create_target_object(self):
        with tenant_context(self.company):
            profile = CompanyProfile.objects.create(name="Test Co")
        client = self._client(self.user_manager)
        response = client.post(self.list_url, {
            "name": "Test Branch",
            "company_profile": profile.id,
        }, format='json')
        return response.data.get('id') if response.status_code == 201 else None


# ----------------------------------------------------------------
# Counterparty
# ----------------------------------------------------------------
# class TestCounterpartyRBAC(BaseRBACTest):
#     resource_name = "counterparty"
#     list_url = "/api/accounting/counterparties/"
#     detail_url = "/api/accounting/counterparties/{id}/"
#     create_payload = {"name": "Test Counterparty"}
#     update_payload = {"name": "Updated Counterparty"}


# ----------------------------------------------------------------
# Warehouse
# ----------------------------------------------------------------
# class TestWarehouseRBAC(BaseRBACTest):
#     resource_name = "warehouse"
#     list_url = "/api/accounting/warehouses/"
#     detail_url = "/api/accounting/warehouses/{id}/"
#     create_payload = {"name": "Test Warehouse"}
#     update_payload = {"name": "Updated Warehouse"}


# ----------------------------------------------------------------
# Product
# ----------------------------------------------------------------
# class TestProductRBAC(BaseRBACTest):
#     resource_name = "product"
#     list_url = "/api/accounting/products/"
#     detail_url = "/api/accounting/products/{id}/"
#     create_payload = {"name": "Test Product"}
#     update_payload = {"name": "Updated Product"}