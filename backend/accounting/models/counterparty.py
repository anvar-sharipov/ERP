# accounting/models/counterparty.py
import uuid
from django.contrib.postgres.indexes import GinIndex
from django.db import connection, models
from imagekit.models import ImageSpecField
from imagekit.processors import ResizeToFill

from utils.validators import validate_image_size


def counterparty_photo_path(instance, filename):
    ext = filename.split('.')[-1].lower()
    filename = f"{uuid.uuid4()}.{ext}"
    folder_id = instance.pk if instance.pk else uuid.uuid4()
    return f"{connection.schema_name}/counterparty_photos/{folder_id}/{filename}"


class CounterpartyManager(models.Manager):
    """Кастомный менеджер для удобной фильтрации контрагентов"""

    def clients(self):
        return self.filter(type__in=['client', 'both'])

    def suppliers(self):
        return self.filter(type__in=['supplier', 'both'])


class Counterparty(models.Model):
    class Type(models.TextChoices):
        CLIENT = 'client', 'Клиент'
        SUPPLIER = 'supplier', 'Поставщик'
        BOTH = 'both', 'Клиент и поставщик'

    name = models.CharField(max_length=255, verbose_name="Название контрагента")
    type = models.CharField(max_length=20, choices=Type.choices, default=Type.BOTH)
    inn = models.CharField(max_length=20, blank=True, verbose_name="ИНН")
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    photo = models.ImageField(
        upload_to=counterparty_photo_path, blank=True, null=True,
        validators=[validate_image_size], verbose_name="Фото"
    )
    photo_thumbnail = ImageSpecField(
        source='photo', processors=[ResizeToFill(150, 150)],
        format='JPEG', options={'quality': 80}
    )
    created_at = models.DateTimeField(auto_now_add=True)
    extra_data = models.JSONField(default=dict, blank=True)

    objects = CounterpartyManager()

    class Meta:
        verbose_name = "Контрагент"
        verbose_name_plural = "Контрагенты"
        indexes = [
            GinIndex(fields=['extra_data'], name='counterparty_extra_data_gin'),
        ]

    def __str__(self):
        return self.name
    
    
    