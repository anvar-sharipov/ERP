import { useEffect, useRef, useState } from "react";

// ✅ Для SVG-графиков с фиксированной высотой (viewBox не должен зависеть от
// количества данных) — нужна РЕАЛЬНАЯ ширина контейнера в пикселях, иначе
// при width=100%+height=auto браузер растягивает высоту по соотношению
// сторон viewBox, а не по факту (график "раздувается" при малом числе баров).
export const useMeasuredWidth = (fallback = 320) => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width || fallback);
    return () => observer.disconnect();
  }, [fallback]);

  return { ref, width };
};
