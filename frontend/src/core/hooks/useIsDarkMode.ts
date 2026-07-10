import { useEffect, useState } from "react";

// ✅ Тема переключается классом `dark` на <html> (см. ThemeToggle.tsx), а не только
// prefers-color-scheme — поэтому для цветов, которые нельзя выразить Tailwind-
// классами (например, hex-заливка SVG-графиков), нужно явно следить за этим
// классом, а не полагаться на media query.
export const useIsDarkMode = () => {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
};
