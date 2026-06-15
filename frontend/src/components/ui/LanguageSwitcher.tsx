// frontend/src/components/ui/LanguageSwitcher.tsx
import React from "react";
import { useTranslation } from "react-i18next";
import { playClick2Sound } from "../../core/utils/sound";



export const LanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  const languages = [
    { code: "ru", label: "RU" },
    { code: "tk", label: "TK" },
    { code: "en", label: "EN" },
  ];

  return (
    <div className="flex items-center gap-1 p-1 bg-slate-950 border border-indigo-900/50 rounded-lg w-fit transition-colors duration-200">
      {languages.map((lang) => {
        const isActive = i18n.language === lang.code;

        return (
          <button
            key={lang.code}
            onClick={() => {
              playClick2Sound();
              changeLanguage(lang.code);
            }}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all duration-200 ${
              isActive ? "bg-indigo-900/60 text-indigo-100 shadow-sm border border-indigo-500/30" : "text-indigo-400/60 hover:text-indigo-200 hover:bg-indigo-900/20"
            }`}
          >
            {lang.label}
          </button>
        );
      })}
    </div>
  );
};
