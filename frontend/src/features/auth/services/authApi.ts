// Пример: frontend/src/features/auth/services/authApi.ts
import { api } from '../../../core/api/axiosInstance';
import { API_ENDPOINTS } from '../../../core/api/endpoints';

// export const loginRequest = async (credentials: any) => {
//   const response = await api.post(API_ENDPOINTS.AUTH.LOGIN, credentials);
//   return response.data;
// };

export const loginRequest = async (credentials: any) => {
  const response = await api.post(API_ENDPOINTS.AUTH.LOGIN, credentials);
  const { access, refresh } = response.data;
  
  localStorage.setItem('access_token', access);
  localStorage.setItem('refresh_token', refresh);
  // Сохраняем время истечения сессии — 2 минуты от логина
  localStorage.setItem('session_expires_at', String(Date.now() + 2 * 60 * 1000));
  
  return response.data;
};




export const logoutRequest = async () => {
  const refreshToken = localStorage.getItem("refresh_token");

  // Если есть токен, пытаемся занести его в черный список на сервере
  if (refreshToken) {
    try {
      await api.post(API_ENDPOINTS.AUTH.LOGOUT, { refresh: refreshToken });
    } catch (err) {
      console.error("Ошибка при отзыве токена на сервере:", err);
    }
  }

  // В любом случае очищаем локальное хранилище
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("session_expires_at");
};