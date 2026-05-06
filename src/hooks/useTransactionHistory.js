import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchAddressTransactions as getTransactionsByAddress,
  fetchTransactionDetailsBatch,
} from '../utils/api';
import { formatSingleTransaction } from '../utils/history';

const TRANSACTIONS_PER_PAGE = 3;

export const useTransactionHistory = (address, pubKey) => {
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const rawTxHistoryCache = useRef([]);
  const [loadedCount, setLoadedCount] = useState(0);

  const fetchAndFormatTransactions = async (txids, currentAddress, currentPubKey) => {
    if (txids.length === 0) return [];

    const details = await fetchTransactionDetailsBatch(txids);
    const detailsMap = details.reduce((map, detail) => {
      if (detail) map[detail.txid] = detail;
      return map;
    }, {});

    const combinedTxs = txids.map(txid => {
      const historyInfo = rawTxHistoryCache.current.find(h => h.tx_hash === txid);
      return {
        ...detailsMap[txid],
        blockheight: historyInfo ? historyInfo.height : 0,
      };
    });
    
    const pubKeyHex = currentPubKey ? currentPubKey.toString() : null;

    return combinedTxs.map(tx => formatSingleTransaction(tx, pubKeyHex, currentAddress)).filter(Boolean);
  };

  const fetchTransactions = useCallback(async () => {
    if (!address || isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const history = await getTransactionsByAddress(address);
      rawTxHistoryCache.current = history;

      if (history.length === 0) {
        setTransactions([]);
        setHasMore(false);
        setIsLoading(false);
        return;
      }

      const txidsToFetch = history.slice(0, TRANSACTIONS_PER_PAGE).map(h => h.tx_hash);
      const formatted = await fetchAndFormatTransactions(txidsToFetch, address, pubKey);
      
      const sorted = formatted.sort((a, b) => b.time - a.time);

      setTransactions(sorted);
      setLoadedCount(txidsToFetch.length);
      setHasMore(txidsToFetch.length < history.length);
    } catch (e) {
      setError(e);
      console.error('Failed to fetch transaction history:', e);
    } finally {
      setIsLoading(false);
    }
  }, [address, pubKey]);

  const loadMoreTransactions = useCallback(async () => {
    if (!hasMore || isLoadingMore || !rawTxHistoryCache.current) return;

    setIsLoadingMore(true);
    try {
      const nextOffset = loadedCount;
      const txidsToFetch = rawTxHistoryCache.current
        .slice(nextOffset, nextOffset + TRANSACTIONS_PER_PAGE)
        .map(h => h.tx_hash);

      if (txidsToFetch.length > 0) {
        const newFormatted = await fetchAndFormatTransactions(txidsToFetch, address, pubKey);
        
        const combined = [...transactions, ...newFormatted];
        const sorted = combined.sort((a, b) => b.time - a.time);

        setTransactions(sorted);
        setLoadedCount(loadedCount + txidsToFetch.length);
        setHasMore(loadedCount + txidsToFetch.length < rawTxHistoryCache.current.length);
      }
    } catch (e) {
      setError(e);
      console.error('Failed to load more transactions:', e);
    } finally {
      setIsLoadingMore(false);
    }
  }, [address, pubKey, transactions, hasMore, isLoadingMore, loadedCount]);
  
  return {
    transactions,
    isLoading,
    error,
    hasMore,
    isLoadingMore,
    fetchTransactions,
    loadMoreTransactions,
  };
};
