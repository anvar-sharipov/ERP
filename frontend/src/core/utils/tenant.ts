// // frontend/src/core/utils/tenant.ts
export interface TenantInfo {
  isSubdomain: boolean;
  tenantKey: string | null;
}

/**
 * Функция парсит текущий URL и определяет, запущен ли фронтенд на поддомене компании
 */
export const getTenantInfo = (): TenantInfo => {
  const hostname = window.location.hostname;
  const parts = hostname.split('.');

  // Локальная разработка
  if (hostname.includes('localhost')) {
    if (parts.length > 1 && parts[0] !== 'localhost') {
      return { isSubdomain: true, tenantKey: parts[0] };
    }
    return { isSubdomain: false, tenantKey: null };
  }

  // Продакшен: берем базовый домен из env
  const baseDomain = import.meta.env.VITE_BASE_DOMAIN || ''; // "192.168.43.13.nip.io"
  const baseParts = baseDomain.split('.');

  // Если hostname длиннее базового домена — значит есть поддомен
  if (parts.length > baseParts.length) {
    return { isSubdomain: true, tenantKey: parts[0] };
  }

  return { isSubdomain: false, tenantKey: null };
};

/**
 * Возвращает базовый WebSocket URL (ws:// или wss://) с текущим хостом и портом backend.
 * Использует тот же хост, что и текущая страница, чтобы тенант определился по поддомену.
 */
export const getTenantWsBaseUrl = (): string => {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const hostname = window.location.hostname;

  // Порт backend - берём из env, по умолчанию 8000
  const backendPort = import.meta.env.VITE_BACKEND_PORT || '8000';

  return `${protocol}://${hostname}:${backendPort}`;
};


// export interface TenantInfo {
//   isSubdomain: boolean;
//   tenantKey: string | null;
// }

// /**
//  * Функция парсит текущий URL и определяет, запущен ли фронтенд на поддомене компании
//  */

// export interface TenantInfo {
//   isSubdomain: boolean;
//   tenantKey: string | null;
// }

// export const getTenantInfo = (): TenantInfo => {
//   const hostname = window.location.hostname;
//   const parts = hostname.split('.');

//   // Локальная разработка
//   if (hostname.includes('localhost')) {
//     if (parts.length > 1 && parts[0] !== 'localhost') {
//       return { isSubdomain: true, tenantKey: parts[0] };
//     }
//     return { isSubdomain: false, tenantKey: null };
//   }

//   // Продакшен: берем базовый домен из env
//   const baseDomain = import.meta.env.VITE_BASE_DOMAIN || ''; // "192.168.43.13.nip.io"
//   const baseParts = baseDomain.split('.');

//   // Если hostname длиннее базового домена — значит есть поддомен
//   if (parts.length > baseParts.length) {
//     return { isSubdomain: true, tenantKey: parts[0] };
//   }

//   return { isSubdomain: false, tenantKey: null };
// };

