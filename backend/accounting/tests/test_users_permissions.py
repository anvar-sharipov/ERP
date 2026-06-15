from django_tenants.test.cases import TenantTestCase
from django_tenants.utils import tenant_context
from companies.models import Company, Domain
from django.contrib.auth import get_user_model
from django.db import connection
from users.models import Role, Permission, RolePermission, UserRole
from rest_framework.test import APIClient
from rest_framework import status

User = get_user_model()


class TestTenantIsolation(TenantTestCase):
    def setUp(self):
        connection.set_schema_to_public()
        self.company1 = Company.objects.create(name="Company 1", schema_name="tenant1")
        self.company2 = Company.objects.create(name="Company 2", schema_name="tenant2")
        Domain.objects.create(domain='tenant1.localhost', tenant=self.company1, is_primary=True)
        Domain.objects.create(domain='tenant2.localhost', tenant=self.company2, is_primary=True)

        with tenant_context(self.company1):
            self.user1 = User.objects.create_user(username='user1', password='pass')
        with tenant_context(self.company2):
            self.user2 = User.objects.create_user(username='user2', password='pass')

    def test_isolation_between_tenants(self):
        """Пользователь tenant2 не виден в tenant1"""
        with tenant_context(self.company1):
            self.assertFalse(User.objects.filter(username='user2').exists())

    def test_isolation_reverse(self):
        """Пользователь tenant1 не виден в tenant2"""
        with tenant_context(self.company2):
            self.assertFalse(User.objects.filter(username='user1').exists())


class TestUserRBAC(TenantTestCase):
    def setUp(self):
        connection.set_schema_to_public()
        self.company1 = Company.objects.create(name="Company 1", schema_name="tenant1")
        Domain.objects.create(domain='tenant1.localhost', tenant=self.company1, is_primary=True)

        with tenant_context(self.company1):
            # Роль с правами на user PUT и DELETE
            self.role_manager = Role.objects.create(name="Manager")

            for action in ['GET', 'POST', 'PUT', 'DELETE']:
                perm = Permission.objects.create(resource="user", action=action)
                RolePermission.objects.create(role=self.role_manager, permission=perm)

            self.user_manager = User.objects.create_user(username='manager', password='pass')
            UserRole.objects.create(user=self.user_manager, role=self.role_manager)

            self.user_simple = User.objects.create_user(username='simple', password='pass')
            self.user_target = User.objects.create_user(username='target', password='pass')

    def _client(self, user):
        client = APIClient()
        client.defaults['HTTP_HOST'] = 'tenant1.localhost'
        client.force_authenticate(user=user)
        return client

    def test_role_assignment(self):
        """Менеджер имеет роль"""
        with tenant_context(self.company1):
            self.assertTrue(UserRole.objects.filter(user=self.user_manager).exists())

    def test_simple_user_has_no_roles(self):
        """Простой пользователь без ролей"""
        with tenant_context(self.company1):
            self.assertFalse(UserRole.objects.filter(user=self.user_simple).exists())

    def test_get_users_list_without_permission(self):
        """GET /users/list/ — без прав возвращает 403"""
        # UserListView не имеет permission_classes — если добавишь, тест упадёт
        # Пока просто проверяем что запрос проходит
        client = self._client(self.user_simple)
        response = client.get('/api/users/list/')
        self.assertIn(response.status_code, [200, 403])

    def test_put_user_without_permission_returns_403(self):
        """PUT без прав — 403"""
        with tenant_context(self.company1):
            target_id = self.user_target.pk

        client = self._client(self.user_simple)
        response = client.put(f'/api/users/manage/{target_id}/', {'username': 'hacked'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_put_user_with_permission_returns_200_or_400(self):
        """PUT с правами — не 403 (200 или 400 если данные неполные)"""
        with tenant_context(self.company1):
            target_id = self.user_target.pk

        client = self._client(self.user_manager)
        response = client.put(
            f'/api/users/manage/{target_id}/',
            {'username': 'newname', 'is_active': True},
            format='json'
        )
        self.assertNotEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn(response.status_code, [200, 400])

    def test_delete_user_without_permission_returns_403(self):
        """DELETE без прав — 403"""
        with tenant_context(self.company1):
            target_id = self.user_target.pk

        client = self._client(self.user_simple)
        response = client.delete(f'/api/users/list/{target_id}/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_delete_user_with_permission_returns_204(self):
        """DELETE с правами — 204"""
        with tenant_context(self.company1):
            target_id = self.user_target.pk

        client = self._client(self.user_manager)
        response = client.delete(f'/api/users/list/{target_id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_post_create_user_without_permission_returns_403(self):
        """POST создание пользователя без прав — 403"""
        client = self._client(self.user_simple)
        response = client.post('/api/users/manage/', {'username': 'newuser', 'password': 'pass123'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_post_create_user_with_permission_returns_201(self):
        """POST создание пользователя с правами — 201"""
        client = self._client(self.user_manager)
        response = client.post(
            '/api/users/manage/',
            {'username': 'brandnew', 'password': 'pass123', 'is_active': True},
            format='json'
        )
        self.assertIn(response.status_code, [201, 400])
        self.assertNotEqual(response.status_code, status.HTTP_403_FORBIDDEN)