from django.core.files.storage import FileSystemStorage
from django_tenants.utils import tenant_context, get_tenant_model
from django.conf import settings
import os

class TenantFileSystemStorage(FileSystemStorage):
    def get_upload_to(self, name):
        # Получаем текущий активный тенант
        from django.db import connection
        tenant = connection.tenant
        
        # Если мы в публичной схеме, используем папку 'public'
        # Если в тенанте — его схему или ID
        folder_name = tenant.schema_name if tenant else 'public'
        return os.path.join(folder_name, name)

    def _save(self, name, content):
        # Переопределяем путь сохранения
        name = self.get_upload_to(name)
        return super()._save(name, content)