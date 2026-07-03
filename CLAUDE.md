# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

MyERP is a multi-tenant ERP/accounting platform (1C-like) built with Django + django-tenants (schema-per-company on PostgreSQL) and a React/TypeScript SPA. Core domain: chart of accounts with double-entry bookkeeping, no-code directories (справочники) with JSONB fields, and per-method RBAC with live WebSocket permission/scope updates.

Backend and frontend code comments, commit messages, and much of the domain vocabulary are in Russian — match that when editing existing files.

## Commands

### Backend (run from `backend/`, with `venv` activated or inside the `backend` container)
```bash
python manage.py migrate_schemas --shared --noinput   # migrate public schema
python manage.py migrate_schemas --noinput             # migrate all tenant schemas
python init_tenant.py                                   # create tenants/superusers from .env
python manage.py sync_permissions                       # sync RBAC Permission rows for every tenant
python manage.py runserver                              # plain HTTP dev server (no WS)
daphne -b 0.0.0.0 -p 8000 config.asgi:application        # ASGI server (HTTP + WebSocket), used in Docker/prod

# Tests (django-tenants TestCase, no pytest — see backend/accounting/tests/base.py)
python manage.py test accounting.tests                        # all RBAC/accounting tests
python manage.py test accounting.tests.test_rbac_branches     # one file
python manage.py test accounting.tests.test_rbac_all.SomeTestClass.test_name  # one test
```
Tenant-aware tests must subclass `django_tenants.test.cases.TenantTestCase` (see `backend/accounting/tests/base.py::BaseRBACTest`), which spins up a real tenant schema per test. Plain `django.test.TestCase` will not see tenant-schema models.

### Frontend (run from `frontend/`)
```bash
npm run dev       # Vite dev server on :5173, proxies /api, /media, /ws to Django on :8000
npm run build      # tsc -b && vite build
npm run lint       # eslint .
```

### Docker (full stack, run from repo root)
```bash
docker-compose up -d --build
```
On startup the `backend` service runs migrations, `init_tenant.py`, `sync_permissions`, `collectstatic`, then starts Daphne. Nginx (`nginx/`) fronts everything: `/` → frontend, `/api/` and `/ws/` → Daphne, `/static/` and `/media/` → Django-collected files. Config comes from `.env` (see `.env.example`); domains are tenant subdomains of `PROJECT_DOMAIN` (e.g. `test1.<PROJECT_DOMAIN>`).

## Architecture

### Multi-tenancy (django-tenants)
- `TENANT_MODEL = companies.Company`, `TENANT_DOMAIN_MODEL = companies.Domain`. Each company is a separate PostgreSQL schema; the `public` schema holds shared/SaaS-admin data.
- `SHARED_APPS` (public schema only) vs `TENANT_APPS` (per-tenant schema) are both listed in `backend/config/settings.py`; `users` and `companies` are shared, `accounting` and `chat` are tenant-only. When adding a new Django app, decide which bucket it belongs to.
- Tenant resolution is by subdomain via `TenantMainMiddleware`, followed by `companies.middleware.TenantActiveCheckMiddleware`, which blocks all requests with a `tenant_inactive` 403 if the tenant's license/`is_active` flag is off (a small allowlist of paths/prefixes bypasses this).
- Two URLconfs: `config.urls` (tenant schemas) vs `config.urls_public` (public/SaaS schema), selected automatically by django-tenants based on the resolved tenant.
- Frontend detects the tenant purely from the browser hostname (`frontend/src/core/utils/tenant.ts::getTenantInfo`) — there is no tenant ID in API calls; the `Host` header carries it. `vite.config.ts` deliberately disables `changeOrigin` and forwards the original `Host`/`X-Forwarded-Host` so the dev proxy preserves tenant resolution.

