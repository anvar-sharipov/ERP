
# backend/chat/admin.py
from django.contrib import admin
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from django.contrib.auth.models import Group
from users.models import User

# Список моделей для принудительного удаления из админки
models_to_hide = [Group, BlacklistedToken, OutstandingToken, User]

for model in models_to_hide:
    try:
        admin.site.unregister(model)
    except admin.sites.NotRegistered:
        # Это нормально: если модели нет в админке, значит она уже удалена или не регистрировалась
        pass
    

# from django.contrib import admin

# Register your models here.
