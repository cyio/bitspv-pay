const STORAGE_KEY = 'bitspv-theme';

/** 'auto' | 'light' | 'dark' */
export function getThemePreference() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(preference) {
  const mode =
    preference === 'auto'
      ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : preference;
  const root = document.documentElement;
  // tokens.css / brand-vars.css 里的 html.dark / html.light 会覆盖 media 规则，
  // 这样 OS 是深色但用户选了浅色时也能真正切过去。
  root.classList.toggle('dark', mode === 'dark');
  root.classList.toggle('light', mode === 'light');
  root.style.colorScheme = mode;
  return mode;
}

export function setThemePreference(preference) {
  const value = preference === 'light' || preference === 'dark' ? preference : 'auto';
  try {
    if (value === 'auto') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // 隐私模式下写不进 localStorage：本次会话仍然生效，只是不持久化。
  }
  return applyTheme(value);
}

/** OS 主题变化且用户选择「跟随系统」时同步更新。 */
export function watchSystemTheme(preference, onChange) {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (!media) return () => {};
  const handler = () => {
    if (getThemePreference() === 'auto') {
      const mode = applyTheme('auto');
      onChange?.(mode);
    }
  };
  media.addEventListener('change', handler);
  return () => media.removeEventListener('change', handler);
}
