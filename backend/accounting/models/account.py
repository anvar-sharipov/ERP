# accounting/models/account.py
from django.db import models


class Account(models.Model):
    """
    План счетов с жесткой защитой иерархии.
    """

    class AccountType(models.TextChoices):
        ACTIVE = 'A', 'А'
        PASSIVE = 'P', 'П'
        ACTIVE_PASSIVE = 'AP', 'АП'

    code = models.CharField(max_length=10, unique=True, verbose_name="Код счета")
    name = models.CharField(max_length=255, verbose_name="Наименование счета")
    parent = models.ForeignKey(
        'self',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='subaccounts',
        verbose_name="Родительский счет"
    )
    is_group = models.BooleanField(default=False, verbose_name="Это группа (нельзя делать проводки)")
    subcontos = models.ManyToManyField(
        'SubcontoType',
        through='AccountSubconto',
        related_name='accounts',
        verbose_name="Виды субконто"
    )
    account_type = models.CharField(
        max_length=2,
        choices=AccountType.choices,
        default=AccountType.ACTIVE_PASSIVE,
        verbose_name="Вид счета"
    )
    is_active = models.BooleanField(default=True, verbose_name="Активен")

    class Meta:
        ordering = ['code']
        verbose_name = "Счет"
        verbose_name_plural = "План счетов"

    def __str__(self):
        return f"{self.code} - {self.name}"


class AccountSubconto(models.Model):
    """
    Связующая таблица для определения порядка вывода субконто в UI.
    """
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='account_subcontos')
    subconto_type = models.ForeignKey('SubcontoType', on_delete=models.CASCADE, verbose_name="Вид субконто")
    order = models.PositiveIntegerField(default=1, verbose_name="Порядок вывода в интерфейсе (1, 2, 3)")

    class Meta:
        unique_together = ('account', 'order')
        ordering = ['order']
        verbose_name = "Субконто счета"
        verbose_name_plural = "Субконто счетов"