import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTransactionHistory } from '../hooks/useTransactionHistory';
import { truncate } from '../utils/bsv';
import { Copy, Check } from 'lucide-react';
import { getTxExplorerUrl } from '../utils/apiProviderHealth';

const TransactionHistory = ({ address, pubKey }) => {
  const { t } = useTranslation();
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
    return date.toLocaleString();
  };

  const formatAmount = (amount) => {
    if (amount === undefined || amount === null) return '0';
    return Number(amount).toFixed(8).replace(/\.?0+$/, '') || '0';
  };

  const copyTxid = async (txid) => {
    try {
      await navigator.clipboard.writeText(txid);
      setCopyStatus(prev => ({ ...prev, [txid]: true }));
      setTimeout(() => {
      setCopyStatus(prev => ({ ...prev, [txid]: false }));
    }, 2000);
  } catch (err) {
    console.error('Failed to copy txid:', err);
  }
};

  return (
    <div className="p-4">
      <div className="font-bold mb-2 text-gray-800 dark:text-gray-100 flex items-baseline">
        <span>{t('transactionHistory.smallTitle')}</span>
        {!isLoading && transactions.length > 0 && (
          <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
            {t('transactionHistory.loadedCount', { count: transactions.length })}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center items-center py-8">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="ml-3 text-gray-600 dark:text-gray-400">{t('transactionHistory.loading')}</p>
        </div>
      )}

      {error && (
        <div className="text-red-600 dark:text-red-400 text-center py-8">
          <p>{t('transactionHistory.error')}: {error.message}</p>
        </div>
      )}

      {!isLoading && !error && transactions.length === 0 && (
        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
          <p>{t('transactionHistory.noRecords')}</p>
        </div>
      )}

      {transactions.length > 0 && (
        <>
          <ul className="space-y-3 max-h-[60vh] overflow-y-auto">

            {transactions.map(tx => (
              <li
                key={tx.txid}
                className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex-1 mb-2 sm:mb-0 flex flex-col">
                  <div className="flex justify-between items-center mb-1">
                    {pubKey && (
                      tx.type === 'data/internal' ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400">
                          {t('transactionHistory.internalTransfer')}
                        </span>
                      ) : (
                        <span
                          className={`font-bold text-lg ${tx.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                        >
                          {tx.type === 'income' ? '+' : '-'}
                          {formatAmount(tx.amount)}
                        </span>
                      )
                    )}
                    <span className="text-sm text-gray-500 dark:text-gray-300">
                      {formatDate(tx.time)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 flex justify-end">
                    <div>
                      <a
                        href={getTxExplorerUrl(tx.txid)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-blue-500 dark:hover:text-blue-300"
                        title={tx.txid}
                      >
                        {truncate(tx.txid, 6, 6)}
                      </a>
                      <button
                        onClick={() => copyTxid(tx.txid)}
                        title={copyStatus[tx.txid] ? t('transactionHistory.copied') : t('transactionHistory.copy')}
                        className="ml-2 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        {copyStatus[tx.txid] ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex justify-center mt-4">
            {hasMore ? (
              <button
                onClick={loadMoreTransactions}
                disabled={isLoadingMore}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoadingMore ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-2"></div>
                    {t('transactionHistory.loading')}
                  </>
                ) : (
                  t('transactionHistory.loadMore')
                )}
              </button>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">{t('transactionHistory.allLoaded')}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default TransactionHistory;
