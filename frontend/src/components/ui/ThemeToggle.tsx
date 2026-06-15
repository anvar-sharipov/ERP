// frontend/src/components/ui/ThemeToggle.tsx
import { useEffect, useState } from "react";
import { playClick2Sound } from "../../core/utils/sound";


export const ThemeToggle = () => {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark");

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [darkMode]);

  return (
    <div className="flex items-center gap-1 p-1 bg-slate-950 border border-indigo-900/50 rounded-lg w-fit transition-colors duration-200">
      {/* Кнопка Светлой темы */}
      <button
        onClick={() => {
          playClick2Sound();
          setDarkMode(false);
        }}
        className={`p-1.5 rounded-md transition-all duration-200 ${
          !darkMode ? "bg-indigo-900/60 text-indigo-100 shadow-sm border border-indigo-500/30" : "text-indigo-400/60 hover:text-indigo-200 hover:bg-indigo-900/20"
        }`}
        title="Светлая тема"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3v2.25m0 13.5V21M4.22 4.22l1.59 1.59m12.38 12.38l1.59 1.59M3 12h2.25m13.5 0H21m-16.78 6.78l1.59-1.59M18.36 5.64l1.59-1.59M12 7.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9z"
          />
        </svg>
      </button>

      {/* Кнопка Тёмной темы */}
      <button
        onClick={() => {
          playClick2Sound();
          setDarkMode(true);
        }}
        className={`p-1.5 rounded-md transition-all duration-200 ${
          darkMode ? "bg-indigo-900/60 text-indigo-100 shadow-sm border border-indigo-500/30" : "text-indigo-400/60 hover:text-indigo-200 hover:bg-indigo-900/20"
        }`}
        title="Тёмная тема"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
          />
        </svg>
      </button>
    </div>
  );
};
