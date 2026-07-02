# backend/companies/views.py
from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAdminUser, AllowAny  # Пускает только is_staff/is_superuser
from rest_framework import status
from .models import Company, Domain, PlatformContact
from users.models import User, Role, Permission, RolePermission, UserRole
from .serializers.CompanySerializer import CompanySerializer, CompanyUpdateSerializer
from icecream import ic

from rest_framework.parsers import MultiPartParser, FormParser


from .serializers.PlatformContactSerializer import PlatformContactSerializer





from django.conf import settings
import os


from django.core.management import call_command

from rest_framework.generics import RetrieveUpdateAPIView



        
        
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
    pagination_class = None
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
    pagination_class = None
    queryset = Company.objects.all()
    serializer_class = CompanySerializer
 
 



class CompanyUpdateView(RetrieveUpdateAPIView):
    """
    GET  /companies/<id>/  — детали компании
    PATCH/PUT /companies/<id>/  — обновление name / is_active
    """
    pagination_class = None
    permission_classes = [IsAdminUser]
    queryset = Company.objects.all()
    http_method_names = ["get", "patch", "put"]

    def get_serializer_class(self):
        if self.request.method in ("PATCH", "PUT"):
            return CompanyUpdateSerializer
        return CompanySerializer 




class PlatformContactView(APIView):
    """
    GET  — публичный (для TenantBlockedScreen и заблокированных тенантов)
    PUT  — только superuser (редактирование через global-admin UI)
    """
    pagination_class = None
    parser_classes = [MultiPartParser, FormParser]

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAdminUser()]

    def get(self, request):
        contact = PlatformContact.objects.filter(is_active=True).first()
        if not contact:
            return Response({})
        return Response(PlatformContactSerializer(contact).data)

    def put(self, request):
        contact = PlatformContact.objects.first()
        if not contact:
            contact = PlatformContact()
        serializer = PlatformContactSerializer(contact, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)
