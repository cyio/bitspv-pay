import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { Monitor, Sun, Moon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getAvailableProviders, setPreferredProvider } from '../utils/apiProviderHealth';
import { getThemePreference, setThemePreference } from '../utils/theme';

const PROVIDER_LABELS = {
  bananablocks: 'Bananablocks',
  whatsOnChain: 'WhatsOnChain',
  bitails: 'Bitails',
};

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
];

export default function SettingsModal({ show, onClose, currentProvider, onProviderChange }) {
  const { t } = useTranslation();
  const providers = getAvailableProviders();
  const [themePreference, setThemePreferenceState] = useState(getThemePreference);
  const currentLanguage = String(i18n.language || 'en').startsWith('zh') ? 'zh' : 'en';

  const themeOptions = [
    { value: 'auto', label: t('bsvPayment.settings.themeAuto'), Icon: Monitor },
    { value: 'light', label: t('bsvPayment.settings.themeLight'), Icon: Sun },
    { value: 'dark', label: t('bsvPayment.settings.themeDark'), Icon: Moon },
  ];

  const handleSelect = (name) => {
    setPreferredProvider(name);
    onProviderChange(name);
  };

  const handleTheme = (value) => {
    setThemePreferenceState(setThemePreference(value));
  };

  const optionClass = (selected) =>
    `flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius)] border px-2 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
      selected
        ? 'border-primary bg-primary/10 text-primary'
        : 'border-border text-foreground hover:bg-muted'
    }`;

  return (
    <Dialog open={show} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('bsvPayment.settings.title')}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70dvh] space-y-5 overflow-y-auto">
          <section>
            <p className="mb-2 text-sm text-muted-foreground">{t('bsvPayment.settings.language')}</p>
            <div className="flex gap-2">
              {LANGUAGE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => i18n.changeLanguage(option.value)}
                  aria-pressed={currentLanguage === option.value}
                  className={optionClass(currentLanguage === option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-2 text-sm text-muted-foreground">{t('bsvPayment.settings.appearance')}</p>
            <div className="flex gap-2">
              {themeOptions.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleTheme(value)}
                  aria-pressed={themePreference === value}
                  className={optionClass(themePreference === value)}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-2 text-sm text-muted-foreground">{t('bsvPayment.settings.apiProvider')}</p>
            <div className="space-y-2">
              {providers.map((p) => (
                <button
                  key={p}
                  onClick={() => handleSelect(p)}
                  aria-pressed={currentProvider === p}
                  className={`w-full rounded-[var(--radius)] border px-4 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    currentProvider === p
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-foreground hover:bg-muted'
                  }`}
                >
                  {PROVIDER_LABELS[p] || p}
                  {currentProvider === p && <span className="float-right" aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
