// frontend/src/core/router/routes.ts
export const ROUTES = {
  AUTH: {
    LOGIN: '/login',
    REGISTER: '/register',
  },
  APP: {
    DASHBOARD: '/dashboard',
    COMPANIES: '/companies',
    ACCOUNTING: '/accounting',
    DIRECTORY: '/directory',
    DIRECTORY_FIELDS: '/directory/:id/fields',
    DIRECTORY_RECORDS: '/directory/:id/records',
    // Товары
    PRODUCTS: '/products',
    PRODUCTS_LIST: '/products/list',
    PRODUCTS_CATEGORIES: '/products/categories',
    PRODUCTS_BRANDS: '/products/brands',
    PRODUCTS_TAGS: '/products/tags',
    PRODUCTS_UNITS: '/products/units',
    // Контрагенты
    COUNTERPARTIES: '/counterparties',
    // Склады
    WAREHOUSES: '/warehouses',
    WAREHOUSES_LIST: '/warehouses/list',
    WAREHOUSES_STOCKS: '/warehouses/stocks',
  },
  COMPANY_ADMIN: {
    USERS: '/admin/users',
    ROLES: '/admin/roles',
    COMPANIES: '/admin/companies',
    BRANCHS: '/admin/branchs'
  },
  ADMIN: {
    DASHBOARD: '/admin/dashboard',
    USERS: '/admin/users',
    ROLES: '/admin/roles',
  }
} as const;


// export const ROUTES = {
//   AUTH: {
//     LOGIN: '/login',
//     REGISTER: '/register',
//   },
//   APP: {
//     DASHBOARD: '/dashboard',
//     COMPANIES: '/companies',
//     ACCOUNTING: '/accounting',
//     DIRECTORY: '/directory',
//     DIRECTORY_FIELDS: '/directory/:id/fields',
//     DIRECTORY_RECORDS: '/directory/:id/records',
//   },
//   COMPANY_ADMIN: {
//     USERS: '/admin/users',
//     ROLES: '/admin/roles',
//     COMPANIES: '/admin/companies',
//     BRANCHS: '/admin/branchs'
//   },
//   ADMIN: {
//     DASHBOARD: '/admin/dashboard',
//     USERS: '/admin/users', // Добавляем управление пользователями
//     ROLES: '/admin/roles', // Добавляем управление ролями
    
//   }
// } as const;