import React from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, RefreshCw } from 'lucide-react';
import { convertSatoshisToBSV, convertSatoshisToFiat } from '../utils/bsv';

const WalletInfo = ({
  qrcode,
  address,
  isCopied,
  copyAddress,
  walletBalance,
  rate,
  refreshAll,
  isRefreshing,
}) => {
  const { t } = useTranslation();

  return (
    <>
      {qrcode && (
        <div className="mt-2 mb-4">
          <div className="flex justify-center">
            <img src={qrcode} alt={t('bsvPayment.qrCode')} className="w-48 h-48" />
          </div>
        </div>
      )}
      <div className="mb-6">
        <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-950 rounded">
          <div className="flex-1 font-mono text-sm truncate">{address}</div>
          <button
            onClick={copyAddress}
            title={isCopied ? t('bsvPayment.statusMessages.addressCopied') : t('bsvPayment.copyButton')}
            className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            {isCopied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
          </button>
        </div>
      </div>
      <div className="text-center text-gray-600 dark:text-gray-300 mb-4 flex items-center justify-center space-x-2">
        <span>
          {t('bsvPayment.balanceLabel')}:
          <span className="font-semibold">
            {convertSatoshisToBSV(walletBalance.total)} BSV
            {rate && <span className="font-normal"> (${convertSatoshisToFiat(walletBalance.total, rate)})</span>}
          </span>
        </span>
        <button onClick={refreshAll} disabled={isRefreshing} title={t('bsvPayment.refreshBalanceButton')}>
          <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </>
  );
};

export default WalletInfo;
