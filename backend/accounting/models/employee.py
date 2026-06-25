# accounting/models/employee.py
from django.conf import settings
from django.db import models
from .company import Branch


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