# 🏢 MyERP — Многопользовательская ERP/Бухгалтерская платформа

## 📋 О проекте

MyERP — это многопользовательская (multi-tenant) ERP-система с модульной архитектурой, построенная по принципу аналога 1С. Каждая компания работает в изолированной схеме базы данных. Система поддерживает гибкий no-code конструктор справочников, план счетов, двойную запись и WebSocket-уведомления в реальном времени.

## ✨ Возможности

- 🏢 **Multi-tenancy** — каждая компания в отдельной схеме PostgreSQL (django-tenants)
- 🔐 **RBAC** — ролевая система прав с per-method проверкой (GET/POST/PUT/PATCH/DELETE)
- ⚡ **WebSocket** — мгновенное обновление прав при изменении ролей (Django Channels + Redis)
- 📚 **No-code справочники** — конструктор справочников с JSONB полями и GIN-индексами
- 📊 **План счетов** — иерархическая структура счетов с субконто и двойной записью
- 🏗️ **Модульная архитектура** — независимые модули (бухгалтерия, склад, CRM)
- 🌍 **Мультиязычность** — RU / EN / TK (туркменский)
- 🌙 **Dark mode** — светлая и тёмная тема
- 📱 **Адаптивный интерфейс** — мобильная и десктопная версия
- 📄 **Экспорт** — Excel и печать таблиц

## 🛠️ Технологии

### Backend
| Технология | Версия | Назначение |
|------------|--------|------------|
| Python | 3.11 | Язык программирования |
| Django | 5.1 | Web-фреймворк |
| Django REST Framework | 3.16 | REST API |
| django-tenants | 3.7 | Multi-tenancy (schema-based) |
| Django Channels | 4.3 | WebSocket |
| Daphne | 4.1 | ASGI сервер |
| SimpleJWT | 5.4 | JWT аутентификация |
| PostgreSQL | 15 | База данных |
| Redis | 7 | Брокер для WebSocket |
| channels_redis | 4.3 | Channel layer |

### Frontend
| Технология | Версия | Назначение |
|------------|--------|------------|
| React | 18 | UI фреймворк |
| TypeScript | 5 | Типизация |
| Vite | 5 | Сборщик |
| TanStack Query | 5 | Кэширование и синхронизация данных |
| Tailwind CSS | 3 | Стилизация |
| Axios | 1.7 | HTTP клиент |
| i18next | — | Интернационализация |
| ExcelJS | — | Экспорт в Excel |
| Lucide React | — | Иконки |

### Инфраструктура
- **Docker + Docker Compose** — контейнеризация
- **Nginx** — reverse proxy, SSL termination, раздача статики
- **SSL** — самоподписанный (dev) / Let's Encrypt (prod)

## 🏗️ Архитектура
┌─────────────────────────────────────────────────────┐

│                     Nginx (80/443)                   │

│  /          → Frontend (React)                       │

│  /api/      → Backend (Daphne:8000)                 │

│  /ws/       → WebSocket (Daphne:8000)               │

│  /static/   → Django static files                   │

│  /media/    → User uploads                          │

└─────────────────────────────────────────────────────┘

│                    │

┌────┴────┐          ┌────┴────┐

│ Django  │          │  React  │

│ Daphne  │          │  Vite   │

└────┬────┘          └─────────┘

│

┌────┴──────────────────┐

│   PostgreSQL          │

│  ┌─────────────────┐  │

│  │  schema: public │  │  ← SaaS admin

│  ├─────────────────┤  │

│  │  schema: test1  │  │  ← Компания 1

│  ├─────────────────┤  │

│  │  schema: test2  │  │  ← Компания 2

│  └─────────────────┘  │

└───────────────────────┘

│

┌────┴────┐

│  Redis  │  ← WebSocket Channel Layer

└─────────┘

## 🚀 Быстрый старт

### Требования
- Docker Desktop
- Git

### 1. Клонировать репозиторий
```bash
git clone https://github.com/username/my_erp.git
cd my_erp
```

### 2. Создать `.env` файл
```bash
cp .env.example .env
# Отредактируй .env под своё окружение
```

### 3. Запустить
```bash
docker-compose up -d --build
```

### 4. Открыть в браузере (пример public 192.168.43.13.nip.io, tenant test1.192.168.43.13.nip.io)

При первом запуске автоматически выполняется:
- 🔐 **Генерация SSL сертификата** — самоподписанный сертификат создаётся сервисом `ssl-gen` если его ещё нет в `nginx/ssl/`
- 🗄️ **Миграции БД** — создание схем и таблиц
- 🏢 **Инициализация тенантов** — создание компаний, суперпользователей
- 🔑 **Синхронизация прав** — все RBAC permissions для всех тенантов
- 👥 **Тестовые данные** — пользователи, роли, план счетов, филиалы
- 📦 **Сборка статики** — Django collectstatic

## 👥 Тестовые пользователи

| Логин | Пароль | Роль |
|-------|--------|------|
| test1 | useruser | Суперпользователь |
| sharipov_a | useruser | Администратор |
| ivanova_m | useruser | Бухгалтер |
| karimov_b | useruser | Менеджер |

## 📁 Структура проекта (смотри файл structure.txt)


## ⚙️ Переменные окружения

Создай `.env` в корне проекта на основе `.env.example`:

```env
PROJECT_DOMAIN=192.168.43.13.nip.io
DJANGO_SECRET_KEY=your-secret-key
DJANGO_DEBUG=False

DB_NAME=erp_db
DB_USER=postgres
DB_PASSWORD=your-password
DB_HOST=db

REDIS_URL=redis://redis:6379/1

COMPANY_SCHEME=test1
DJANGO_SUPERUSER_USERNAME=admin
DJANGO_SUPERUSER_EMAIL=admin@erp.local
DJANGO_SUPERUSER_PASSWORD=your-password

DJANGO_SAAS_SUPERUSER_LOGIN=saasadmin
DJANGO_SAAS_SUPERUSER_EMAIL=saas@erp.local
DJANGO_SAAS_SUPERUSER_PASSWORD=your-password
```

## 🔐 RBAC система

Права проверяются на уровне каждого HTTP метода:

```python
# Пример использования
class BranchViewSet(viewsets.ModelViewSet):
    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated(), HasPermission('branch', 'GET')()]
        elif self.action == 'create':
            return [IsAuthenticated(), HasPermission('branch', 'POST')()]
        ...
```

При изменении прав роли — все онлайн-пользователи получают WebSocket уведомление и UI обновляется в реальном времени без перезагрузки страницы.

## 📝 Лицензия

MIT