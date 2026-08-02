// frontend/src/core/router/routes.ts
export const ROUTES = {
  AUTH: {
    LOGIN: '/login',
    REGISTER: '/register',
  },
  APP: {
    DASHBOARD: '/dashboard',
    COMPANIES: '/companies',
    DIRECTORY: '/directory',
    DIRECTORY_FIELDS: '/directory/:id/fields',
    DIRECTORY_RECORDS: '/directory/:id/records',
    // Товары
    PRODUCTS: '/products',
    PRODUCTS_LIST: '/products/list',
    PRODUCTS_CREATE: "/products/create",
    PRODUCTS_EDIT: "/products/:id/edit",
    PRODUCTS_CATEGORIES: '/products/categories',
    PRODUCTS_BRANDS: '/products/brands',
    PRODUCTS_TAGS: '/products/tags',
    PRODUCTS_UNITS: '/products/units',
    PRODUCTS_PRICE_TYPES: "/products/price-types",
    // Контрагенты
    COUNTERPARTIES: '/counterparties',
    // Склады
    WAREHOUSES: '/warehouses',
    WAREHOUSES_LIST: '/warehouses/list',
    WAREHOUSES_STOCKS: '/warehouses/stocks',

    JOURNAL:          '/journal',
    JOURNAL_ENTRIES:  '/journal/entries',
    JOURNAL_MOVEMENTS:'/journal/movements',

    ACCOUNTING: '/accounting',
    ACCOUNTING_ACCOUNTS: '/accounting/accounts',
    ACCOUNTING_SUBCONTO_TYPES: '/accounting/subconto-types', // добавить

    ACCOUNTING_OSV: '/accounting/osv',

    ACCOUNTING_SUBCONTO_BREAKDOWN: '/accounting/account/:accountId/subconto',
    ACCOUNTING_SUBCONTO_CARD: '/accounting/account/:accountId/subconto/:subcontoId',


    EMPLOYEES: '/employees',
    EMPLOYEES_LIST: '/employees/list',
    POSITIONS: '/employees/positions',

    TRIPS: '/trips',
    TRIPS_VIEW: '/trips/:id',

    ACCOUNTING_AUDIT_LOG: '/accounting/audit-log',

    DOCUMENTS: '/documents',
    DOCUMENTS_INVOICES: '/documents/invoices',
    DOCUMENTS_ORDERS: '/documents/orders',
    DOCUMENTS_RETURNS: '/documents/returns',
    // ✅ DOCUMENTS_CREATE намеренно резолвится в ТОТ ЖЕ маршрут ":id/edit" (id="new")
    // вместо отдельного "/documents/create" — иначе первое автосохранение черновика
    // (DocumentFormPage.tsx), переходя с create на ":id/edit" после получения id с
    // сервера, попадало бы на ДРУГОЙ <Route>, и react-router полностью размонтировал
    // бы DocumentFormPage (роняя фокус ввода) вместо обычной смены :id-параметра у
    // уже смонтированного компонента. См. AppRouter.tsx — отдельного <Route> для
    // DOCUMENTS_CREATE больше нет, регистрация только одна (DOCUMENTS_EDIT).
    DOCUMENTS_CREATE: '/documents/new/edit',
    DOCUMENTS_EDIT: '/documents/:id/edit',
    DOCUMENTS_VIEW: '/documents/:id/view',

    CHAT: '/chat',

    // ✅ Отдельная от "Accounting" вкладка в левом сайдбаре — сюда будем
    // по одному добавлять новые отчёты (каждый как свой tab внутри Reports.tsx,
    // тем же паттерном, что ROUTES.APP.ACCOUNTING/Accounting.tsx). Существующие
    // отчёты (OSV/ProductTurnover/AuditLog) сюда пока не переносим — это была
    // бы отдельная более крупная задача, не часть текущего запроса.
    REPORTS: '/reports',
    REPORTS_PRODUCT_TURNOVER_DETAIL: '/reports/product-turnover/:id',

    // ✅ Отдельная от "Reports" вкладка в левом сайдбаре — аналитика/BI-отчёты
    // (динамика продаж, ABC/XYZ, маржинальность, RFM и т.д.), тем же паттерном
    // GoogleTabs + вложенные <Route>, что и Reports/Accounting.
    ANALYTICS: '/analytics',



    EXCHANGE_RATES: '/exchange-rates',
    EXCHANGE_RATES_RATES: '/exchange-rates/rates',
    EXCHANGE_RATES_CURRENCIES: '/exchange-rates/currencies',

  },

  // ✅ Префикс намеренно "/company-admin/", а не "/admin/" — nginx.conf проксирует
  // ЛЮБОЙ путь, начинающийся с "/admin/", напрямую в Django (location ~ ^/(api|admin)/,
  // это для реальной Django-админки /admin/). Раньше эти React-роуты тоже сидели
  // на "/admin/*" — прямой заход по ссылке или Ctrl+L+Enter в браузере уводил
  // запрос в Django вместо SPA (тот же класс бага, что и /chat/ vs Django admin).
  COMPANY_ADMIN: {
    USERS:      '/company-admin/users',
    ROLES:      '/company-admin/roles',
    ROLES_CREATE: '/company-admin/roles/create',
    ROLES_EDIT:   '/company-admin/roles/:id/edit',
    COMPANIES:  '/company-admin/companies',
    BRANCHS:    '/company-admin/branchs',
    DOCUMENT_SETTINGS: '/company-admin/document-settings',
    ALERTS: '/company-admin/alerts',
  },
  ADMIN: {
    DASHBOARD: '/company-admin/dashboard',
    USERS: '/company-admin/users',
    ROLES: '/company-admin/roles',
  }
} as const;

