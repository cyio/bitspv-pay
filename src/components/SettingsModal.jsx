import React from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getAvailableProviders, setPreferredProvider } from '../utils/apiProviderHealth';

const PROVIDER_LABELS = {
  bananablocks: 'Bananablocks',
  whatsOnChain: 'WhatsOnChain',
  bitails: 'Bitails',
};

export default function SettingsModal({ show, onClose, currentProvider, onProviderChange }) {
  const { t } = useTranslation();
  const providers = getAvailableProviders();

  const handleSelect = (name) => {
    setPreferredProvider(name);
    onProviderChange(name);
  };

  return (
    <Dialog open={show} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('bsvPayment.settings.title')}</DialogTitle>
        </DialogHeader>
        <div className="mt-2">
          <p className="text-sm text-muted-foreground mb-3">{t('bsvPayment.settings.apiProvider')}</p>
          <div className="space-y-2">
            {providers.map((p) => (
              <button
                key={p}
                onClick={() => handleSelect(p)}
                aria-pressed={currentProvider === p}
                className={`w-full rounded-[var(--radius)] border px-4 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
