
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const DONATION_ADDRESS = '17VZNX1SN5NtKa8UQFxwVfeU8J2dHesc3p'; // Example donation address
const DONATION_QR_CODE_URL = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=bitcoin:${DONATION_ADDRESS}`;

const DonationModal = ({ show, onClose }) => {
  const { t } = useTranslation();
  const [copyBtnText, setCopyBtnText] = useState(t('bsvPayment.copyButton'));

  const handleCopyAddress = async () => {
    const preText = copyBtnText;
    try {
      await navigator.clipboard.writeText(DONATION_ADDRESS);
      setCopyBtnText(t('bsvPayment.statusMessages.addressCopied'));
    } catch (error) {
      console.error('Failed to copy address:', error);
      setCopyBtnText(t('bsvPayment.statusMessages.copyFailed'));
    }
    setTimeout(() => {
      setCopyBtnText(preText);
    }, 1000);
  };

  return (
    <Dialog open={show} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('donation.title')}</DialogTitle>
        </DialogHeader>
        <div className="text-center">
          <p className="mb-4">{t('donation.description')}</p>
          <div className="flex justify-center mb-4">
            <img src={DONATION_QR_CODE_URL} alt="Donation QR Code" className="w-40 h-40" />
          </div>
          <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-950 rounded mb-4">
            <div className="flex-1 font-mono text-sm truncate">{DONATION_ADDRESS}</div>
            <Button onClick={handleCopyAddress} size="sm">
              {copyBtnText}
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
