import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Copy, Check } from 'lucide-react';

const supportAddress = 'oakerx@handcash.io';

const DonationModal = ({ show, onClose }) => {
  const { t } = useTranslation();
  const [isCopied, setIsCopied] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const activeAddress = supportAddress;

  useEffect(() => {
    if (show && activeAddress) {
      QRCode.toDataURL(activeAddress, { errorCorrectionLevel: 'H', width: 512 })
        .then(url => {
          setQrCodeUrl(url);
        })
        .catch(err => {
          console.error('Failed to generate QR code:', err);
          setQrCodeUrl('');
        });
    }
  }, [show, activeAddress]);

  const handleCopyAddress = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(activeAddress);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  }, [activeAddress]);

  return (
    <Dialog open={show} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('donation.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-center">
          <p className="text-sm text-foreground">{t('donation.description')}</p>

          <div>
            {qrCodeUrl ? (
              <div className="flex justify-center my-3">
                <img
                  src={qrCodeUrl}
                  alt="QR Code"
                  className="w-48 h-48 border border-border rounded"
                />
              </div>
            ) : (
              <div className="flex justify-center items-center w-48 h-48 border border-border rounded mx-auto">
                <p className="text-muted-foreground">{t('donation.qrLoading')}</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 p-3 bg-muted rounded mb-4">
            <div className="flex-1 font-mono text-sm truncate">{activeAddress}</div>
            <button
              onClick={handleCopyAddress}
              title={
                isCopied ? t('bsvPayment.statusMessages.addressCopied') : t('bsvPayment.copyButton')
              }
              className="p-2 rounded hover:bg-muted transition-colors"
            >
              {isCopied ? <Check size={16} className="text-[var(--seal)]" /> : <Copy size={16} />}
            </button>
          </div>

          <p className="text-sm text-muted-foreground">{t('donation.thankYou')}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DonationModal;
