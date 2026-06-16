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
  },
  COMPANY_ADMIN: {
    USERS: '/admin/users',
    ROLES: '/admin/roles',
    COMPANIES: '/admin/companies',
    BRANCHS: '/admin/branchs'
  },
  ADMIN: {
    DASHBOARD: '/admin/dashboard',
    USERS: '/admin/users', // Добавляем управление пользователями
    ROLES: '/admin/roles', // Добавляем управление ролями
    
  }
} as const;