import React from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, RefreshCw } from 'lucide-react';
import { convertSatoshisToBSV, convertSatoshisToFiat } from '../utils/bsv';

const WalletInfo = ({
  address,
  isCopied,
  copyAddress,
  walletBalance,
  rate,
  refreshAll,
  isRefreshing,
  isBalanceLoading = false,
  balanceError = '',
}) => {
  const { t } = useTranslation();

  const unconfirmed = walletBalance?.unconfirmed || 0;
  const copyLabel = isCopied
    ? t('bsvPayment.statusMessages.addressCopied')
    : t('bsvPayment.copyButton');

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
          <button
            onClick={copyAddress}
            title={copyLabel}
            aria-label={copyLabel}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted-foreground transition-colors hover:bg-background/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {isCopied ? <Check size={16} className="text-primary" /> : <Copy size={16} />}
          </button>
        </div>
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
