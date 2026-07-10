# backend/accounting/management/commands/seed_avatar_photos.py
"""
Тестовая утилита: раздаёт случайное фото-аватар сотрудникам/контрагентам (тенант,
модель accounting) и пользователям (общая модель, схема public) — только тем,
у кого фото ещё нет (пропускает тех, у кого уже есть).

Все схемы:            python manage.py seed_avatar_photos
Конкретная схема:      python manage.py seed_avatar_photos --schema test1
Своя папка с фото:     python manage.py seed_avatar_photos --schema test1 --source "C:\\path\\to\\avatars"
"""
import os
import random

from django.contrib.auth import get_user_model
from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q
from django_tenants.utils import get_tenant_model, schema_context
from PIL import Image, UnidentifiedImageError

from accounting.models import Employee, Counterparty

DEFAULT_SOURCE = r"C:\Users\Anvar\Desktop\polisem\images\avatar"
VALID_EXT = {".jpg", ".jpeg", ".png", ".webp"}


class Command(BaseCommand):
    help = "Тестовое наполнение: назначает случайный аватар сотрудникам/контрагентам/пользователям без фото."

    def add_arguments(self, parser):
        parser.add_argument("--schema", type=str, help="Только конкретная схема (например: --schema test1)")
        parser.add_argument("--source", type=str, default=DEFAULT_SOURCE, help="Папка с аватарами")

    def handle(self, *args, **options):
        source_dir = options["source"]
        if not os.path.isdir(source_dir):
            raise CommandError(f"Папка не найдена: {source_dir}")

        candidates = [
            os.path.join(source_dir, name)
            for name in os.listdir(source_dir)
            if os.path.splitext(name)[1].lower() in VALID_EXT
        ]
        # ✅ Расширение файла — не гарантия формата (встретился .jpg, который на
        # самом деле AVIF — Pillow валился прямо в User.save() на Image.open()).
        # Проверяем реальный формат заранее, а не полагаемся на имя файла.
        images = []
        for path in candidates:
            try:
                with Image.open(path) as im:
                    im.verify()
                images.append(path)
            except (UnidentifiedImageError, OSError):
                self.stdout.write(self.style.WARNING(f"  Пропускаю (не читается как изображение): {path}"))
        if not images:
            raise CommandError(f"В папке {source_dir} нет подходящих изображений (jpg/png/webp)")
        self.stdout.write(f"Найдено аватаров в источнике: {len(images)}")

        specific_schema = options.get("schema")
        TenantModel = get_tenant_model()
        if specific_schema:
            tenants = TenantModel.objects.filter(schema_name=specific_schema)
            if not tenants.exists():
                raise CommandError(f'Схема "{specific_schema}" не найдена')
        else:
            tenants = TenantModel.objects.exclude(schema_name="public")

        # ✅ FileField/ImageField без файла бывает и NULL, и '' (пусто), в
        # зависимости от того, как поле очищали (см. employee_serializers.py/
        # product_serializers.py — сериализаторы ставят None при удалении, но
        # по умолчанию Django хранит '') — проверяем оба варианта, иначе часть
        # "пустых" фото не найдётся.
        NO_PHOTO = Q(photo__isnull=True) | Q(photo="")

        def assign(obj, field_name="photo"):
            path = random.choice(images)
            with open(path, "rb") as f:
                getattr(obj, field_name).save(os.path.basename(path), File(f), save=True)

        total_employees = total_counterparties = 0
        for tenant in tenants:
            schema = tenant.schema_name
            self.stdout.write(f"\n→ Схема: {schema}")

            with schema_context(schema):
                employees = list(Employee.objects.filter(NO_PHOTO))
                for emp in employees:
                    assign(emp)
                total_employees += len(employees)

                counterparties = list(Counterparty.objects.filter(NO_PHOTO))
                for cp in counterparties:
                    assign(cp)
                total_counterparties += len(counterparties)

            self.stdout.write(self.style.SUCCESS(f"  Сотрудники: {len(employees)}, контрагенты: {len(counterparties)}"))

        # ✅ users — общее приложение (SHARED_APPS, живёт только в схеме public),
        # одна таблица на весь проект — обрабатываем один раз, а не в цикле по тенантам.
        User = get_user_model()
        users = list(User.objects.filter(NO_PHOTO))
        total_users = len(users)
        for user in users:
            assign(user)

        self.stdout.write(self.style.SUCCESS(
            f"\nИтого добавлено фото — сотрудники: {total_employees}, "
            f"контрагенты: {total_counterparties}, пользователи: {total_users}"
        ))
