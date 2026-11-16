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
  balanceError = '',
}) => {
  const { t } = useTranslation();
  const [qrExpanded, setQrExpanded] = useState(showQR);

  const unconfirmed = walletBalance?.unconfirmed || 0;
  const copyLabel = isCopied
    ? t('bsvPayment.statusMessages.addressCopied')
    : t('bsvPayment.copyButton');
  const qrLabel = qrExpanded
    ? t('bsvPayment.receive.hideQr')
    : t('bsvPayment.receive.showQr');

  return (
    <>
      <div className="mb-4">
        <div className="flex items-start gap-2 rounded-[var(--radius)] bg-muted p-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] leading-4 text-muted-foreground">
              {t('bsvPayment.receive.addressLabel')}
            </p>
            <div className="select-all break-all font-mono text-sm">{address}</div>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              onClick={copyAddress}
              title={copyLabel}
              aria-label={copyLabel}
              className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] text-muted-foreground transition-colors hover:bg-background/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {isCopied ? <Check size={16} className="text-primary" /> : <Copy size={16} />}
            </button>
            {qrcode && (
              <button
                onClick={() => setQrExpanded(v => !v)}
                title={qrLabel}
                aria-label={qrLabel}
                aria-expanded={qrExpanded}
                className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] text-muted-foreground transition-colors hover:bg-background/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {qrExpanded ? <ChevronUp size={16} /> : <QrCode size={16} />}
              </button>
            )}
          </div>
        </div>
        {qrcode && qrExpanded && (
          <div className="mt-2 flex justify-center">
            <img
              src={qrcode}
              alt={t('bsvPayment.qrCode')}
              // 二维码自带静区，深色底上必须给白底，否则部分扫码器读不出来。
              className="h-48 w-48 rounded-[var(--radius)] border border-border bg-white p-2"
            />
          </div>
        )}
      </div>
      <div className="mb-4 flex items-center justify-center gap-2 text-muted-foreground">
        {isBalanceLoading ? (
          <span className="inline-flex items-center gap-2" role="status">
            <span className="inline-block h-4 w-32 animate-pulse rounded bg-muted" />
            <span className="inline-block h-4 w-12 animate-pulse rounded bg-muted" />
          </span>
        ) : balanceError ? (
          <span className="text-[12px] leading-[17px]" role="status">
            {t('bsvPayment.balanceUnavailable')}
          </span>
        ) : (
          <span className="text-center" role="status">
            {t('bsvPayment.balanceLabel')}:
            <span className="font-semibold">
              {convertSatoshisToBSV(walletBalance.total)} BSV
              {rate && (
                <span className="font-normal">
                  {' '}
                  (${convertSatoshisToFiat(walletBalance.total, rate)})
                </span>
              )}
            </span>
            {unconfirmed > 0 && (
              <span className="ml-2 text-[11px] text-[var(--warn)]">
                {t('bsvPayment.balanceUnconfirmed', {
                  amount: convertSatoshisToBSV(unconfirmed),
                })}
              </span>
            )}
          </span>
        )}
        <button
          onClick={refreshAll}
          disabled={isRefreshing}
          title={t('bsvPayment.refreshBalanceButton')}
          aria-label={t('bsvPayment.refreshBalanceButton')}
          className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </>
  );
};

export default WalletInfo;
