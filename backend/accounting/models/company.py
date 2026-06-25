# accounting/models/company.py
import os
import uuid
from uuid import uuid4

from django.db import connection, models
from django.db.models import Q
from imagekit.models import ImageSpecField
from imagekit.processors import ResizeToFill
from PIL import Image

from utils.validators import validate_image_size


# =====================================================================
# УНИВЕРСАЛЬНЫЙ ГЕНЕРАТОР ПУТЕЙ
# =====================================================================
def get_company_file_path(instance, filename, folder_type):
    """Универсальная функция для всех файлов CompanyProfile"""
    ext = filename.split('.')[-1]
    filename = f"{uuid.uuid4()}.{ext}"
    folder_id = instance.pk if instance.pk else uuid.uuid4()
    return f'{connection.schema_name}/company_{folder_type}/{folder_id}/{filename}'


def company_logo_directory_path(instance, filename):
    return get_company_file_path(instance, filename, 'logos')


def company_logo2_directory_path(instance, filename):
    return get_company_file_path(instance, filename, 'logos2')


def stamps_directory_path(instance, filename):
    return get_company_file_path(instance, filename, 'stamps')


def signature_directory_path(instance, filename):
    return get_company_file_path(instance, filename, 'signatures')


def branch_logo_directory_path(instance, filename):
    ext = filename.split('.')[-1]
    filename = f"{uuid.uuid4()}.{ext}"
    folder_id = instance.pk if instance.pk else uuid.uuid4()
    return f'{connection.schema_name}/branch_logos/{folder_id}/{filename}'


def branch_signature_directory_path(instance, filename):
    ext = filename.split('.')[-1]
    filename = f"{uuid.uuid4()}.{ext}"
    folder_id = instance.pk if instance.pk else uuid.uuid4()
    return f'{connection.schema_name}/branch_signatures/{folder_id}/{filename}'


# ==============================================================================
# МОДЕЛЬ ПРОФИЛЯ КОМПАНИИ
# ==============================================================================

class CompanyProfile(models.Model):
    """
    Модель для хранения юридической и операционной информации о компании (тенанте).
    Данные используются для автоматической генерации печатных форм документов (счетов, актов).
    """

    # --- Брендинг ---
    name = models.CharField(max_length=255, null=True, blank=True)
    logo = models.ImageField(upload_to=company_logo_directory_path, blank=True, null=True, validators=[validate_image_size])
    logo_thumbnail = ImageSpecField(source='logo', processors=[ResizeToFill(100, 100)], format='JPEG', options={'quality': 80})
    logo2 = models.ImageField(upload_to=company_logo2_directory_path, blank=True, null=True, validators=[validate_image_size])
    logo2_thumbnail = ImageSpecField(source='logo2', processors=[ResizeToFill(100, 100)], format='JPEG', options={'quality': 80})
    stamp_image = models.ImageField(upload_to=stamps_directory_path, blank=True, null=True, validators=[validate_image_size])
    stamp_image_thumbnail = ImageSpecField(source='stamp_image', processors=[ResizeToFill(100, 100)], format='JPEG', options={'quality': 80})
    signature_image = models.ImageField(upload_to=signature_directory_path, blank=True, null=True, validators=[validate_image_size])
    signature_image_thumbnail = ImageSpecField(source='signature_image', processors=[ResizeToFill(100, 100)], format='JPEG', options={'quality': 80})

    # --- Юридические реквизиты ---
    tax_id = models.CharField(max_length=50, null=True, blank=True)
    bank_name = models.CharField(max_length=255, null=True, blank=True)
    bank_account = models.CharField(max_length=50, null=True, blank=True)
    mfo = models.CharField(max_length=10, null=True, blank=True)
    legal_reg_date = models.DateField(null=True, blank=True)
    address = models.TextField(null=True, blank=True)

    # --- Ответственные лица ---
    director_name = models.CharField(max_length=255, null=True, blank=True)
    chief_accountant_name = models.CharField(max_length=255, null=True, blank=True)

    # --- Контакты ---
    phone_official = models.CharField(max_length=30, null=True, blank=True)
    phone_official2 = models.CharField(max_length=30, null=True, blank=True)
    email_official = models.EmailField(null=True, blank=True)
    email_official2 = models.EmailField(null=True, blank=True)
    website = models.URLField(null=True, blank=True)
    website2 = models.URLField(null=True, blank=True)

    # --- Настройки системы ---
    base_currency = models.CharField(max_length=10, default="TMT")

    def save(self, *args, **kwargs):
        if self.pk:
            try:
                old_profile = CompanyProfile.objects.get(pk=self.pk)
                file_fields = ['logo', 'logo2', 'stamp_image', 'signature_image']
                for field_name in file_fields:
                    old_file = getattr(old_profile, field_name)
                    new_file = getattr(self, field_name)
                    if old_file and old_file != new_file:
                        if os.path.isfile(old_file.path):
                            os.remove(old_file.path)
            except CompanyProfile.DoesNotExist:
                pass
        super().save(*args, **kwargs)

        if self.logo:
            img = Image.open(self.logo.path)
            if img.width > 1000:
                img = img.resize((1000, int(img.height * (1000 / img.width))), Image.Resampling.LANCZOS)
            img.save(self.logo.path, optimize=True, quality=85)

        if self.logo2:
            img = Image.open(self.logo2.path)
            if img.width > 1000:
                img = img.resize((1000, int(img.height * (1000 / img.width))), Image.Resampling.LANCZOS)
            img.save(self.logo2.path, optimize=True, quality=85)

        if self.stamp_image:
            img = Image.open(self.stamp_image.path)
            if img.width > 1000:
                img = img.resize((1000, int(img.height * (1000 / img.width))), Image.Resampling.LANCZOS)
            img.save(self.stamp_image.path, format='PNG', optimize=True)

        if self.signature_image:
            img = Image.open(self.signature_image.path)
            if img.width > 1000:
                img = img.resize((1000, int(img.height * (1000 / img.width))), Image.Resampling.LANCZOS)
            img.save(self.signature_image.path, optimize=True, quality=85)


