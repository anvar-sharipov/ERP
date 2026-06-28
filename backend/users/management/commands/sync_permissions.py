# backend/users/management/commands/sync_permissions.py     
from django.core.management.base import BaseCommand
from django.apps import apps
from django_tenants.utils import get_tenant_model, schema_context
from users.models import Permission
from icecream import ic


# Все схемы
# python manage.py sync_permissions

# Конкретная схема
# python manage.py sync_permissions --schema test18


class Command(BaseCommand):
    help = 'Синхронизирует права доступа для всех тенантов'

    def add_arguments(self, parser):
        parser.add_argument(
            '--schema',
            type=str,
            help='Синхронизировать только конкретную схему (например: --schema test18)',
        )

    def handle(self, *args, **kwargs):
        target_apps = ['accounting', 'users', 'chat']
        specific_schema = kwargs.get('schema')

        # Собираем список схем
        TenantModel = get_tenant_model()
        
        if specific_schema:
            tenants = TenantModel.objects.filter(schema_name=specific_schema)
            if not tenants.exists():
                self.stdout.write(self.style.ERROR(f'Схема "{specific_schema}" не найдена'))
                return
        else:
            # Все тенанты кроме публичной схемы
            tenants = TenantModel.objects.exclude(schema_name='public')

        total_count = 0

        for tenant in tenants:
            schema = tenant.schema_name
            self.stdout.write(f'\n→ Схема: {schema}')
            count = 0

            with schema_context(schema):
                for app_label in target_apps:
                    app = apps.get_app_config(app_label)
                    for model in app.get_models():
                        resource = model._meta.model_name
                        ic(resource)
                        for action in ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']:
                            _, created = Permission.objects.get_or_create(
                                resource=resource,
                                action=action
                            )
                            if created:
                                count += 1

            self.stdout.write(self.style.SUCCESS(f'  Создано {count} новых прав'))
            total_count += count

        self.stdout.write(self.style.SUCCESS(f'\nИтого создано: {total_count} прав'))