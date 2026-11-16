import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getAvailableProviders, setPreferredProvider } from '../utils/apiProviderHealth';

const PROVIDER_LABELS = {
  bananablocks: 'Bananablocks',
  whatsOnChain: 'WhatsOnChain',
  bitails: 'Bitails',
};

export default function SettingsModal({ show, onClose, currentProvider, onProviderChange }) {
  const providers = getAvailableProviders();

  const handleSelect = (name) => {
    setPreferredProvider(name);
    onProviderChange(name);
  };

  return (
    <Dialog open={show} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
        </DialogHeader>
        <div className="mt-2">
          <p className="text-sm text-muted-foreground dark:text-muted-foreground mb-3">API 提供商</p>
          <div className="space-y-2">
            {providers.map((p) => (
              <button
                key={p}
                onClick={() => handleSelect(p)}
                className={`w-full text-left px-4 py-2 rounded-md border text-sm transition-colors ${
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
