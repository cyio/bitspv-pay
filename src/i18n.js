import { createI18n } from 'vue-i18n';

import zh from './locales/cn';
import en from './locales/en';

const messages = {
  en,
  zh,
};

const userLang = navigator.language || navigator.userLanguage;
const defaultLang = userLang.includes('zh') ? 'zh' : 'en'; // 如果是中文，默认设置为中文，否则为英文

document.documentElement.lang = defaultLang;

const i18n = createI18n({
  locale: defaultLang, // 根据用户语言选择
  fallbackLocale: defaultLang, // 回退语言
  messages,
});

export default i18n;
