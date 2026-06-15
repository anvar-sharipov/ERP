# backend/companies/views.py
from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAdminUser  # Пускает только is_staff/is_superuser
from rest_framework import status
from .models import Company, Domain
from users.models import User, Role, Permission, RolePermission, UserRole
from .serializers.CompanySerializer import CompanySerializer
from icecream import ic

from django.db import connection
from users.models import User

from django.conf import settings
import os


from django.core.management import call_command
from django.db import connection


        
        
from django.db import connection, transaction
from rest_framework.exceptions import ValidationError
from django.db.utils import IntegrityError


def create_tenant_system(schema_name):
    # 1. Переключаемся в схему нового тенанта
    connection.set_schema(schema_name)
    
    # 2. Запускаем нашу команду генерации прав
    call_command('sync_permissions')
    
    # 3. (Опционально) Сразу создаем "Роли по умолчанию"
    # Тут можно вызвать еще один скрипт, который создаст роль 'Admin'
    # и привяжет к ней все права.


class RegisterCompanyView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request):
        # 1. Получение данных
        name = request.data.get('name')
        schema_name = request.data.get('schema_name', '').lower()
        username = request.data.get('admin_username')
        email = request.data.get('admin_email', '')
        password = request.data.get('admin_password')

        # 2. Базовая валидация
        if not all([name, schema_name, username, password]):
            return Response({"error": "Заполните все обязательные поля"}, status=status.HTTP_400_BAD_REQUEST)

        if Company.objects.filter(schema_name=schema_name).exists():
            return Response({"error": "Этот поддомен уже занят"}, status=status.HTTP_400_BAD_REQUEST)
        
        
        

        # 3. Атомарная транзакция (если что-то упадет, БД откатится в исходное состояние)
        try:
            # 1. Создаем компанию и домен (транзакция внутри)
            with transaction.atomic():
                company = Company.objects.create(name=name, schema_name=schema_name)
                base_domain = os.environ.get('PROJECT_DOMAIN', 'localhost')
                Domain.objects.create(
                    domain=f"{schema_name}.{base_domain}", 
                    tenant=company, 
                    is_primary=True
                )
            
            # --- ТРАНЗАКЦИЯ ЗАВЕРШЕНА, СХЕМА СОЗДАНА В БД ---

            # 2. Теперь работаем с новой схемой
            connection.set_schema(schema_name)
            
            
            
            # Инициализация прав (команда сама внутри делает запросы к БД)
            call_command('sync_permissions')
            
            
            # Создаем роль Admin
            admin_role, _ = Role.objects.get_or_create(name='Admin')
            
            # Берем все существующие права и привязываем их к этой роли
            all_permissions = Permission.objects.all()
            for perm in all_permissions:
                RolePermission.objects.get_or_create(role=admin_role, permission=perm)
            
            # Создаем суперпользователя
            admin_user = User.objects.create_superuser(
                username=username,
                email=email,
                password=password
            )
            
            # Назначаем ему роль Admin
            UserRole.objects.create(user=admin_user, role=admin_role)
            
            # Обязательно возвращаемся в public
            connection.set_schema('public')

        except Exception as e:
            # Важно: если упали, гарантированно вернуться в public
            connection.set_schema('public')
            # ВАЖНО: Выведите ошибку в консоль, чтобы понять реальную причину
            ic(e) 
            return Response({"error": f"Ошибка: {str(e)}"}, status=500)

        return Response({"message": f"Компания {name} успешно развернута!"}, status=201)
    
    
    
class CompanyListView(ListAPIView):
    queryset = Company.objects.all()
    serializer_class = CompanySerializer
    