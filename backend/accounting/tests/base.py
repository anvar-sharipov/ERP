# backend/accounting/tests/base.py
from django_tenants.test.cases import TenantTestCase
from django_tenants.utils import tenant_context
from companies.models import Company, Domain
from django.contrib.auth import get_user_model
from django.db import connection
from users.models import Role, Permission, RolePermission, UserRole
from rest_framework.test import APIClient
from rest_framework import status
from django.core.cache import cache

User = get_user_model()


# Все RBAC тесты
# python manage.py test accounting.tests

# Один файл
# python manage.py test accounting.tests.test_rbac_branches
# python manage.py test accounting.tests.test_rbac_all


class BaseRBACTest(TenantTestCase):
    """
    Базовый класс для тестирования RBAC.
    Наследуй и переопредели атрибуты для каждой модели.
    """
    resource_name: str = ""       # "user", "branch", "companyprofile"
    list_url: str = ""            # "/api/accounting/branches/"
    detail_url: str = ""          # "/api/accounting/branches/{id}/"
    create_payload: dict = {}     # минимальные данные для POST
    update_payload: dict = {}     # данные для PUT
    
    # Переопредели если нужно создать зависимые объекты (например CompanyProfile для Branch)
    def create_target_object(self):
        """
        Создаёт объект для тестов PUT/DELETE.
        По умолчанию делает POST через API от имени менеджера.
        Переопредели если нужна особая логика.
        """
        client = self._client(self.user_manager)
        response = client.post(self.list_url, self.create_payload, format='json')
        if response.status_code == 201:
            return response.data.get('id')
        return None

    def setUp(self):
        cache.clear()  # сбрасываем кэш прав перед каждым тестом
        connection.set_schema_to_public()
        self.company = Company.objects.create(name="Test Company", schema_name="tenant1")
        Domain.objects.create(domain='tenant1.localhost', tenant=self.company, is_primary=True)

        with tenant_context(self.company):
            # Создаём роль с полными правами на ресурс
            self.role_manager = Role.objects.create(name="Manager")
            for action in ['GET', 'POST', 'PUT', 'DELETE']:
                perm, _ = Permission.objects.get_or_create(resource=self.resource_name, action=action)
                RolePermission.objects.create(role=self.role_manager, permission=perm)

            # Менеджер — с правами
            self.user_manager = User.objects.create_user(username='manager', password='pass')
            UserRole.objects.create(user=self.user_manager, role=self.role_manager)

            # Простой пользователь — без прав
            self.user_simple = User.objects.create_user(username='simple', password='pass')

            # Создаём целевой объект для PUT/DELETE
            self.target_id = self.create_target_object()

    def _client(self, user) -> APIClient:
        client = APIClient()
        client.defaults['HTTP_HOST'] = 'tenant1.localhost'
        client.force_authenticate(user=user)
        return client

    def _detail_url(self, pk=None) -> str:
        return self.detail_url.format(id=pk or self.target_id)

    # ----------------------------------------------------------------
    # GET LIST
    # ----------------------------------------------------------------
    def test_get_list_without_permission_returns_403(self):
        if not self.list_url:
            return self.skipTest("list_url не задан")
        response = self._client(self.user_simple).get(self.list_url)
        self.assertEqual(
            response.status_code, status.HTTP_403_FORBIDDEN,
            f"GET {self.list_url} без прав должен вернуть 403, получили {response.status_code}"
        )

    def test_get_list_with_permission_returns_200(self):
        if not self.list_url:
            return self.skipTest("list_url не задан")
        response = self._client(self.user_manager).get(self.list_url)
        self.assertEqual(
            response.status_code, status.HTTP_200_OK,
            f"GET {self.list_url} с правами должен вернуть 200, получили {response.status_code}"
        )

    # ----------------------------------------------------------------
    # POST
    # ----------------------------------------------------------------
    def test_post_without_permission_returns_403(self):
        if not self.list_url or not self.create_payload:
            return self.skipTest("list_url или create_payload не заданы")
        response = self._client(self.user_simple).post(self.list_url, self.create_payload, format='json')
        self.assertEqual(
            response.status_code, status.HTTP_403_FORBIDDEN,
            f"POST {self.list_url} без прав должен вернуть 403, получили {response.status_code}"
        )

    def test_post_with_permission_returns_201_or_400(self):
        if not self.list_url or not self.create_payload:
            return self.skipTest("list_url или create_payload не заданы")
        response = self._client(self.user_manager).post(self.list_url, self.create_payload, format='json')
        self.assertIn(
            response.status_code, [status.HTTP_201_CREATED, status.HTTP_400_BAD_REQUEST],
            f"POST {self.list_url} с правами должен вернуть 201 или 400, получили {response.status_code}"
        )
        self.assertNotEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ----------------------------------------------------------------
    # PUT
    # ----------------------------------------------------------------
    def test_put_without_permission_returns_403(self):
        if not self.detail_url or not self.target_id:
            return self.skipTest("detail_url или target_id не заданы")
        response = self._client(self.user_simple).put(
            self._detail_url(), self.update_payload or self.create_payload, format='json'
        )
        self.assertEqual(
            response.status_code, status.HTTP_403_FORBIDDEN,
            f"PUT {self._detail_url()} без прав должен вернуть 403, получили {response.status_code}"
        )

    def test_put_with_permission_returns_200_or_400(self):
        if not self.detail_url or not self.target_id:
            return self.skipTest("detail_url или target_id не заданы")
        response = self._client(self.user_manager).put(
            self._detail_url(), self.update_payload or self.create_payload, format='json'
        )
        self.assertIn(
            response.status_code, [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST],
            f"PUT {self._detail_url()} с правами должен вернуть 200 или 400, получили {response.status_code}"
        )
        self.assertNotEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ----------------------------------------------------------------
    # DELETE
    # ----------------------------------------------------------------
    def test_delete_without_permission_returns_403(self):
        if not self.detail_url or not self.target_id:
            return self.skipTest("detail_url или target_id не заданы")
        response = self._client(self.user_simple).delete(self._detail_url())
        self.assertEqual(
            response.status_code, status.HTTP_403_FORBIDDEN,
            f"DELETE {self._detail_url()} без прав должен вернуть 403, получили {response.status_code}"
        )

    def test_delete_with_permission_returns_204(self):
        if not self.detail_url or not self.target_id:
            return self.skipTest("detail_url или target_id не заданы")
        response = self._client(self.user_manager).delete(self._detail_url())
        self.assertEqual(
            response.status_code, status.HTTP_204_NO_CONTENT,
            f"DELETE {self._detail_url()} с правами должен вернуть 204, получили {response.status_code}"
        )

    # ----------------------------------------------------------------
    # Superuser bypass
    # ----------------------------------------------------------------
    def test_superuser_bypasses_rbac(self):
        if not self.list_url:
            return self.skipTest("list_url не задан")
        with tenant_context(self.company):
            superuser = User.objects.create_superuser(username='superadmin', password='pass')
        response = self._client(superuser).get(self.list_url)
        self.assertNotEqual(
            response.status_code, status.HTTP_403_FORBIDDEN,
            "Суперюзер не должен получать 403"
        )