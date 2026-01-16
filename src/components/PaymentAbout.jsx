
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const PaymentAbout = ({ show, onClose }) => {
  const { t } = useTranslation();
  const version = '1.0.0'; // Example version

  return (
    <Dialog open={show} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('paymentAbout.title')}</DialogTitle>
        </DialogHeader>
        <div>
          <p className="mb-4">{t('paymentAbout.description')}</p>
          
          <div className="mb-4">
            <h3 className="font-bold mb-2">{t('paymentAbout.security.title')}</h3>
            <ul className="list-disc list-inside text-sm">
              <li>{t('paymentAbout.security.provider')}</li>
              <li>{t('paymentAbout.security.browserEnvironment')}</li>
            </ul>
          </div>
          
          <div className="mb-4">
            <h3 className="font-bold mb-2">{t('paymentAbout.usage.title')}</h3>
            <ul className="list-disc list-inside text-sm">
              <li>{t('paymentAbout.usage.disposableAmount')}</li>
              <li>{t('paymentAbout.usage.mobileRecommendation')}</li>
              <li>{t('paymentAbout.usage.desktopComparison')}</li>
            </ul>
          </div>

          <div>
            <h3 className="font-bold mb-2">{t('paymentAbout.tools')}</h3>
            <ul className="list-disc list-inside text-sm">
              <li>
                <a 
                  href="https://bitspv.com/wallet-decrypt" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-blue-500 hover:underline"
                >
                  {t('paymentAbout.walletDecryptTool')}
                </a>
              </li>
            </ul>
          </div>

          <div className="mt-4 text-sm text-gray-500">
            <span>{t('paymentAbout.versionLabel')}: {version}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentAbout;
