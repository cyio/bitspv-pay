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

// Set html lang attribute. 必须在 init 之后马上跑一次：检测器和监听器的注册
// 顺序会让「首屏就是中文」的情况漏掉 languageChanged，html lang 停在 en。
const applyHtmlLang = lng => {
  const value = String(lng || 'en');
  document.documentElement.lang = value.startsWith('zh') ? 'zh-Hans' : value;
  // index.html 里的标题脚本只看 navigator.language，?lng= 或持久化偏好会被忽略。
  const title = i18n.t('bsvPayment.documentTitle');
  if (title && title !== 'bsvPayment.documentTitle') document.title = title;
};

i18n.on('languageChanged', applyHtmlLang);
i18n.on('initialized', () => applyHtmlLang(i18n.language));
if (i18n.isInitialized) applyHtmlLang(i18n.language);

export default i18n;
