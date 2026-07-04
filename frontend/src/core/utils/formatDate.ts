// frontend/src/core/utils/formatDate.ts

/** Форматирует ISO-дату "YYYY-MM-DD" в "DD.MM.YYYY" без риска сдвига по таймзоне */
export const formatDateDisplay = (iso: string): string => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};
