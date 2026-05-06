import { useState, useEffect, useCallback, useRef } from 'react';
import { processRefund } from '../utils/transaction';
import { useLog, LOG_TYPES } from '../contexts/LogContext';
import { checkGoogleConnectivity } from '../utils/network';

export const usePaymentFlow = ({ onPaymentSuccess, wallet, t }) => {
  const { addLog } = useLog();
    const {
    refreshBalance,
    ensurePrivateKeyLoaded,
    utxos: walletUtxos,
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
  const pollAndProcessPayment = useCallback(async (
    { currentSendRequest, address, pubKey },
    isInitialCheck = false
  ) => {
    if (!address) return false;

    try {
        let currentUtxos = walletUtxos;

        if (!isInitialCheck) {
            const refreshResult = await refreshBalance(address);
            if (refreshResult) {
                currentUtxos = refreshResult.utxos;
            }
        }

        const dryRunResult = await processRefund(currentUtxos, currentSendRequest, {
            dryRun: true,
            address,
            t,
            pubKey,
            addLog,
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
                const cancelMsg = t('bsvPayment.statusMessages.errors.paymentCancelled', 'Payment cancelled.');
                addLog(cancelMsg, LOG_TYPES.WARN);
                setStatusMessage(cancelMsg);
                return false; 
            }
            // Other errors during key loading
            const keyError = 'Failed to load private key for payment.';
            addLog(keyError, LOG_TYPES.ERROR);
            setStatus('error');
            setStatusMessage(keyError);
            return false;
        }

        const processResult = await processRefund(currentUtxos, currentSendRequest, {
            privateKey: keyResult.loadedPrivKey,
            dryRun: false,
            t,
            pubKey,
            address,
            setStatus,
            setStatusMessage,
            addLog,
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
  }, [refreshBalance, t, onPaymentSuccess, ensurePrivateKeyLoaded, walletUtxos]);

  const startBalanceCheck = useCallback((request, walletData) => {
    stopPolling();
    const executeCheck = async (isInitial = false) => {
        const shouldContinue = await pollAndProcessPayment({
            currentSendRequest: request,
            ...walletData
        }, isInitial);
        
        if (shouldContinue) {
            // Pass walletData for subsequent checks so refreshBalance has the address
            checkInterval.current = setTimeout(() => executeCheck(false), 6000);
        } else {
            stopPolling();
        }
    };
    executeCheck(true); // First check is initial
  }, [pollAndProcessPayment]);

  const handlePaymentRequest = useCallback((walletData) => {
    const hash = window.location.hash.substring(1);
    if (hash) {
        addLog('Payment request detected in URL hash.', LOG_TYPES.INFO);
        checkGoogleConnectivity().then(isOnline => {
            addLog(`Connectivity check: ${isOnline ? 'Direct (Google reachable)' : 'Restricted (Google unreachable, using DoH)'}`, isOnline ? LOG_TYPES.SUCCESS : LOG_TYPES.WARN);
        });

        try {
            const decodedHash = decodeURIComponent(hash);
            const params = JSON.parse(decodedHash);
            if (params && params.length > 0) {
                addLog(`Parsed payment request with ${params.length} outputs.`, LOG_TYPES.SUCCESS);
                setSendRequest(params);
                setShowWalletManager(false);

                if (!walletData || !walletData.address) {
                  const errorMsg = "Payment request started without wallet data.";
                  console.error(errorMsg);
                  addLog(errorMsg, LOG_TYPES.ERROR);
                  setStatus('error');
                  setStatusMessage('Wallet not ready for payment request.');
                  return;
                }
                startBalanceCheck(params, walletData);
            }
        } catch (e) {
            const errorMsg = `Failed to parse params from URL hash: ${e.message}`;
            console.error(errorMsg);
            addLog(errorMsg, LOG_TYPES.ERROR);
            setStatus('error');
            setStatusMessage(t('bsvPayment.statusMessages.invalidRequest'));
        }
    } else {
        setShowWalletManager(true);
    }
  }, [t, startBalanceCheck, addLog]);
  
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
