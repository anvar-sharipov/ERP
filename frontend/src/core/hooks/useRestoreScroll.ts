// hooks/useRestoreScroll.ts
import { useEffect } from 'react';

export const useRestoreScroll = (key: string, setSelectedId: (id: number | null) => void) => {
  useEffect(() => {
    const savedId = sessionStorage.getItem(key);
    if (savedId) {
      const id = Number(savedId);
      setSelectedId(id);
      setTimeout(() => {
        const el = document.querySelector(`[data-row-id="${id}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
      sessionStorage.removeItem(key);
    }
  }, []);

  const getBackProps = (navigate: any, id: number) => ({
    onClick: () => {
      sessionStorage.setItem(key, String(id));
      navigate(-1);
    }
  });

  return { getBackProps };
};
// import { useEffect } from 'react';

// export const useRestoreScroll = (
//   key: string, 
//   setSelectedId: (id: number | null) => void,
//   dependency: any[] = []
// ) => {
//   // Восстановление
//   useEffect(() => {
//     const savedId = sessionStorage.getItem(key);
//     if (savedId) {
//       const id = Number(savedId);
//       setSelectedId(id);
      
//       // Даем время на рендер таблицы
//       setTimeout(() => {
//         const element = document.querySelector(`[data-row-id="${id}"]`);
//         if (element) {
//           element.scrollIntoView({ behavior: 'smooth', block: 'center' });
//         }
//       }, 150);
      
//       sessionStorage.removeItem(key);
//     }
//   }, dependency);

//   // Функция для "Назад"
//   const navigateBackWithId = (navigate: any, id: number | null) => {
//     if (id) sessionStorage.setItem(key, String(id));
//     navigate(-1);
//   };

//   return { navigateBackWithId };
// };