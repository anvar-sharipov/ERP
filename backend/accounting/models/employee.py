# accounting/models/employee.py
import uuid
from django.conf import settings
from django.db import connection, models
from imagekit.models import ImageSpecField
from imagekit.processors import ResizeToFill

from utils.validators import validate_image_size

from .company import Branch


def employee_photo_path(instance, filename):
    ext = filename.split('.')[-1].lower()
    filename = f"{uuid.uuid4()}.{ext}"
    folder_id = instance.pk if instance.pk else uuid.uuid4()
    return f"{connection.schema_name}/employee_photos/{folder_id}/{filename}"


class Position(models.Model):
    name = models.CharField(max_length=100, unique=True, verbose_name="Название")
    description = models.CharField(max_length=255, blank=True, verbose_name="Описание")
    is_active = models.BooleanField(default=True, verbose_name="Активна")

    class Meta:
        verbose_name = "Должность"
        verbose_name_plural = "Должности"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Employee(models.Model):
    employee_no = models.CharField(max_length=30, unique=True, blank=True, verbose_name="Табельный номер")
    full_name = models.CharField(max_length=255, verbose_name="ФИО")
    position = models.ForeignKey(Position, on_delete=models.PROTECT, related_name="employees", verbose_name="Должность")
    phone = models.CharField(max_length=30, blank=True, verbose_name="Телефон")
    hire_date = models.DateField(null=True, blank=True, verbose_name="Дата приема")
    dismiss_date = models.DateField(null=True, blank=True, verbose_name="Дата увольнения")
    # ✅ Один реальный человек = одна запись Employee (для расчёта ЗП). Размножение
    # "один агент — несколько районов" живёт на модели Agent (agent.py), а не здесь —
    # см. Agent.employee. Поэтому здесь снова OneToOneField, а не ForeignKey.
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employee",
        verbose_name="Пользователь системы"
    )
    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='employees',
        verbose_name="Филиал"
    )
    note = models.TextField(blank=True, verbose_name="Примечание")
    is_active = models.BooleanField(default=True, verbose_name="Активен")
    photo = models.ImageField(
        upload_to=employee_photo_path, blank=True, null=True,
        validators=[validate_image_size], verbose_name="Фото"
    )
    photo_thumbnail = ImageSpecField(
        source='photo', processors=[ResizeToFill(150, 150)],
        format='JPEG', options={'quality': 80}
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Сотрудник"
        verbose_name_plural = "Сотрудники"
        ordering = ["full_name"]

    def save(self, *args, **kwargs):
        if not self.employee_no:
            super().save(*args, **kwargs)
            self.employee_no = f"EMP-{self.pk:05d}"
            super().save(update_fields=['employee_no'])
        else:
            super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee_no} - {self.full_name}"


class Agent(models.Model):
    """
    Профиль агента — то, на что реально ссылается Counterparty.agent.
    Разделяет "кто получает деньги/ЗП" (Employee, всегда один на человека) от
    "по какому району/направлению закреплены клиенты" (Agent.district) — один
    Employee может иметь несколько Agent-профилей (например, Rayon и Dashoguz),
    но ЗП/% считается по Employee, суммируя выручку со всех его Agent-профилей
    разом, а не по каждому профилю отдельно.
    """
    employee = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name="agent_profiles", verbose_name="Сотрудник")
    district = models.CharField(max_length=100, blank=True, verbose_name="Район")
    is_active = models.BooleanField(default=True, verbose_name="Активен")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Агент"
        verbose_name_plural = "Агенты"
        ordering = ["employee__full_name", "district"]
        constraints = [
            models.UniqueConstraint(fields=["employee", "district"], name="unique_agent_employee_district")
        ]

    def __str__(self):
        return f"{self.employee.full_name} ({self.district})" if self.district else self.employee.full_name