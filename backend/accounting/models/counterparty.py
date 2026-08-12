# accounting/models/counterparty.py
import uuid
from decimal import Decimal
from django.contrib.postgres.indexes import GinIndex
from django.core.validators import MinValueValidator, MaxValueValidator
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
    # ✅ default=CLIENT, а не BOTH — тип "и клиент, и поставщик" временно
    # недоступен для выбора в CounterpartiesPage.tsx (Document._resolve_role_account
    # пока не умеет решать, по какому счёту — 60 или 75 — проводить документ для
    # такого контрагента), так что и дефолт при создании без явного type не должен
    # тихо создавать "both"-запись в обход этого ограничения.
    type = models.CharField(max_length=20, choices=Type.choices, default=Type.CLIENT)
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
    # ✅ Ответственный агент — FK на Agent (не Employee и не User напрямую!).
    # Agent.employee — тот, кому в итоге идёт ЗП/%; Agent.district — какое
    # направление/район этого агента обслуживает данного клиента (один Employee
    # может иметь несколько Agent-профилей, см. accounting/models/employee.py::Agent).
    # Это же поле — единственный источник scope для роли "Агент" (см.
    # users/scoping.py::apply_agent_scope): агент видит только тех контрагентов
    # (и связанные документы), где agent.employee.user == request.user — по ЛЮБОМУ
    # из своих Agent-профилей/районов сразу.
    agent = models.ForeignKey(
        'Agent', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='clients',
        verbose_name="Агент",
    )
    # ✅ Дублирует Agent.district для быстрого фильтра/отображения без join —
    # заполняется тем же значением, что и agent.district на момент назначения.
    district = models.CharField(max_length=100, blank=True, verbose_name="Район")
    # ✅ % от суммы накладной, который получает водитель за доставку этому
    # контрагенту (см. Trip/Document.delivery_percent) — заменяет расчёт по
    # реальным км/геоданным: чем дальше/сложнее доставка клиенту, тем выше
    # процент, настраивается вручную администратором один раз на контрагента,
    # а не пересчитывается на каждый рейс. Document._snapshot-ит это значение
    # в Document.delivery_percent при проведении "Расхода" — см. CLAUDE.md про
    # "хранить то, что реально было" вместо ссылки на текущее (изменяемое) поле.
    delivery_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('0.00'),
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        verbose_name="Процент водителю за доставку (%)",
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
    
    
    