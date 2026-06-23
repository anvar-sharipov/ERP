import pytest
from django.urls import reverse
from rest_framework import status
from accounting.models import AuditLog, Product
from users.models import User # Убедись, что путь к User верный

@pytest.mark.django_db
class TestProductAudit:
    def setup_method(self):
        self.user = User.objects.create_user(username="testuser", password="password")
        self.url = reverse('product-list') # Убедись, что имя роута верное

    def test_create_audit_log(self, client):
        client.force_authenticate(user=self.user)
        payload = {"name": "Test Product", "price": 100} # Добавь поля, обязательные для Product
        
        response = client.post(self.url, payload, format='json')
        
        assert response.status_code == status.HTTP_201_CREATED
        assert AuditLog.objects.filter(action=AuditLog.Action.CREATE).exists()
        log = AuditLog.objects.get(action=AuditLog.Action.CREATE)
        assert log.user == self.user
        assert "Test Product" in log.object_repr

    def test_update_audit_log(self, client):
        product = Product.objects.create(name="Original Name")
        client.force_authenticate(user=self.user)
        
        update_url = reverse('product-detail', kwargs={'pk': product.pk})
        response = client.patch(update_url, {"name": "New Name"}, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        log = AuditLog.objects.get(action=AuditLog.Action.UPDATE)
        # Проверяем, что в changed_data есть изменения
        assert 'name' in log.changed_data
        assert log.changed_data['name'] == ["Original Name", "New Name"]

    def test_delete_audit_log(self, client):
        product = Product.objects.create(name="Delete Me")
        client.force_authenticate(user=self.user)
        
        delete_url = reverse('product-detail', kwargs={'pk': product.pk})
        response = client.delete(delete_url)
        
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert AuditLog.objects.filter(action=AuditLog.Action.DELETE).exists()