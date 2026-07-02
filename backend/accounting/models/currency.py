# backend/accounting/models/currency.py
from django.db import models


class Currency(models.Model):
    code = models.CharField(max_length=3, unique=True)
    name = models.CharField(max_length=50)
    symbol = models.CharField(max_length=5, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Валюта"
        verbose_name_plural = "Валюты"

    def __str__(self):
        return self.code
    
    

class ExchangeRate(models.Model):
    currency = models.ForeignKey(Currency, on_delete=models.PROTECT, related_name='rates')
    rate = models.DecimalField(max_digits=10, decimal_places=4)
    date = models.DateField()
    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='exchange_rates'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # unique_together = [['currency', 'date']]
        ordering = ['-date']
        verbose_name = "Курс валюты"
        verbose_name_plural = "Курсы валют"

    def __str__(self):
        return f"{self.currency.code} → {self.rate} TMT ({self.date})"