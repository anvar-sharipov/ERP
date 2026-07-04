# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

MyERP is a multi-tenant ERP/accounting platform (1C-like) built with Django + django-tenants (schema-per-company on PostgreSQL) and a React/TypeScript SPA. Core domain: chart of accounts with double-entry bookkeeping, no-code directories (справочники) with JSONB fields, and per-method RBAC with live WebSocket permission/scope updates.

Backend and frontend code comments, commit messages, and much of the domain vocabulary are in Russian — match that when editing existing files.

## Working conventions

- **Token/usage budget is a priority.** Before starting any task that touches 10+ files or requires a full-project sweep (e.g. project-wide i18n audits, renaming/refactoring across the codebase, styling changes applied everywhere), do NOT start executing immediately. First scope the real size (how many files, rough complexity/time), then stop and ask the user to confirm they want to proceed now at that scope, rather than splitting it into smaller batches. Only proceed once they've explicitly confirmed.
- **Every new/changed serializer or view in `backend/accounting/` and `backend/users/` must consider all three of:**
  1. **RBAC** — wire `get_permissions()` to `users/permissions.py::_rbac(action, resource)` (or `HasPermission(resource, action)`) so the endpoint is actually gated per HTTP method, not left open by omission.
  2. **Scope** — if the model/queryset has a `branch`/`warehouse` (or similar) field, filter it through `users/scoping.py::apply_scope(queryset, user, branch_field=..., warehouse_field=...)` so users only see data within their assigned branches/warehouses.
  3. **Audit log** — if the model is business data worth auditing (documents, transactions, directories, employees, products, etc.), have the ViewSet inherit `accounting/mixins.py::AuditMixin` (see `product_views.py`, `account_views.py`, `directory_views.py`, `employee_views.py`, `transaction_views.py` for existing examples) so create/update/delete get written to `AuditLog`.
  Don't add a new serializer/view without explicitly deciding on all three — it's easy to silently ship an endpoint that's technically working but unprotected, unscoped, or unaudited.
