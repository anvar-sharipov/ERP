// frontend/src/core/utils/media.ts
export const getMediaUrl = (path: string | null | undefined) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;

  // Если путь начинается с /media, просто добавляем API URL
  const baseUrl = import.meta.env.VITE_API_TARGET || 'http://localhost:8000';
  
  // Убираем слэш, если он есть в начале path, чтобы не было double-slash
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  return `${baseUrl}${cleanPath}`;
};

// export const getMediaUrl = (path: string | null | undefined) => {
//   if (!path) return null;
//   // Если путь уже полный, отдаем как есть
//   if (path.startsWith('http')) return path;

//   // ЕСЛИ ТЫ ХОЧЕШЬ, ЧТОБЫ БРАУЗЕР САМ ПОНЯЛ ДОМЕН,
//   // ПРОСТО ВОЗВРАЩАЙ ПУТЬ КАК ЕСТЬ (относительным)
//   return path; 
// };