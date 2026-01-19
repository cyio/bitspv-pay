
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';

const handcashAddress = 'oakerx@handcash.io';
const rockwalletAddress = 'oakerx@rockwallet.me';

const DonationModal = ({ show, onClose }) => {
  const { t } = useTranslation();
  const [isCopied, setIsCopied] = useState(false);
  const [currentPaymentMethod, setCurrentPaymentMethod] = useState('handcash'); // 'handcash' or 'rockwallet'
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  const activeAddress = useMemo(() => {
    return currentPaymentMethod === 'handcash' ? handcashAddress : rockwalletAddress;
  }, [currentPaymentMethod]);

  useEffect(() => {
    if (show && activeAddress) {
      QRCode.toDataURL(activeAddress, { errorCorrectionLevel: 'H', width: 256 })
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

  const togglePaymentMethod = () => {
    setCurrentPaymentMethod(prev => (prev === 'handcash' ? 'rockwallet' : 'handcash'));
  };

  return (
    <Dialog open={show} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('donation.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-center">
          <p className="text-sm text-gray-700 dark:text-gray-300">{t('donation.description')}</p>

          <div>
            <div className="mb-2">
              <span className="font-semibold text-gray-600">{currentPaymentMethod === 'handcash' ? 'HandCash' : 'RockWallet'}:</span>
              <span className="ml-1 text-gray-600 dark:text-gray-400 break-all">{activeAddress}</span>
            </div>
            {qrCodeUrl ? (
              <div className="flex justify-center my-3">
                <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48 border border-gray-300 dark:border-gray-600 rounded" />
              </div>
            ) : (
              <div className="flex justify-center items-center w-48 h-48 border border-gray-300 dark:border-gray-600 rounded mx-auto">
                <p className="text-gray-500">{t('donation.qrLoading')}</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-950 rounded mb-4">
            <div className="flex-1 font-mono text-sm truncate">{activeAddress}</div>
            <button
              onClick={handleCopyAddress}
              title={isCopied ? t('bsvPayment.statusMessages.addressCopied') : t('bsvPayment.copyButton')}
              className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              {isCopied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
            </button>
          </div>

          <div className="flex flex-col sm:flex-row justify-center items-center space-y-2 sm:space-y-0 sm:space-x-3">
            <Button onClick={togglePaymentMethod} variant="outline">
              {t('donation.toggleButtonPrefix')} {currentPaymentMethod === 'handcash' ? 'RockWallet' : 'HandCash'}
            </Button>
          </div>

          <p className="text-sm text-gray-500">
            {t('donation.thankYou')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DonationModal;