class Branch(models.Model):
    name = models.CharField(max_length=255, verbose_name="Название филиала")
    code = models.CharField(max_length=20, verbose_name="Код филиала", blank=True)
    is_head_office = models.BooleanField(default=False, verbose_name="Главный офис")

    address = models.TextField(blank=True, verbose_name="Адрес филиала")
    city = models.CharField(max_length=100, blank=True, verbose_name="Город")
    phone = models.CharField(max_length=30, blank=True, verbose_name="Телефон филиала")
    email = models.EmailField(blank=True, verbose_name="Email филиала")
    website = models.URLField(blank=True, verbose_name="Сайт филиала")

    manager_name = models.CharField(max_length=255, blank=True, verbose_name="Управляющий")
    manager_position = models.CharField(max_length=255, default="Директор филиала", verbose_name="Должность")

    logo = models.ImageField(upload_to=branch_logo_directory_path, blank=True, null=True)
    logo_thumbnail = ImageSpecField(source='logo', processors=[ResizeToFill(100, 100)], format='JPEG', options={'quality': 80})
    signature_image = models.ImageField(upload_to=branch_signature_directory_path, blank=True, null=True)
    signature_image_thumbnail = ImageSpecField(source='signature_image', processors=[ResizeToFill(100, 100)], format='JPEG', options={'quality': 80})

    company_profile = models.ForeignKey('CompanyProfile', on_delete=models.CASCADE, related_name='branches')
    is_active = models.BooleanField(default=True, verbose_name="Активен")

    def save(self, *args, **kwargs):
        if self.pk:
            try:
                old_branch = Branch.objects.get(pk=self.pk)
                file_fields = ['logo', 'signature_image']
                for field_name in file_fields:
                    old_file = getattr(old_branch, field_name)
                    new_file = getattr(self, field_name)
                    if old_file and old_file != new_file:
                        if os.path.isfile(old_file.path):
                            os.remove(old_file.path)
            except Branch.DoesNotExist:
                pass

        super().save(*args, **kwargs)

        if self.logo:
            img = Image.open(self.logo.path)
            if img.width > 1000:
                img = img.resize((1000, int(img.height * (1000 / img.width))), Image.Resampling.LANCZOS)
            img.save(self.logo.path, optimize=True, quality=85)

        if self.signature_image:
            img = Image.open(self.signature_image.path)
            if img.width > 1000:
                img = img.resize((1000, int(img.height * (1000 / img.width))), Image.Resampling.LANCZOS)
            img.save(self.signature_image.path, optimize=True, quality=85)

    class Meta:
        verbose_name = "Филиал"
        verbose_name_plural = "Филиалы"
        
        
        
        
class UserScope(models.Model):
    """
    Определяет к каким филиалам и складам имеет доступ пользователь.
    Если записей нет — пользователь видит всё (директор/админ).
    Если записи есть — видит только указанные объекты.
    """
    # user = models.IntegerField(verbose_name="ID пользователя", db_index=True)
    user = models.ForeignKey('users.User', on_delete=models.CASCADE)
    branch = models.ForeignKey(
        Branch, on_delete=models.CASCADE,
        null=True, blank=True, related_name='user_scopes'
    )
    warehouse = models.ForeignKey(
        "accounting.Warehouse", on_delete=models.CASCADE,
        null=True, blank=True, related_name='user_scopes'
    )

    class Meta:
        unique_together = ('user', 'branch', 'warehouse')
        verbose_name = "Область доступа пользователя"
        verbose_name_plural = "Области доступа пользователей"

    def __str__(self):
        parts = [f"user:{self.user}"]
        if self.branch:
            parts.append(f"филиал: {self.branch}")
        if self.warehouse:
            parts.append(f"склад: {self.warehouse}")
        return " | ".join(parts)

    def clean(self):
        from django.core.exceptions import ValidationError
        if not self.branch and not self.warehouse:
            raise ValidationError("Укажите хотя бы филиал или склад.")
        
        
        
        