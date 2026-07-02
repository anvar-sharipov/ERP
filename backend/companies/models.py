# backend/companies/models.py
from django.db import models
from django_tenants.models import TenantMixin, DomainMixin

class Company(TenantMixin):
    name = models.CharField(max_length=100)
    created_on = models.DateField(auto_now_add=True)
    
    is_active = models.BooleanField(default=True, verbose_name="Активна (оплачена)")
    
    auto_create_schema = True # Чтобы схема создавалась сама
    

class Domain(DomainMixin):
    pass



class PlatformContact(models.Model):
    """
    Контактные данные владельца/администратора платформы.
    Показываются на экранах блокировки тенанта, страницах поддержки и т.д.
    Хранится только в public-схеме.
    """
    full_name = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    phone2 = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    telegram = models.CharField(max_length=100, blank=True)
    address = models.CharField(max_length=255, blank=True)
    photo = models.ImageField(upload_to='platform_contact/', blank=True, null=True)

    is_active = models.BooleanField(default=True)  # на случай если захочешь скрыть блок

    class Meta:
        verbose_name = "Platform Contact"
        verbose_name_plural = "Platform Contacts"

    def __str__(self):
        return self.full_name or "Platform Contact"