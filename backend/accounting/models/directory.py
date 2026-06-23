# accounting/models/directory.py
from django.db import models


class Directory(models.Model):
    """Тип справочника, созданный пользователем"""
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    icon = models.CharField(max_length=50, blank=True)
    color = models.CharField(max_length=7, default="#3b82f6")
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Справочник"


class DirectoryField(models.Model):
    """Поля справочника"""
    class FieldType(models.TextChoices):
        TEXT = 'text', 'Текст'
        NUMBER = 'number', 'Число'
        DATE = 'date', 'Дата'
        BOOLEAN = 'boolean', 'Да/Нет'
        REF = 'ref', 'Ссылка на другой справочник'

    directory = models.ForeignKey(Directory, on_delete=models.CASCADE, related_name='fields')
    name = models.CharField(max_length=100)
    slug = models.SlugField()
    field_type = models.CharField(max_length=20, choices=FieldType.choices, default=FieldType.TEXT)
    ref_directory = models.ForeignKey(
        Directory, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+'
    )
    is_required = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order']
        unique_together = ('directory', 'slug')


class DirectoryRecord(models.Model):
    """Запись в справочнике"""
    directory = models.ForeignKey(Directory, on_delete=models.CASCADE, related_name='records')
    name = models.CharField(max_length=255)
    data = models.JSONField(default=dict)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Запись справочника"