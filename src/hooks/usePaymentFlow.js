import { useState, useEffect, useCallback, useRef } from 'react';
import { getUTXOs } from '../utils/api';
import { processRefund } from '../utils/transaction';

export const usePaymentFlow = ({ onPaymentSuccess, wallet, t }) => {
  const {
    address,
    walletBalance,
    refreshBalance,
    pubKey,
    ensurePrivateKeyLoaded,
  } = wallet;

  const [status, setStatus] = useState('waiting');
  const [statusMessage, setStatusMessage] = useState('');
  const [minCost, setMinCost] = useState(10);
  const [isAmountCalculated, setIsAmountCalculated] = useState(false);
  const [sendRequest, setSendRequest] = useState(null);
  const [showWalletManager, setShowWalletManager] = useState(true);

  const checkInterval = useRef(null);

  const stopPolling = () => {
    if (checkInterval.current) {
        clearTimeout(checkInterval.current);
        checkInterval.current = null;
    }
  };

  // This function polls for sufficient balance and processes the payment once funds are available.
  // It is designed for handling automatic payments initiated from a URL.
  const pollAndProcessPayment = useCallback(async (currentSendRequest) => {
    if (!address) return false;
    try {
        await refreshBalance();
        const utxos = await getUTXOs(address);

        if (utxos.length === 0 && walletBalance.total > 0) {
            setStatus('error');
            setStatusMessage(t('bsvPayment.statusMessages.errors.utxoFetchFailed'));
            return false;
        }

        const dryRunResult = await processRefund(utxos, currentSendRequest, {
            dryRun: true,
            address,
            t,
            pubKey,
        });

        if (dryRunResult.error === 'insufficient-funds') {
            setMinCost(dryRunResult.totalRequired || 10);
            setIsAmountCalculated(true);
            setStatus('waiting');
            setStatusMessage(t('bsvPayment.statusMessages.waitingPay'));
            return true; // Continue polling
        } else if (dryRunResult.error) {
            setStatus('error');
            setStatusMessage(dryRunResult.message || t('bsvPayment.statusMessages.dryRunFailed'));
            return false; // Stop on other dry run errors
        }

        // Funds are sufficient, now we can request PIN
        setIsAmountCalculated(true);
        setMinCost(dryRunResult.totalRequired);

        const keyResult = await ensurePrivateKeyLoaded(pubKey, address);
        
        if (!keyResult || !keyResult.loadedPrivKey) {
            if (keyResult && keyResult.error === 'unlock-cancelled') {
                // User cancelled the PIN prompt. We should stop.
                setStatus('error');
                setStatusMessage(t('bsvPayment.statusMessages.errors.paymentCancelled', 'Payment cancelled.'));
                return false; 
            }
            // Other errors during key loading
            setStatus('error');
            setStatusMessage('Failed to load private key for payment.');
            return false;
        }

        const processResult = await processRefund(utxos, currentSendRequest, {
            privateKey: keyResult.loadedPrivKey,
            dryRun: false,
            t,
            pubKey,
            address,
            setStatus,
            setStatusMessage,
        });

        if (processResult.error === 0) {
            if (currentSendRequest) {
                setTimeout(() => onPaymentSuccess(processResult.txid), 100);
            }
            return false; // Stop polling on success
        } else {
            // Transaction failed after PIN was entered. Stop polling and show error.
            // The error is already set by processRefund, so just stop.
            return false;
        }
    } catch (error) {
        setStatus('error');
        setStatusMessage(error.message || 'Balance check failed.');
        return false;
    }
}, [address, walletBalance.total, refreshBalance, t, onPaymentSuccess, ensurePrivateKeyLoaded, pubKey]);

  const startBalanceCheck = useCallback((request) => {
    stopPolling();
    const executeCheck = async () => {
        const shouldContinue = await pollAndProcessPayment(request);
        if (shouldContinue) {
            checkInterval.current = setTimeout(executeCheck, 6000);
        } else {
            stopPolling();
        }
    };
    executeCheck();
  }, [pollAndProcessPayment]);

  const handlePaymentRequest = useCallback(() => {
    const hash = window.location.hash.substring(1);
    if (hash) {
        try {
            const decodedHash = decodeURIComponent(hash);
            const params = JSON.parse(decodedHash);
            if (params && params.length > 0) {
                setSendRequest(params);
                setShowWalletManager(false);
                startBalanceCheck(params);
            }
        } catch (e) {
            console.error('Failed to parse params from URL hash:', e);
            setStatus('error');
            setStatusMessage(t('bsvPayment.statusMessages.invalidRequest'));
        }
    } else {
        setShowWalletManager(true);
    }
  }, [t, startBalanceCheck]);
  
  useEffect(() => {
    return () => stopPolling();
  }, []);

  return {
    status,
    statusMessage,
    minCost,
    isAmountCalculated,
    sendRequest,
    showWalletManager,
    handlePaymentRequest,
    setStatus,
    setStatusMessage
  };
};
