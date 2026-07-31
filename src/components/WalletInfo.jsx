import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, RefreshCw, QrCode, ChevronUp } from 'lucide-react';
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
  showQR = false,
  isBalanceLoading = false,
}) => {
  const { t } = useTranslation();
  const [qrExpanded, setQrExpanded] = useState(showQR);

  return (
    <>
      <div className="mb-4">
        <div className="flex flex-col gap-1 p-3 bg-gray-50 dark:bg-gray-950 rounded">
          <div className="font-mono text-sm break-all">{address}</div>
          <div className="flex gap-1 justify-end">
            <button
              onClick={copyAddress}
              title={isCopied ? t('bsvPayment.statusMessages.addressCopied') : t('bsvPayment.copyButton')}
              className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              {isCopied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
            {qrcode && (
              <button
                onClick={() => setQrExpanded(v => !v)}
                title={qrExpanded ? '收起收款码' : '显示收款码'}
                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                {qrExpanded ? <ChevronUp size={14} /> : <QrCode size={14} />}
              </button>
            )}
          </div>
        </div>
        {qrcode && qrExpanded && (
          <div className="mt-2 flex justify-center">
            <img src={qrcode} alt={t('bsvPayment.qrCode')} className="w-48 h-48" />
          </div>
        )}
      </div>
      <div className="text-center text-gray-600 dark:text-gray-300 mb-4 flex items-center justify-center space-x-2">
        {isBalanceLoading ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700 animate-pulse inline-block" />
            <span className="h-4 w-12 rounded bg-gray-200 dark:bg-gray-700 animate-pulse inline-block" />
          </span>
        ) : (
          <span>
            {t('bsvPayment.balanceLabel')}:
            <span className="font-semibold">
              {convertSatoshisToBSV(walletBalance.total)} BSV
              {rate && <span className="font-normal"> (${convertSatoshisToFiat(walletBalance.total, rate)})</span>}
            </span>
          </span>
        )}
        <button onClick={refreshAll} disabled={isRefreshing} title={t('bsvPayment.refreshBalanceButton')}>
          <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </>
  );
};

export default WalletInfo;
