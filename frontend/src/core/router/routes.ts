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


    EMPLOYEES: '/employees',
    EMPLOYEES_LIST: '/employees/list',
    POSITIONS: '/employees/positions',

    ACCOUNTING_AUDIT_LOG: '/accounting/audit-log',

    DOCUMENTS: '/documents',
    DOCUMENTS_INVOICES: '/documents/invoices',
    DOCUMENTS_ORDERS: '/documents/orders',
    DOCUMENTS_RETURNS: '/documents/returns',
    DOCUMENTS_CREATE: '/documents/create',
    DOCUMENTS_EDIT: '/documents/:id/edit',

    CHAT: '/chat',

  },

  COMPANY_ADMIN: {
    USERS:      '/admin/users',
    ROLES:      '/admin/roles',
    ROLES_CREATE: '/admin/roles/create',
    ROLES_EDIT:   '/admin/roles/:id/edit',
    COMPANIES:  '/admin/companies',
    BRANCHS:    '/admin/branchs',
  },
  ADMIN: {
    DASHBOARD: '/admin/dashboard',
    USERS: '/admin/users',
    ROLES: '/admin/roles',
  }
} as const;

