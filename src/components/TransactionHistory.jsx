import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTransactionHistory } from '../hooks/useTransactionHistory';
import { truncate } from '../utils/bsv';
import { Copy, Check } from 'lucide-react';
import { getTxExplorerUrl } from '../utils/apiProviderHealth';
import { copyText } from '../utils/clipboard';

const TransactionHistory = ({ address, pubKey }) => {
  const { t, i18n } = useTranslation();
  const {
    transactions,
    isLoading,
    error,
    hasMore,
    isLoadingMore,
    fetchTransactions,
    loadMoreTransactions,
  } = useTransactionHistory(address, pubKey);

  useEffect(() => {
    if (address) {
      fetchTransactions();
    }
  }, [address, pubKey, fetchTransactions]);

  const [copyStatus, setCopyStatus] = useState({});

  const formatDate = (timestamp) => {
    if (!timestamp) return t('transactionHistory.unconfirmed');
    const date = new Date(timestamp * 1000);
    // 跟随界面语言，别用浏览器 locale：中文界面里蹦出英文日期很出戏。
    const locale = String(i18n.language || '').startsWith('zh') || String(i18n.language) === 'cn'
      ? 'zh-CN'
      : 'en-US';
    return date.toLocaleString(locale);
  };

  const formatAmount = (amount) => {
    if (amount === undefined || amount === null) return '0';
    return Number(amount).toFixed(8).replace(/\.?0+$/, '') || '0';
  };

  const copyTxid = async (txid) => {
    const copied = await copyText(txid);
    if (!copied) return;
    setCopyStatus(prev => ({ ...prev, [txid]: true }));
    setTimeout(() => {
      setCopyStatus(prev => ({ ...prev, [txid]: false }));
    }, 2000);
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline font-bold text-foreground">
        <span>{t('transactionHistory.smallTitle')}</span>
        {!isLoading && transactions.length > 0 && (
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {t('transactionHistory.loadedCount', { count: transactions.length })}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8" role="status">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="ml-3 text-muted-foreground">{t('transactionHistory.loading')}</p>
        </div>
      )}

      {error && (
        <div className="py-8 text-center text-[var(--danger)]">
          <p>
            {t('transactionHistory.error')}: {error.message}
          </p>
          <button
            onClick={fetchTransactions}
            className="mt-3 rounded-[var(--radius)] border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            {t('transactionHistory.retry')}
          </button>
        </div>
      )}

      {!isLoading && !error && transactions.length === 0 && (
        <div className="py-8 text-center text-muted-foreground">
          <p>{t('transactionHistory.noRecords')}</p>
        </div>
      )}

      {transactions.length > 0 && (
        <>
          <ul className="max-h-[60vh] space-y-3 overflow-y-auto">
            {transactions.map(tx => (
              <li
                key={tx.txid}
                className="flex flex-col rounded-[var(--radius)] border border-border bg-muted p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="mb-2 flex flex-1 flex-col sm:mb-0">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    {tx.type === 'data/internal' ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {t('transactionHistory.internalTransfer')}
                      </span>
                    ) : (
                      <span
                        className={`text-lg font-bold ${
                          tx.type === 'income'
                            ? 'text-[var(--seal-text)]'
                            : 'text-[var(--danger)]'
                        }`}
                      >
                        {/* 只有颜色区分收支对色觉障碍不友好，补一个文字方向和单位。 */}
                        <span className="mr-1 text-xs font-medium">
                          {tx.type === 'income'
                            ? t('transactionHistory.received')
                            : t('transactionHistory.sent')}
                        </span>
                        {tx.type === 'income' ? '+' : '-'}
                        {formatAmount(tx.amount)}
                        <span className="ml-1 text-xs font-normal">BSV</span>
                      </span>
                    )}
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {formatDate(tx.time)}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                    {tx.status === 'confirmed' ? (
                      <span className="rounded border border-[var(--seal-border)] bg-[var(--seal-soft)] px-1 text-[10px] text-[var(--seal-text)]">
                        {t('transactionHistory.confirmed')}
                      </span>
                    ) : (
                      <span className="rounded border border-[var(--warn-border)] bg-[var(--warn-soft)] px-1 text-[10px] text-[var(--warn)]">
                        {t('transactionHistory.unconfirmed')}
                      </span>
                    )}
                    <a
                      href={getTxExplorerUrl(tx.txid)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-primary"
                      title={tx.txid}
                    >
                      {truncate(tx.txid, 6, 6)}
                    </a>
                    <button
                      onClick={() => copyTxid(tx.txid)}
                      title={copyStatus[tx.txid] ? t('transactionHistory.copied') : t('transactionHistory.copy')}
                      aria-label={copyStatus[tx.txid] ? t('transactionHistory.copied') : t('transactionHistory.copy')}
                      className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] transition-colors hover:bg-background/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {copyStatus[tx.txid] ? (
                        <Check size={16} className="text-primary" />
                      ) : (
                        <Copy size={16} />
                      )}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex justify-center">
            {hasMore ? (
              <button
                onClick={loadMoreTransactions}
                disabled={isLoadingMore}
                className="rounded-[var(--radius)] bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <>
                    <div className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    {t('transactionHistory.loading')}
                  </>
                ) : (
                  t('transactionHistory.loadMore')
                )}
              </button>
            ) : (
              <p className="text-muted-foreground">{t('transactionHistory.allLoaded')}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default TransactionHistory;
