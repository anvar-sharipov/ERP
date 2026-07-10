# backend/accounting/management/commands/seed_product_images.py
"""
Тестовая утилита: раздаёт товарам без фото случайную картинку из локальной
папки (для наглядности UI на деве/демо — не для прод-данных).

Все схемы:            python manage.py seed_product_images
Конкретная схема:      python manage.py seed_product_images --schema test1
Своя папка с фото:     python manage.py seed_product_images --schema test1 --source "C:\\path\\to\\images"
Даже уже с фото:       python manage.py seed_product_images --schema test1 --force
"""
import os
import random

from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django_tenants.utils import get_tenant_model, schema_context

from accounting.models import Product, ProductImage

DEFAULT_SOURCE = r"C:\Users\Anvar\Desktop\polisem\images\Towary"
VALID_EXT = {".jpg", ".jpeg", ".png", ".webp"}


class Command(BaseCommand):
    help = "Тестовое наполнение: назначает случайную фотографию каждому товару без изображения."

    def add_arguments(self, parser):
        parser.add_argument("--schema", type=str, help="Только конкретная схема (например: --schema test1)")
        parser.add_argument("--source", type=str, default=DEFAULT_SOURCE, help="Папка с фотографиями")
        parser.add_argument("--force", action="store_true", help="Добавить фото даже товарам, у которых уже есть изображение")

    def handle(self, *args, **options):
        source_dir = options["source"]
        if not os.path.isdir(source_dir):
            raise CommandError(f"Папка не найдена: {source_dir}")

        images = [
            os.path.join(source_dir, name)
            for name in os.listdir(source_dir)
            if os.path.splitext(name)[1].lower() in VALID_EXT
        ]
        if not images:
            raise CommandError(f"В папке {source_dir} нет подходящих изображений (jpg/png/webp)")
        self.stdout.write(f"Найдено фото в источнике: {len(images)}")

        specific_schema = options.get("schema")
        TenantModel = get_tenant_model()
        if specific_schema:
            tenants = TenantModel.objects.filter(schema_name=specific_schema)
            if not tenants.exists():
                raise CommandError(f'Схема "{specific_schema}" не найдена')
        else:
            tenants = TenantModel.objects.exclude(schema_name="public")

        total = 0
        for tenant in tenants:
            schema = tenant.schema_name
            self.stdout.write(f"\n→ Схема: {schema}")
            count = 0

            with schema_context(schema):
                qs = Product.objects.all()
                if not options["force"]:
                    qs = qs.filter(images__isnull=True)
                qs = qs.distinct()

                for product in qs:
                    path = random.choice(images)
                    with open(path, "rb") as f:
                        img = ProductImage(product=product, is_main=True, alt_text=product.name)
                        img.image.save(os.path.basename(path), File(f), save=True)
                    count += 1

            self.stdout.write(self.style.SUCCESS(f"  Добавлено фото: {count}"))
            total += count

        self.stdout.write(self.style.SUCCESS(f"\nИтого добавлено фото: {total}"))
