import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import translationRU from './locales/ru/translation.json';
import translationTK from './locales/tk/translation.json';
import translationEN from './locales/en/translation.json';

const resources = {
  ru: { translation: translationRU },
  tk: { translation: translationTK },
  en: { translation: translationEN },
};

i18n
  .use(LanguageDetector) // Автоопределение языка пользователя
  .use(initReactI18next) // Интеграция с React
  .init({
    resources,
    fallbackLng: 'ru', // Язык по умолчанию, если выбранный недоступен
    debug: false,
    interpolation: {
      escapeValue: false, // React уже защищает от XSS
    },
    detection: {
      order: ['localStorage', 'cookie', 'htmlTag', 'navigator'],
      caches: ['localStorage', 'cookie'],
    },
  });

export default i18n;