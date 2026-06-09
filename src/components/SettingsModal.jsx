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
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">API 提供商</p>
          <div className="space-y-2">
            {providers.map((p) => (
              <button
                key={p}
                onClick={() => handleSelect(p)}
                className={`w-full text-left px-4 py-2 rounded-md border text-sm transition-colors ${
                  currentProvider === p
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
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
