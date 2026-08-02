# backend/accounting/tests/test_rbac_all.py
from rest_framework import status
from accounting.tests.base import BaseRBACTest
from django_tenants.utils import tenant_context
from accounting.models import CompanyProfile, Unit, Product



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
# Простые справочники
# ----------------------------------------------------------------
class TestUnitRBAC(BaseRBACTest):
    resource_name = "unit"
    list_url = "/api/accounting/units/"
    detail_url = "/api/accounting/units/{id}/"
    create_payload = {"name": "Килограмм", "short_name": "кг"}
    update_payload = {"name": "Грамм", "short_name": "гр"}

class TestBrandRBAC(BaseRBACTest):
    resource_name = "brand"
    list_url = "/api/accounting/brands/"
    detail_url = "/api/accounting/brands/{id}/"
    create_payload = {"name": "Test Brand", "slug": "test-brand"}
    update_payload = {"name": "Updated Brand"}

# ----------------------------------------------------------------
# Сложные модели (с внешними ключами)
# ----------------------------------------------------------------
class TestProductRBAC(BaseRBACTest):
    resource_name = "product"
    list_url = "/api/accounting/products/"
    detail_url = "/api/accounting/products/{id}/"
    
    def create_target_object(self):
        with tenant_context(self.company):
            unit = Unit.objects.create(name="шт", short_name="шт")
            product = Product.objects.create(name="Test Prod", unit=unit)
            return product.id
            
    def get_create_payload(self):
        with tenant_context(self.company):
            unit = Unit.objects.create(name="шт", short_name="шт")
        return {"name": "New Product", "unit": unit.id, "price_retail": 100}

    update_payload = {"name": "Updated Product Name"}

    # ✅ ProductViewSet.list_light (ProductsListPage.tsx) — тот же resource
    # "product", тот же GET, поэтому и RBAC-права те же, что у обычного list.
    def test_list_light_without_permission_returns_403(self):
        response = self._client(self.user_simple).get("/api/accounting/products/list-light/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_light_returns_lean_payload(self):
        response = self._client(self.user_manager).get("/api/accounting/products/list-light/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)
        item = response.data[0]
        for field in ("id", "name", "sku", "category_detail", "brand_detail", "unit_detail", "cost_price", "is_active"):
            self.assertIn(field, item, f"'{field}' должен быть в облегчённом ответе list-light")
        # ✅ Фото сознательно НЕ в list-light (см. ProductListSerializer докстринг) —
        # синхронная генерация thumbnail на большом каталоге не должна блокировать
        # текстовые поля; фото отдаёт отдельный list-light-images (см. тест ниже).
        for field in ("prices", "bundle_items", "volume_discounts", "quantity_promotions", "tags_detail", "allowed_warehouses_detail", "description", "extra_data", "images", "main_image"):
            self.assertNotIn(field, item, f"'{field}' не должен попадать в облегчённый ответ list-light")

    # ✅ ProductViewSet.list_light_images — фото отдельно от list_light (см. выше),
    # тот же resource "product"/GET, поэтому те же RBAC-права.
    def test_list_light_images_without_permission_returns_403(self):
        response = self._client(self.user_simple).get("/api/accounting/products/list-light-images/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_light_images_returns_map_keyed_by_product_id(self):
        response = self._client(self.user_manager).get("/api/accounting/products/list-light-images/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, dict)


class TestWarehouseRBAC(BaseRBACTest):
    resource_name = "warehouse"
    list_url = "/api/accounting/warehouses/"
    detail_url = "/api/accounting/warehouses/{id}/"
    create_payload = {"name": "Main Warehouse", "is_main": True}
    update_payload = {"name": "Secondary Warehouse"}

class TestCounterpartyRBAC(BaseRBACTest):
    resource_name = "counterparty"
    list_url = "/api/accounting/counterparties/"
    detail_url = "/api/accounting/counterparties/{id}/"
    create_payload = {"name": "ООО Ромашка", "type": "client"}
    update_payload = {"name": "ООО Лютик"}