- **After adding any new Django model to `accounting`, `users`, or `chat`, run `python manage.py sync_permissions`.** This command (`users/management/commands/sync_permissions.py`) walks every model in those three apps, per tenant schema, and creates a `Permission(resource=model_name, action=<GET|POST|PUT|PATCH|DELETE>)` row for any that don't exist yet. Until it's run, there's no `Permission` row for the new model at all, so no Role can ever be granted access to it — the RBAC check from the item above will silently deny everyone (including admins assigning roles) regardless of how correctly `get_permissions()` is wired. Run it for all tenants (no args) or a specific one (`--schema <name>`) right after the migration that adds the model.
- **Every Excel export must use `frontend/src/core/utils/excelHelpers.ts::addExcelHeader(workbook, worksheet, company, user, t)`** as its baseline — it sets the standard `pageSetup` (portrait, fit-to-width, margins, horizontal-centered), adds the company logo, and a company/user/date info block. Don't hand-roll a different `pageSetup` per export; if a new export needs different page settings, extend `addExcelHeader` (or a shared variant) rather than diverging per-page.
- **Screen, Ctrl+P print, and Excel export must never drift apart.** When a page's on-screen display changes (a field is added/removed, a column becomes visible/hidden, a total is recalculated differently), the same change must be reflected in that page's print view (`print:` Tailwind classes / print-only blocks) and its Excel export — driven from the same underlying data/column-visibility state, not three independently-maintained copies. See `features/accounting/pages/Documents/Invoice/` for the pattern: `ProductRow`'s `columns`/`visibleScreen`, `Vars.ts`'s shared calc functions (`lineTotal`, `lineGross`, `calcRowIncome`), and `exportDocumentExcel.ts` all consume the same `items`/`columns`/totals rather than recomputing their own version.
- **When asked to "add Excel" (export to Excel) for a page, the button/UI trigger always goes in the right sidebar** (`core/context/SidebarRightContext.tsx::useSidebar` → `setSidebarContent`), not inline in the page's main content area — this matches where `DocumentFormPage.tsx` puts its Excel button and keeps the pattern consistent across pages.
- **In Excel exports, text must never be clipped/hidden behind a neighboring cell — it must always render in full.** ExcelJS doesn't wrap or auto-widen a cell to fit its content; a text-labeled cell that's merely "the column next to it happens to be empty" only looks fine by luck, and breaks the moment a real value lands in that neighbor (exactly what happened with the header info block and the totals-row labels). The fix, consistently: `worksheet.mergeCells(rowNum, startCol, rowNum, endCol)` across enough columns to hold the text, regardless of whatever width that individual column ends up with elsewhere in the sheet — see `addExcelHeader` (label/value merge) and `exportDocumentExcel.ts::addTotalRow` (label merged + right-aligned so it doesn't run into the value cell) for the established pattern. Don't rely on overflow-into-an-empty-cell as the plan — merge explicitly. Also, when merging a range, always write the cell's value into the range's own anchor (top-left/`startCol`) cell — Excel keeps only the anchor cell's value on merge and silently discards anything written to another cell inside that same range.
- **In Excel exports, monetary/numeric sums (price, discount, total, income) must use a thousand-separated number format**, e.g. `numFmt = "#,##0.00"` (see `exportDocumentExcel.ts::FLOAT_NUMFMT`), so values render as `5 050,00` / `1 000 000,00` rather than plain `5050.00` — matches how real documents display sums, and the separator/decimal character adapts to Excel's own regional settings.
- **Every thumbnail image in the UI (product, employee, counterparty, etc.) must be clickable to show the real full-size photo**, not just a bigger render of the same small thumbnail. The full-size URL (`image_url` next to `thumbnail_url` for products in `ProductImageSerializer`, `photo` next to `photo_thumbnail` for `Counterparty`/`Employee`) already comes back in the same API response as the thumbnail — no extra backend request is needed on click. Use the shared `components/ui/ImagePreview.tsx` modal (`src`/`onClose` props) for the full-screen preview, and see `components/ui/SearchableSelect.tsx` (`SelectOption.fullImage`, used in both the trigger thumbnail and dropdown list items) and `features/accounting/pages/Documents/Invoice/ProductRow/ProductRow.tsx` (`handlePreviewProductImage`, resolving the full image by product id against the already-loaded `products` list) for the established pattern. Remember `e.stopPropagation()` on the thumbnail's own `onClick` so it doesn't also trigger the row/option's select/open behavior.

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
- **`WorkDateWidget.tsx`** (right sidebar) is the single global work-context widget, used almost everywhere — every document-creation form and most reports read from it. It's backed by `core/store/dateStore.ts::useDateStore` (zustand + `persist`, localStorage key `erp-dates`) and exposes:
  - `workDate` — the working date, substituted into every new document/posting.
  - `workBranch` / `workWarehouse` — the working branch/warehouse (two separate `SelectOption`-shaped objects; picking a branch resets `workWarehouse` to `null`), substituted into every new document/posting.
  - `periodFrom` / `periodTo` — a date **range** (two inputs, "from"/"to"), used by reports (`JournalPage`, OSV, etc.) instead of `workDate`.
  All document-creation forms (`JournalEntryForm`, `InvoicesPage`, `DocumentFormPage`, etc.) and all reports must read `workDate`/`workBranch`/`workWarehouse` (and `periodFrom`/`periodTo` for reports) from this store — **never add a page-local date/branch/warehouse picker**, wire the page to this single store instead. Raw values are ISO `YYYY-MM-DD`; format them for display with `core/utils/formatDate.ts::formatDateDisplay` (or `new Date(...).toLocaleDateString("ru-RU")` for table cell `render`s, matching existing table columns) — never interpolate them into user-facing text unformatted.
  - **Closed-period check**: the widget also surfaces whether the current `workDate` is closed for the selected `workWarehouse` (`core/hooks/useClosedPeriod.ts::useClosedPeriod(warehouseId)` → `{ isClosed }`, backed by `GET` `closedPeriodApi.check(date, warehouseId)`; `useBranchWarehousesClosed(warehouseIds)` checks whether *all* warehouses of a branch are closed, for branch-level info text). This isn't just a frontend hint — it's enforced server-side too: `backend/accounting/utils.py::check_period_open(date, branch_id=None, warehouse_id=None)` raises `ValidationError` if a matching `ClosedPeriod` row exists, and is called from `Document.post()`/`unpost()` (`models/document.py`), `JournalEntry.post()`/`unpost()` (`models/transaction.py`), and `StockMovement.save()` (`models/stock.py`). Any new code that posts/unposts a document, creates a journal entry, or writes a stock movement tied to a date+branch/warehouse must go through (or replicate) this same `check_period_open` gate — don't bypass it by writing directly to the ledger/stock tables.

## Notes
- `requirements.txt` is UTF-16-encoded (likely from Windows PowerShell `pip freeze` redirection) — read/edit it accordingly, don't assume UTF-8.
- Large stray files at repo root (`backend.zip`, `frontend.zip`, `trush.txt`, `structure.txt`, `code.txt`) are scratch/export artifacts, not part of the source tree — ignore them unless the user references them directly.
