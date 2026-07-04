



# backend/init_tenant.py
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from django_tenants.utils import tenant_context
from companies.models import Company, Domain, PlatformContact
from accounting.models import (
    Account, CompanyProfile, Branch,
    Unit, Brand, ProductCategory, Tag, PriceType, Currency, Warehouse, Position,
)



# def initialize_system():
#     domain_name = os.environ.get('PROJECT_DOMAIN', '192.168.43.13.nip.io')

#     # ------------------------------------------------------------------
#     # 1. Создание публичной схемы
#     # ------------------------------------------------------------------
#     if not Company.objects.filter(schema_name='public').exists():
#         print(f"--- Создаем публичную схему для {domain_name} ---")
#         public_tenant = Company.objects.create(schema_name='public', name='ERP Platform Root')
#         Domain.objects.create(domain=domain_name, tenant=public_tenant, is_primary=True)
#         print("--- Схема public создана ---")
#     else:
#         print("--- Схема public уже существует ---")
#         public_tenant = Company.objects.get(schema_name='public')

#     # ------------------------------------------------------------------
#     # 1.5. SaaS суперпользователь (public схема)
#     # ------------------------------------------------------------------
#     with tenant_context(public_tenant):
#         User = get_user_model()
#         saas_username = os.environ.get('DJANGO_SAAS_SUPERUSER_LOGIN')
#         saas_email = os.environ.get('DJANGO_SAAS_SUPERUSER_EMAIL')
#         saas_password = os.environ.get('DJANGO_SAAS_SUPERUSER_PASSWORD')

#         if saas_password and saas_username and not User.objects.filter(username=saas_username).exists():
#             User.objects.create_superuser(username=saas_username, email=saas_email, password=saas_password)
#             print(f"--- SaaS суперпользователь '{saas_username}' создан ---")

#     # ------------------------------------------------------------------
#     # 2. Создание тенанта
#     # ------------------------------------------------------------------
#     company_schema = os.environ.get('COMPANY_SCHEME')
#     company_domain = f"{company_schema}.{domain_name}"

#     if not Company.objects.filter(schema_name=company_schema).exists():
#         print(f"--- Создаем тенант '{company_schema}' ---")
#         tenant_company = Company.objects.create(schema_name=company_schema, name=f'Компания {company_schema}')
#         Domain.objects.create(domain=company_domain, tenant=tenant_company, is_primary=True)
#         print(f"--- Тенант '{company_schema}' создан на домене {company_domain} ---")
#     else:
#         print(f"--- Тенант '{company_schema}' уже существует ---")
#         tenant_company = Company.objects.get(schema_name=company_schema)

