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
                className={`w-full text-left px-4 py-2 rounded-[var(--radius)] border text-sm transition-colors ${
                  currentProvider === p
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:bg-muted text-foreground'
                }`}
              >
                {PROVIDER_LABELS[p] || p}
                {currentProvider === p && <span className="float-right">✓</span>}
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
