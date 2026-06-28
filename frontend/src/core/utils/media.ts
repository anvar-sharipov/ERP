// // frontend/src/core/utils/media.ts
// export const getMediaUrl = (path: string | null | undefined) => {
//   if (!path) return null;
//   if (path.startsWith('http')) return path;

//   // Если путь начинается с /media, просто добавляем API URL
//   const baseUrl = import.meta.env.VITE_API_TARGET || 'http://localhost:8000';
  
//   // Убираем слэш, если он есть в начале path, чтобы не было double-slash
//   const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
//   return `${baseUrl}${cleanPath}`;
// };



// export const isValidPhoto = (url: string | null | undefined): boolean => !!url && url.length > 10 && url !== "/media/";

export const isValidMediaUrl = (url: string | null | undefined): url is string => !!url && url.length > 10 && !url.match(/^\/media\/?$/);