### RBAC (per-HTTP-method permissions)
- Models: `users.Role`, `users.Permission` (resource + HTTP action, e.g. `("branch", "GET")`), `users.RolePermission`, `users.UserRole`.
- `users/permissions.py::HasPermission(resource, action)` is a DRF permission factory checked against a 5-minute cache (`user_perms_<id>`) of the user's `(resource, action)` pairs; superusers bypass everything.
- `users/permissions.py::_rbac(action, resource)` maps DRF viewset actions (`list`/`create`/`update`/custom `@action`s) to the HTTP verb used for the permission check — viewsets typically call this from `get_permissions()` per action rather than hand-rolling permission classes.
- On any Role/RolePermission change, `users/rbac_events.py::notify_role_permissions_changed` invalidates the affected users' cache and pushes a WebSocket event to group `rbac_user_<id>` so already-logged-in browsers refresh permissions without reloading (see `ws/rbac/`, consumed by `frontend/src/core/hooks/useRBACSocket.ts`).
- A parallel "scope" system (`users/scope_events.py`, `ws/scope/`, `useScopeSocket.ts`) does the same for per-user data scoping (e.g. branch access) — same cache-then-broadcast pattern.
- Frontend mirrors this with `useAccess.ts` (`hasPermission(resource, action)` checked against `user.permissions` strings like `"branch.GET"`) and route guards in `core/router/` (`ProtectedRoute`, `AdminRoute`, `GlobalAdminRoute`).

### Accounting domain (`backend/accounting/`)
Split by concern into `models/`, `serializers/`, `views/` (not by app) — a new feature usually touches one file in each. Key models:
- `account.py`: `Account` (chart of accounts, hierarchical) + `AccountSubconto` (link to subconto types per account).
- `subconto.py`: `SubcontoType` — dimension type usable across accounts (counterparty, employee, etc.).
- `transaction.py`: `JournalEntry` + `TransactionLine` (double-entry postings) and `ClosedPeriod` (accounting period locking — see `useClosedPeriod*` hooks/consumer for the live "period closed" UX).
- `directory.py`: the no-code directory builder — `Directory` (definition), `DirectoryField` (JSONB schema field), `DirectoryRecord` (JSONB data row, GIN-indexed).
- `document.py`: `Document`/`DocumentItem`/`DocumentParticipant` — source documents (invoices, orders, returns) that generate journal entries.
- `audit.py`: audit log models backing the audit log page/API.
Other model files (`counterparty.py`, `currency.py`, `employee.py`, `product.py`, `stock.py`, `company.py`) are supporting reference data.

### WebSocket layer
- ASGI app (`backend/config/asgi.py`) wraps HTTP with `JWTAuthMiddleware` (`backend/utils/ws/jwt_auth_middleware.py`) so WS connections authenticate via the same JWT as REST.
- Routes live in `backend/utils/ws/routing.py`: `ws/rbac/`, `ws/scope/`, `ws/closed-period/`, `ws/chat/notifications/`, `ws/chat/<conv_id>/`, plus a `ws/test/` sanity consumer.
- Channel layer is Redis (`channels_redis`), configured via `REDIS_URL`.

### Frontend structure
- `src/core/` — cross-cutting: `api/` (axios instance with JWT refresh + global 401/403/tenant-inactive handling via `window.dispatchEvent`, consumed by top-level listeners), `context/` (Company, User, SidebarRight, Notification), `hooks/`, `router/`, `store/` (zustand), `types/`.
- `src/features/` — feature modules: `accounting`, `admin`, `auth`, `chat`, `companies`, `users`. Each mirrors backend domain boundaries.
- Routes are centralized as string constants in `core/router/routes.ts` (`ROUTES.APP.*`, `ROUTES.COMPANY_ADMIN.*`, `ROUTES.ADMIN.*`) — reference these instead of hardcoding paths.
- `axiosInstance.ts` treats 401 as "refresh token and retry" (queues concurrent requests during refresh) and treats non-GET 403 as a global RBAC-forbidden toast event, and `tenant_inactive` 403 as a distinct "license expired" event — don't add local error handling for these cases in individual API calls, listen for the corresponding `window` events instead.
- i18n: `src/locales/{ru,tk}/translation.json` (Russian and Turkmen; UI source strings are Russian).

## Notes
- `requirements.txt` is UTF-16-encoded (likely from Windows PowerShell `pip freeze` redirection) — read/edit it accordingly, don't assume UTF-8.
- Large stray files at repo root (`backend.zip`, `frontend.zip`, `trush.txt`, `structure.txt`, `code.txt`) are scratch/export artifacts, not part of the source tree — ignore them unless the user references them directly.
