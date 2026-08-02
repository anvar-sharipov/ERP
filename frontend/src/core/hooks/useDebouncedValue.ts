import { useEffect, useState } from "react";

/**
 * Возвращает значение с задержкой — используется для поиска на server-пагинации
 * (см. InvoicesPage.tsx/AuditLogPage.tsx/RatesPage.tsx), чтобы не слать запрос
 * на бэкенд на каждое нажатие клавиши.
 */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
