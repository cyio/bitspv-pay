import React from 'react';
import { useTranslation } from 'react-i18next';

const QRScanner = ({ onScanResult, children }) => {
  const { t } = useTranslation();

  const scan = () => {
    // This is a placeholder. In a real implementation, this would
    // open a camera and start scanning.
    console.log('QRScanner: scan initiated.');
    // For now, we use a simple prompt to simulate scanning a QR code.
    const result = prompt(t('bsvPayment.scanQrPrompt'));
    if (result) {
      onScanResult({ data: result });
    } else if (result !== null) { // Handle empty string input
      onScanResult({ data: '' });
    }
    // If user clicks cancel, result is null, and we do nothing,
    // simulating cancellation of the scan.
  };

  // The children prop is a function that receives the scan function
  // This matches the "scoped slot" pattern from the Vue component
  return children({ scan });
};

export default QRScanner;