def initialize_system():
    domain_name = os.environ.get('PROJECT_DOMAIN', 'erp.local')

    # ------------------------------------------------------------------
    # 1. Публичная схема
    # ------------------------------------------------------------------
    if not Company.objects.filter(schema_name='public').exists():
        print(f"--- Создаем публичную схему для {domain_name} ---")
        public_tenant = Company.objects.create(schema_name='public', name='ERP Platform Root')
        Domain.objects.create(domain=domain_name, tenant=public_tenant, is_primary=True)
        print("--- Схема public создана ---")
    else:
        print("--- Схема public уже существует ---")
        public_tenant = Company.objects.get(schema_name='public')
        
        # ✅ Обновляем домен если изменился
        existing_domain = Domain.objects.filter(tenant=public_tenant, is_primary=True).first()
        if existing_domain and existing_domain.domain != domain_name:
            print(f"--- Обновляем домен public: {existing_domain.domain} → {domain_name} ---")
            existing_domain.domain = domain_name
            existing_domain.save()
            
            
        # ------------------------------------------------------------------
    # 1.5. SaaS суперпользователь (public схема)
    # ------------------------------------------------------------------
    with tenant_context(public_tenant):
        User = get_user_model()
        saas_username = os.environ.get('DJANGO_SAAS_SUPERUSER_LOGIN')
        saas_email = os.environ.get('DJANGO_SAAS_SUPERUSER_EMAIL')
        saas_password = os.environ.get('DJANGO_SAAS_SUPERUSER_PASSWORD')

        if saas_password and saas_username and not User.objects.filter(username=saas_username).exists():
            User.objects.create_superuser(username=saas_username, email=saas_email, password=saas_password)
            print(f"--- SaaS суперпользователь '{saas_username}' создан ---")

        # ------------------------------------------------------------------
        # 1.6. Контакты владельца платформы (public схема)
        # ------------------------------------------------------------------
        platform_contact, created = PlatformContact.objects.get_or_create(
            id=1,
            defaults={
                'full_name': 'Sharipov Anvar',
                'address': 'Merkez-2, jay-3, oy 55',
                'phone': '+99361304356',
                'phone2': '99332237383',
                'email': 'anvar7235@gmail.com',
                'telegram': 'dejavu',
                'is_active': True,
            }
        )
        if created:
            print("--- Контакты платформы созданы ---")
        else:
            print("--- Контакты платформы уже существуют ---")

    # ------------------------------------------------------------------
    # 2. Тенант
    # ------------------------------------------------------------------
    company_schema = os.environ.get('COMPANY_SCHEME')
    company_domain = f"{company_schema}.{domain_name}"

    if not Company.objects.filter(schema_name=company_schema).exists():
        print(f"--- Создаем тенант '{company_schema}' ---")
        tenant_company = Company.objects.create(schema_name=company_schema, name=f'Компания {company_schema}')
        Domain.objects.create(domain=company_domain, tenant=tenant_company, is_primary=True)
        print(f"--- Тенант '{company_schema}' создан на домене {company_domain} ---")
    else:
        print(f"--- Тенант '{company_schema}' уже существует ---")
        tenant_company = Company.objects.get(schema_name=company_schema)

        # ✅ Обновляем домен тенанта если изменился
        existing_tenant_domain = Domain.objects.filter(tenant=tenant_company, is_primary=True).first()
        if existing_tenant_domain and existing_tenant_domain.domain != company_domain:
            print(f"--- Обновляем домен тенанта: {existing_tenant_domain.domain} → {company_domain} ---")
            existing_tenant_domain.domain = company_domain
            existing_tenant_domain.save()

    # ------------------------------------------------------------------
    # 3. Всё внутри тенанта
    # ------------------------------------------------------------------
    with tenant_context(tenant_company):
        User = get_user_model()
        from users.models import Role, Permission, RolePermission, UserRole

        # 3.1 Суперпользователь тенанта
        su_username = os.environ.get('DJANGO_SUPERUSER_USERNAME', 'admin')
        su_email = os.environ.get('DJANGO_SUPERUSER_EMAIL', 'admin@erp.local')
        su_password = os.environ.get('DJANGO_SUPERUSER_PASSWORD')

        if not su_password:
            print("⚠️ DJANGO_SUPERUSER_PASSWORD не задан — админ не создан")
            return

        if not User.objects.filter(username=su_username).exists():
            User.objects.create_superuser(username=su_username, email=su_email, password=su_password)
            print(f"--- Суперпользователь '{su_username}' создан ---")
        else:
            print(f"--- Суперпользователь '{su_username}' уже существует ---")

        # 3.2 Роли
        role_admin, _ = Role.objects.get_or_create(name='Администратор')
        role_accountant, _ = Role.objects.get_or_create(name='Бухгалтер')
        role_manager, _ = Role.objects.get_or_create(name='Менеджер')
        print("--- Роли созданы ---")

        # 3.3 Назначаем ВСЕ permissions роли Администратор
        all_permissions = Permission.objects.all()
        for perm in all_permissions:
            RolePermission.objects.get_or_create(role=role_admin, permission=perm)
        print(f"--- Роли 'Администратор' назначено {all_permissions.count()} прав ---")

        # Бухгалтеру — только GET на всё + POST/PUT на accounting
        accounting_resources = ['account', 'journalentry', 'transaction', 'companyprofile', 'branch']
        for perm in Permission.objects.filter(action='GET'):
            RolePermission.objects.get_or_create(role=role_accountant, permission=perm)
        for perm in Permission.objects.filter(resource__in=accounting_resources, action__in=['POST', 'PUT', 'PATCH', 'DELETE']):
            RolePermission.objects.get_or_create(role=role_accountant, permission=perm)
        print("--- Права роли 'Бухгалтер' настроены ---")

        # Менеджеру — GET на всё + работа с контрагентами/товарами/справочниками
        manager_resources = ['counterparty', 'product', 'warehouse', 'directory', 'directoryrecord', 'directoryfield']
        for perm in Permission.objects.filter(action='GET'):
            RolePermission.objects.get_or_create(role=role_manager, permission=perm)
        for perm in Permission.objects.filter(resource__in=manager_resources, action__in=['POST', 'PUT', 'PATCH', 'DELETE']):
            RolePermission.objects.get_or_create(role=role_manager, permission=perm)
        print("--- Права роли 'Менеджер' настроены ---")

        # 3.4 Тестовые пользователи
        test_users = [
            {'username': 'sharipov_a',  'first_name': 'Anvar',    'last_name': 'Sharipov',    'email': 'sharipov_a@erp.local',  'password': 'useruser', 'role': role_admin,     'phone': '+99361129483', 'position': 'CEO'},
            {'username': 'ivanova_m',   'first_name': 'Marina',    'last_name': 'Ivanova',     'email': 'ivanova_m@erp.local',   'password': 'useruser', 'role': role_accountant, 'phone': '+99361740295', 'position': 'Главный бухгалтер'},
            {'username': 'petrov_d',    'first_name': 'Dmitry',    'last_name': 'Petrov',      'email': 'petrov_d@erp.local',    'password': 'useruser', 'role': role_accountant, 'phone': '+99361583726', 'position': 'Бухгалтер'},
            {'username': 'karimov_b',   'first_name': 'Bobur',     'last_name': 'Karimov',     'email': 'karimov_b@erp.local',   'password': 'useruser', 'role': role_manager,    'phone': '+99361924510', 'position': 'Менеджер по продажам'},
            {'username': 'smirnova_e',  'first_name': 'Elena',     'last_name': 'Smirnova',    'email': 'smirnova_e@erp.local',  'password': 'useruser', 'role': role_manager,    'phone': '+99362305847', 'position': 'HR-менеджер'},
            {'username': 'tashmatov_j', 'first_name': 'Jasur',     'last_name': 'Tashmatov',   'email': 'tashmatov_j@erp.local', 'password': 'useruser', 'role': role_admin,      'phone': '+99362619374', 'position': 'Администратор'},
            {'username': 'kozlov_n',    'first_name': 'Nikolay',   'last_name': 'Kozlov',      'email': 'kozlov_n@erp.local',    'password': 'useruser', 'role': role_accountant, 'phone': '+99362847261', 'position': 'Аудитор'},
            {'username': 'yusupova_z',  'first_name': 'Zulfiya',   'last_name': 'Yusupova',    'email': 'yusupova_z@erp.local',  'password': 'useruser', 'role': role_manager,    'phone': '+99362159382', 'position': 'Менеджер проектов'},
            {'username': 'fedorov_s',   'first_name': 'Sergey',    'last_name': 'Fedorov',     'email': 'fedorov_s@erp.local',   'password': 'useruser', 'role': role_manager,    'phone': '+99363472910', 'position': 'Руководитель отдела'},
            {'username': 'nazarov_o',   'first_name': 'Otabek',    'last_name': 'Nazarov',     'email': 'nazarov_o@erp.local',   'password': 'useruser', 'role': role_accountant, 'phone': '+99363829475', 'position': 'Помощник бухгалтера'},
            {'username': 'volkova_t',   'first_name': 'Tatyana',   'last_name': 'Volkova',     'email': 'volkova_t@erp.local',   'password': 'useruser', 'role': role_admin,      'phone': '+99363194857', 'position': 'Системный администратор'},
            {'username': 'rakhimov_f',  'first_name': 'Farruкh',   'last_name': 'Rakhimov',    'email': 'rakhimov_f@erp.local',  'password': 'useruser', 'role': role_manager,    'phone': '+99363530294', 'position': 'Менеджер по закупкам'},
            {'username': 'morozova_a',  'first_name': 'Anna',      'last_name': 'Morozova',    'email': 'morozova_a@erp.local',  'password': 'useruser', 'role': role_accountant, 'phone': '+99365284719', 'position': 'Бухгалтер-кассир'},
            {'username': 'xasanov_m',   'first_name': 'Murod',     'last_name': 'Xasanov',     'email': 'xasanov_m@erp.local',   'password': 'useruser', 'role': role_manager,    'phone': '+99365937462', 'position': 'Коммерческий директор'},
            {'username': 'lebedeva_o',  'first_name': 'Olga',      'last_name': 'Lebedeva',    'email': 'lebedeva_o@erp.local',  'password': 'useruser', 'role': role_accountant, 'phone': '+99365410293', 'position': 'Экономист'},
        ]

        for u in test_users:
            if not User.objects.filter(username=u['username']).exists():
                user = User.objects.create_user(
                    username=u['username'],
                    first_name=u['first_name'],
                    last_name=u['last_name'],
                    email=u['email'],
                    password=u['password'],
                )
                UserRole.objects.get_or_create(user=user, role=u['role'])
                print(f"--- Пользователь '{u['first_name']} {u['last_name']}' создан с ролью '{u['role'].name}' ---")
            else:
                print(f"--- Пользователь '{u['username']}' уже существует ---")
                
                
                
        # 3.5 План счетов
        accounts_data = [
            # Группы (родительские счета)
            {'code': '01', 'name': 'Основные средства',            'is_group': True,  'parent': None, 'account_type': 'A'},
            {'code': '10', 'name': 'Материалы',                    'is_group': True,  'parent': None, 'account_type': 'A'},
            {'code': '41', 'name': 'Товары',                       'is_group': True,  'parent': None, 'account_type': 'A'},
            {'code': '50', 'name': 'Касса',                        'is_group': True,  'parent': None, 'account_type': 'A'},
            {'code': '51', 'name': 'Расчётные счета',              'is_group': True,  'parent': None, 'account_type': 'A'},
            {'code': '60', 'name': 'Расчёты с поставщиками',       'is_group': True,  'parent': None, 'account_type': 'AP'},
            {'code': '62', 'name': 'Расчёты с покупателями',       'is_group': True,  'parent': None, 'account_type': 'AP'},
            {'code': '70', 'name': 'Расчёты с персоналом по ЗП',   'is_group': True,  'parent': None, 'account_type': 'P'},
            {'code': '80', 'name': 'Уставный капитал',             'is_group': True,  'parent': None, 'account_type': 'P'},
            {'code': '90', 'name': 'Продажи',                      'is_group': True,  'parent': None, 'account_type': 'AP'},

            # Субсчета
            {'code': '01.1', 'name': 'ОС в организации',           'is_group': False, 'parent': '01', 'account_type': 'A'},
            {'code': '01.2', 'name': 'Выбытие ОС',                 'is_group': False, 'parent': '01', 'account_type': 'A'},
            {'code': '10.1', 'name': 'Сырьё и материалы',          'is_group': False, 'parent': '10', 'account_type': 'A'},
            {'code': '10.4', 'name': 'Тара и тарные материалы',    'is_group': False, 'parent': '10', 'account_type': 'A'},
            {'code': '41.1', 'name': 'Товары на складах',          'is_group': False, 'parent': '41', 'account_type': 'A'},
            {'code': '41.2', 'name': 'Товары в розничной торговле','is_group': False, 'parent': '41', 'account_type': 'A'},
            {'code': '50.1', 'name': 'Касса организации',          'is_group': False, 'parent': '50', 'account_type': 'A'},
            {'code': '60.1', 'name': 'Расчёты с поставщиками',     'is_group': False, 'parent': '60', 'account_type': 'AP'},
            {'code': '60.2', 'name': 'Авансы выданные',            'is_group': False, 'parent': '60', 'account_type': 'A'},
            {'code': '62.1', 'name': 'Расчёты с покупателями',     'is_group': False, 'parent': '62', 'account_type': 'AP'},
            {'code': '62.2', 'name': 'Авансы полученные',          'is_group': False, 'parent': '62', 'account_type': 'P'},
            {'code': '90.1', 'name': 'Выручка',                    'is_group': False, 'parent': '90', 'account_type': 'P'},
            {'code': '90.2', 'name': 'Себестоимость продаж',       'is_group': False, 'parent': '90', 'account_type': 'A'},
        ]

        # Сначала создаём группы (без parent), потом субсчета
        for item in accounts_data:
            if item['parent'] is None:
                Account.objects.get_or_create(
                    code=item['code'],
                    defaults={
                        'name': item['name'],
                        'is_group': item['is_group'],
                        'account_type': item['account_type'],
                        'parent': None,
                    }
                )

        for item in accounts_data:
            if item['parent'] is not None:
                try:
                    parent = Account.objects.get(code=item['parent'])
                    Account.objects.get_or_create(
                        code=item['code'],
                        defaults={
                            'name': item['name'],
                            'is_group': item['is_group'],
                            'account_type': item['account_type'],
                            'parent': parent,
                        }
                    )
                except Account.DoesNotExist:
                    print(f"⚠️ Родительский счёт '{item['parent']}' не найден для '{item['code']}'")

        print(f"--- План счетов создан: {Account.objects.count()} счетов ---")
        
        
        
        
        
        

        # 3.6 Профиль компании
        profile, created = CompanyProfile.objects.get_or_create(
            id=1,
            defaults={
                'name': 'ООО Торговый Дом Восток',
                'tax_id': '123456789',
                'bank_name': 'Государственный банк Туркменистана',
                'bank_account': '40702810000000001234',
                'mfo': '044525225',
                'address': 'г. Ашхабад, ул. Битарап Туркменистан, 15',
                'director_name': 'Шарипов Анвар Рустамович',
                'chief_accountant_name': 'Иванова Марина Сергеевна',
                'phone_official': '+993 12 123456',
                'phone_official2': '+993 65 123456',
                'email_official': 'info@vostok.tm',
                'website': 'https://vostok.tm',
                'base_currency': 'TMT',
            }
        )
        if created:
            print("--- Профиль компании создан ---")
        else:
            print("--- Профиль компании уже существует ---")

        # 3.7 Филиалы
        branches_data = [
            {
                'name': 'Главный офис',
                'code': 'HQ',
                'is_head_office': True,
                'city': 'Ашхабад',
                'address': 'г. Ашхабад, ул. Битарап Туркменистан, 15',
                'phone': '+993 12 123456',
                'email': 'hq@vostok.tm',
                'manager_name': 'Шарипов Анвар Рустамович',
                'manager_position': 'Генеральный директор',
                'is_active': True,
            },
            {
                'name': 'Филиал Мары',
                'code': 'MARY',
                'is_head_office': False,
                'city': 'Мары',
                'address': 'г. Мары, ул. Гарашсызлык, 42',
                'phone': '+993 522 12345',
                'email': 'mary@vostok.tm',
                'manager_name': 'Ташматов Жасур Алиевич',
                'manager_position': 'Директор филиала',
                'is_active': True,
            },
            {
                'name': 'Филиал Туркменабат',
                'code': 'TURK',
                'is_head_office': False,
                'city': 'Туркменабат',
                'address': 'г. Туркменабат, ул. Магтымгулы, 8',
                'phone': '+993 422 12345',
                'email': 'turkmenabat@vostok.tm',
                'manager_name': 'Назаров Отабек Мурадович',
                'manager_position': 'Директор филиала',
                'is_active': True,
            },
        ]

        for b in branches_data:
            _, created = Branch.objects.get_or_create(
                code=b['code'],
                defaults={**b, 'company_profile': profile}
            )
            if created:
                print(f"--- Филиал '{b['name']}' создан ---")
            else:
                print(f"--- Филиал '{b['name']}' уже существует ---")

        # 3.8 Единицы измерения
        units_data = [
            {'name': 'Штука', 'short_name': 'шт'},
            {'name': 'Килограмм', 'short_name': 'кг'},
            {'name': 'Литр', 'short_name': 'л'},
            {'name': 'Метр', 'short_name': 'м'},
            {'name': 'Квадратный метр', 'short_name': 'м²'},
            {'name': 'Упаковка', 'short_name': 'уп'},
        ]
        for u in units_data:
            _, created = Unit.objects.get_or_create(short_name=u['short_name'], defaults={'name': u['name']})
        print(f"--- Единицы измерения: {Unit.objects.count()} ---")

        # 3.9 Бренды
        brands_data = ['TechnoPro', 'AquaLine', 'BuildMaster', 'EcoPlast']
        for name in brands_data:
            Brand.objects.get_or_create(name=name, defaults={'slug': name.lower()})
        print(f"--- Бренды: {Brand.objects.count()} ---")

        # 3.10 Категории товаров (несколько уровней вложенности)
        categories_data = [
            # Корневые
            {'name': 'Электроника', 'slug': 'electronics', 'parent': None},
            {'name': 'Строительные материалы', 'slug': 'building-materials', 'parent': None},

            # 2-й уровень
            {'name': 'Компьютеры', 'slug': 'computers', 'parent': 'electronics'},
            {'name': 'Телефоны', 'slug': 'phones', 'parent': 'electronics'},
            {'name': 'Трубы и фитинги', 'slug': 'pipes-fittings', 'parent': 'building-materials'},
            {'name': 'Крепёж', 'slug': 'fasteners', 'parent': 'building-materials'},

            # 3-й уровень
            {'name': 'Ноутбуки', 'slug': 'laptops', 'parent': 'computers'},
            {'name': 'Комплектующие', 'slug': 'computer-parts', 'parent': 'computers'},
            {'name': 'Металлические трубы', 'slug': 'metal-pipes', 'parent': 'pipes-fittings'},
            {'name': 'Пластиковые трубы', 'slug': 'plastic-pipes', 'parent': 'pipes-fittings'},
        ]
        for c in categories_data:
            if c['parent'] is None:
                ProductCategory.objects.get_or_create(slug=c['slug'], defaults={'name': c['name'], 'parent': None})
        for c in categories_data:
            if c['parent'] is not None:
                try:
                    parent = ProductCategory.objects.get(slug=c['parent'])
                    ProductCategory.objects.get_or_create(slug=c['slug'], defaults={'name': c['name'], 'parent': parent})
                except ProductCategory.DoesNotExist:
                    print(f"⚠️ Родительская категория '{c['parent']}' не найдена для '{c['slug']}'")
        print(f"--- Категории товаров: {ProductCategory.objects.count()} ---")

        # 3.11 Теги
        tags_data = ['Новинка', 'Хит продаж', 'Акция']
        for name in tags_data:
            Tag.objects.get_or_create(name=name, defaults={'slug': name.lower().replace(' ', '-')})
        print(f"--- Теги: {Tag.objects.count()} ---")

        # 3.12 Типы цен
        price_types_data = ['Розничная', 'Оптовая', 'Закупочная']
        for name in price_types_data:
            PriceType.objects.get_or_create(name=name)
        print(f"--- Типы цен: {PriceType.objects.count()} ---")

        # 3.13 Валюты
        currencies_data = [
            {'code': 'TMT', 'name': 'Туркменский манат', 'symbol': 'м'},
            {'code': 'USD', 'name': 'Доллар США', 'symbol': '$'},
            {'code': 'EUR', 'name': 'Евро', 'symbol': '€'},
            {'code': 'RUB', 'name': 'Российский рубль', 'symbol': '₽'},
        ]
        for c in currencies_data:
            Currency.objects.get_or_create(code=c['code'], defaults={'name': c['name'], 'symbol': c['symbol']})
        print(f"--- Валюты: {Currency.objects.count()} ---")

        # 3.14 Склады (по одному основному на филиал + резервный на главном офисе)
        hq = Branch.objects.filter(code='HQ').first()
        mary = Branch.objects.filter(code='MARY').first()
        turk = Branch.objects.filter(code='TURK').first()
        warehouses_data = [
            {'name': 'Основной склад HQ', 'branch': hq, 'is_main': True},
            {'name': 'Резервный склад HQ', 'branch': hq, 'is_main': False},
            {'name': 'Склад Мары', 'branch': mary, 'is_main': True},
            {'name': 'Склад Туркменабат', 'branch': turk, 'is_main': True},
        ]
        for w in warehouses_data:
            if not w['branch']:
                continue
            Warehouse.objects.get_or_create(name=w['name'], branch=w['branch'], defaults={'is_main': w['is_main']})
        print(f"--- Склады: {Warehouse.objects.count()} ---")

        # 3.15 Должности (из позиций тестовых пользователей выше)
        positions_data = sorted({u['position'] for u in test_users})
        for name in positions_data:
            Position.objects.get_or_create(name=name)
        print(f"--- Должности: {Position.objects.count()} ---")


if __name__ == '__main__':
    initialize_system()