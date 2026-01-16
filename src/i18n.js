import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zh from './locales/cn';
import en from './locales/en';

const resources = {
  en: {
    translation: en
  },
  zh: {
    translation: zh
  }
};

i18n
  .use(LanguageDetector) // Detect user language
  .use(initReactI18next) // Pass i18n instance to react-i18next
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already safes from xss
    },
    detection: {
      order: ['querystring', 'cookie', 'localStorage', 'navigator', 'htmlTag'],
      caches: ['cookie', 'localStorage'],
    }
  });

// Set html lang attribute
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

export default i18n;
