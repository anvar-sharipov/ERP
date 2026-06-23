# accounting/models/subconto.py
from django.contrib.contenttypes.models import ContentType
from django.db import models


class SubcontoType(models.Model):
    """
    Виды субконто (Паспорт аналитики).
    """
    name = models.CharField(max_length=100, unique=True, verbose_name="Название аналитики")
    slug = models.SlugField(max_length=50, unique=True, verbose_name="Системный код (Slug)")
    directory = models.ForeignKey(
        'Directory', on_delete=models.SET_NULL,
        null=True, blank=True,
        verbose_name="Динамический справочник"
    )
    content_type = models.ForeignKey(
        'contenttypes.ContentType',  # ✅ ПРАВИЛЬНАЯ ССЫЛКА
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        verbose_name="Какую модель подключаем",
        limit_choices_to=models.Q(app_label='accounting') | models.Q(app_label='companies') | models.Q(app_label='users')
    )

    class Meta:
        verbose_name = "Вид субконто"
        verbose_name_plural = "Виды субконто"

    def __str__(self):
        return f"{self.name} ({self.slug})"