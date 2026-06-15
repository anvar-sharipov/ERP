// frontend/src/core/api/endpoints.ts

export const API_ENDPOINTS = {
  AUTH: {
    // На бэкенде: path('api/auth/token/') -> убираем api/, остается auth/token/
    LOGIN: 'auth/token/',
    LOGOUT: 'auth/token/logout/',
    SUPERUSER_LOGIN: 'auth/superuser-token/',
    
    // На бэкенде: path('api/auth/token/refresh/') -> остается auth/token/refresh/
    REFRESH: 'auth/token/refresh/',
  },
  USERS: {
    // На бэкенде: path('api/users/', include('users.urls')) + path('me/') 
    // На выходе получается api/users/me/ -> убираем api/, остается users/me/
    ME: 'users/me/',
    REGISTER: 'users/register/',
  },
  ACCOUNTING: {
    // Сюда будешь добавлять урлы из accounting/urls.py по мере их написания
    // Например, если там будет path('transactions/', ...):
    TRANSACTIONS: 'accounting/transactions/',
  },
};