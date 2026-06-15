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
