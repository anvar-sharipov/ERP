# 🏢 MyERP — Multi-Tenant ERP & Accounting Platform

## 📋 About

MyERP is a multi-tenant ERP system with modular architecture, inspired by 1C:Enterprise. Each company runs in an isolated PostgreSQL schema. The system features a no-code directory constructor, chart of accounts, double-entry bookkeeping, and real-time WebSocket notifications.

## ✨ Features

- 🏢 **Multi-tenancy** — schema-based isolation per company (django-tenants)
- 🔐 **RBAC** — per-method role-based access control (GET/POST/PUT/PATCH/DELETE)
- ⚡ **WebSocket** — real-time permission updates via Django Channels + Redis
- 📚 **No-code directories** — dynamic directory constructor with JSONB fields and GIN indexes
- 📊 **Chart of accounts** — hierarchical accounts with subconto and double-entry
- 🏗️ **Modular architecture** — independent modules (accounting, warehouse, CRM)
- 🌍 **Multilingual** — RU / EN / TK
- 🌙 **Dark mode**
- 📱 **Responsive UI**
- 📄 **Export** — Excel and print

## 🛠️ Tech Stack

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Python | 3.11 | Language |
| Django | 5.1 | Web framework |
| Django REST Framework | 3.16 | REST API |
| django-tenants | 3.7 | Schema-based multi-tenancy |
| Django Channels | 4.3 | WebSocket |
| Daphne | 4.1 | ASGI server |
| SimpleJWT | 5.4 | JWT authentication |
| PostgreSQL | 15 | Database |
| Redis | 7 | WebSocket broker |

### Frontend
| Technology | Purpose |
|------------|---------|
| React 18 + TypeScript | UI |
| Vite | Build tool |
| TanStack Query | Data fetching & caching |
| Tailwind CSS | Styling |
| Axios | HTTP client |
| i18next | Internationalization |

## 🚀 Quick Start

### Requirements
- Docker Desktop
- Git

### 1. Clone
```bash
git clone https://github.com/username/my_erp.git
cd my_erp
```

### 2. Configure
```bash
cp .env.example .env
# Edit .env with your settings
```

### 3. Run
```bash
docker-compose up -d --build
```

### 4. Open 
https://test1.your-domain.nip.io


On first launch, the following happens automatically:
- 🔐 **SSL certificate generation** — self-signed certificate is created by the `ssl-gen` service if not present in `nginx/ssl/`
- 🗄️ **DB migrations** — schema and table creation
- 🏢 **Tenant initialization** — companies and superusers
- 🔑 **Permission sync** — all RBAC permissions for all tenants
- 👥 **Seed data** — users, roles, chart of accounts, branches
- 📦 **Static files** — Django collectstatic

## 📁 Project structure (see file structure.txt)

## 👥 Test Users

| Login | Password | Role |
|-------|----------|------|
| test1 | useruser | Superuser |
| sharipov_a | useruser | Administrator |
| ivanova_m | useruser | Accountant |
| karimov_b | useruser | Manager |

## 🔐 RBAC System

Permissions are checked per HTTP method. When a role's permissions change, all online users receive a WebSocket notification and the UI updates instantly without page reload.

## 📝 License

MIT