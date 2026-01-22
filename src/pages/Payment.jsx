import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import WalletManager from '../components/WalletManager';
import { useRate } from '../hooks/useRate';
import { Info, Coffee, History } from 'lucide-react';
import TransactionHistory from '../components/TransactionHistory.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import PaymentAbout from '../components/PaymentAbout.jsx';
import DonationModal from '../components/DonationModal.jsx';
import PinDialog from '../components/PinDialog.jsx';
import { PinPromptContext } from '../contexts/PinPromptContext';
import { usePaymentFlow } from '../hooks/usePaymentFlow';
import PaymentStatus from '../components/PaymentStatus.jsx';
import WalletInfo from '../components/WalletInfo.jsx';
import jsQR from 'jsqr';

function WalletUI() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const importFileInput = useRef(null);
  const walletManagerRef = useRef(null);

  const wallet = useWallet();
  const {
    pubKey,
    address,
    qrcode,
    walletName,
    isWalletUiVisible,
    createWallet,
    getWifForBackup,
    handleDeleteWallet,
    handleImportData,
    walletBalance,
    refreshBalance,
    calculateMaxSpendable,
    sendTransaction,
    transferStatus,
    transferMessage,
    clearTransferStatus,
  } = wallet;

  const { rate, refreshRate } = useRate();

  const onPaymentSuccess = useCallback((data) => {
    console.log('onPaymentSuccess called with data:', data);
    if (window.opener) {
        sendDataToParent(data);
    } else {
        redirectBack(data);
    }
  }, [searchParams]);

  const {
    status,
    statusMessage,
    minCost,
    isAmountCalculated,
    sendRequest,
    showWalletManager,
    handlePaymentRequest,
    setStatus,
    setStatusMessage,
  } = usePaymentFlow({ onPaymentSuccess, wallet, t });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [maxTransferAmount, setMaxTransferAmount] = useState(null);

  const [showAboutModal, setShowAboutModal] = useState(false);
  const [isDonationModalVisible, setIsDonationModalVisible] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const isInitializing = useRef(false);

  const statusColor = useMemo(() => {
    switch (status) {
      case 'received': return 'text-green-600 dark:text-green-300';
      case 'processing': return 'text-blue-600 dark:text-blue-300';
      case 'completed': return 'text-green-600 dark:text-green-300';
      case 'error': return 'text-red-600 dark:text-red-300';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  }, [status]);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  };

  const refreshAll = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.all([
        refreshBalance(),
        refreshRate(),
      ]);
    } catch (error) {
      console.error("Failed to refresh data:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, refreshBalance, refreshRate]);

    const sendDataToParent = (data) => {
        console.log('sendDataToParent ', data);
        if (window.opener) {
            window.opener.postMessage({ type: 'payment_success', payload: { txid: data } }, '*');
            const handleConfirmation = (event) => {
                if (event.data && event.data.type === 'message_received') {
                    console.log('Received confirmation from parent, closing window.');
                    window.removeEventListener('message', handleConfirmation);
                    window.close();
                }
            };
            window.addEventListener('message', handleConfirmation);
        } else {
            console.error('No parent window found, falling back to redirect.');
            redirectBack(data);
        }
    };

    const redirectBack = (data) => {
        const callbackUrl = searchParams.get('callbackUrl');
        if (callbackUrl) {
            const paymentResult = new URLSearchParams({ status: 'success', data });
            const separator = callbackUrl.includes('?') ? '&' : '?';
            const redirectUrl = `${callbackUrl}${separator}${paymentResult.toString()}`;
            window.location.replace(redirectUrl);
        } else {
            console.error('No callbackUrl found in query parameters');
        }
    };

    useEffect(() => {
        const initialize = async () => {
            if (hasInitialized || isInitializing.current) return;
            isInitializing.current = true;

            const result = await createWallet();
            if (result?.error) {
                setStatus('error');
                setStatusMessage(result.message);
            } else {
                setHasInitialized(true);
            }
        };

        initialize();
    }, [createWallet, hasInitialized, setStatus, setStatusMessage]);

    useEffect(() => {
        if (hasInitialized) {
            handlePaymentRequest();
        }
    }, [hasInitialized, handlePaymentRequest]);

    const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const imageData = e.target.result;
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageDataObj = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const code = jsQR(imageDataObj.data, imageDataObj.width, imageDataObj.height);

        if (code) {
          const result = await handleImportData(code.data);
          if (result?.error && walletManagerRef.current?.updateTransferStatus) {
            walletManagerRef.current.updateTransferStatus('error', result.message);
          } else if (result?.walletName) {
            console.log('Wallet imported successfully:', result.walletName);
          }
        } else {
          await handleImportData(file);
        }
      };
      img.src = imageData;
    };
    reader.readAsDataURL(file);
    // Reset file input to allow importing the same file again
    event.target.value = '';
  };

  const handleRequestImportWallet = () => {
    importFileInput.current.click();
  };

  const handleRequestCalculateMax = useCallback(async () => {
    console.log("Request to calculate max transfer amount");
    const result = await calculateMaxSpendable();
    if (result && typeof result.maxAmount === 'number') {
        setMaxTransferAmount(result.maxAmount);
    } else {
        setMaxTransferAmount(0); // Fallback
    }
  }, [calculateMaxSpendable]);

  const handleTransferFunds = useCallback(async (target, amount) => {
    try {
      const result = await sendTransaction(target, amount);
      console.log('Transfer result:', result);
      if (result.success) {
        // On success, refresh balance and potentially max spendable amount
        await refreshAll();
        handleRequestCalculateMax(); // Recalculate max spendable after transfer
      }
    } catch (error) {
      // Re-throw to allow WalletManager to catch it and update its UI state (e.g., stop loading spinner).
      // This is critical for proper UI feedback on failure or cancellation.
      throw error;
    }
  }, [sendTransaction, refreshAll, handleRequestCalculateMax]);


  return (
    <>
      <div className="min-h-screen py-8">
        <div className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 relative">
          <div className="absolute top-4 right-4 flex items-center space-x-2">
            <button onClick={() => setShowAboutModal(true)} title="About" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              <Info className="h-5 w-5" />
            </button>
            {!sendRequest && (
              <button onClick={() => setIsDonationModalVisible(true)} title="Buy me a coffee" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <Coffee className="h-5 w-5" />
              </button>
            )}
            <button onClick={() => setShowHistoryModal(true)} title="交易历史" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              <History className="h-5 w-5" />
            </button>
          </div>
          <h1 className="text-2xl font-bold text-center">{t('bsvPayment.title')}</h1>
           {!sendRequest && <p className="text-sm text-center text-gray-500 mb-4">{t('bsvPayment.statusMessages.notSafeForStorage')}</p>}

          {sendRequest && (
            <PaymentStatus
              status={status}
              statusMessage={statusMessage}
              isAmountCalculated={isAmountCalculated}
              minCost={minCost}
              rate={rate}
              walletBalance={walletBalance}
              statusColor={statusColor}
            />
          )}


          {walletName && (
            <div className="text-center text-gray-600 dark:text-gray-300">
              <span className="text-sm"><span className="font-semibold">{walletName}</span></span>
            </div>
          )}

          {isWalletUiVisible ? (
            <>
              <WalletInfo
                qrcode={qrcode}
                address={address}
                isCopied={isCopied}
                copyAddress={copyAddress}
                walletBalance={walletBalance}
                rate={rate}
                refreshAll={refreshAll}
                isRefreshing={isRefreshing}
              />
              {showWalletManager && (
                <WalletManager
                  ref={walletManagerRef}
                  address={address}
                  maxTransferAmountValue={maxTransferAmount}
                  isWalletMode={isWalletUiVisible}
                  getWifForBackup={getWifForBackup}
                  rate={rate}
                  onDeleteWallet={handleDeleteWallet}
                  onRequestCalculateMaxTransfer={handleRequestCalculateMax}
                  onTransferFunds={handleTransferFunds}
                  onRequestImportWallet={handleRequestImportWallet}
                  transferStatus={transferStatus}
                  transferMessage={transferMessage}
                  onClearTransferStatus={clearTransferStatus}
                />
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">{t('bsvPayment.statusMessages.walletLoading')}</p>
            </div>
          )}

        </div>
          <Dialog open={showHistoryModal} onOpenChange={(open) => !open && setShowHistoryModal(false)}>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>{t('transactionHistory.title')}</DialogTitle>
              </DialogHeader>
              <TransactionHistory
                address={address}
                pubKey={pubKey}
              />
            </DialogContent>
          </Dialog>

          <PaymentAbout show={showAboutModal} onClose={() => setShowAboutModal(false)} />

          <DonationModal
            show={isDonationModalVisible}
            onClose={() => setIsDonationModalVisible(false)}
            rate={rate}
          />

        <input type="file" ref={importFileInput} onChange={handleFileChange} accept="image/*,.bsv" style={{ display: 'none' }} />
      </div>
    </>
  );
}

// This component sets up the PinPrompt context and renders the main UI.
export default function Payment() {
  const { t } = useTranslation();
  const [pinState, setPinState] = useState({ isOpen: false });

  const handlePinResolve = useCallback((value) => {
    if (pinState.onResolve) {
      pinState.onResolve(value);
    }
    setPinState({ isOpen: false });
  }, [pinState.onResolve]);

  const handlePinReject = useCallback(() => {
    if (pinState.onReject) {
      // Pass a special value to indicate cancellation, avoiding an Error object
      // which might trigger unwanted notifications.
      pinState.onReject({ cancelled: true });
    }
    setPinState({ isOpen: false });
  }, [pinState.onReject]);


  const showInfo = useCallback((title, message) => {
    return new Promise((resolve) => {
      const options = {
        mode: 'info',
        title,
        message,
        confirmButtonText: t('bsvPayment.statusMessages.gotItButton'),
        showCancelButton: false,
      };
      setPinState({
        ...options,
        isOpen: true,
        onResolve: () => handlePinResolve(resolve),
        onReject: () => { // Should not happen for info
          setPinState({ isOpen: false });
          resolve();
        },
      });
    });
  }, [t, handlePinResolve]);

  const promptForPin = useCallback((mode, options = {}) => {
    return new Promise((resolve, reject) => {
      let config = {};
      const defaultWalletName = t('bsvPayment.pinModal.defaultWalletName');

      if (mode === 'set') {
        config = {
          mode: 'set',
          title: t('bsvPayment.pinModal.setTitle'),
          inputs: [
            { id: 'walletName', label: t('bsvPayment.pinModal.walletNamePrompt'), type: 'text', placeholder: t('bsvPayment.pinModal.walletNamePlaceholder'), defaultValue: defaultWalletName, maxLength: 20 },
            { id: 'pin', label: t('bsvPayment.pinModal.setPrompt'), type: 'password', placeholder: t('bsvPayment.pinModal.pinInputPlaceholder'), required: true, maxLength: 20, hintMessage: t('bsvPayment.pinModal.pinHintForSet') },
          ],
          confirmButtonText: t('bsvPayment.pinModal.setButton'),
          showCancelButton: false,
          hideModalHeaderCloseButton: true,
        };
      } else if (mode === 'confirm') {
        config = {
          mode: 'confirm',
          title: t('bsvPayment.pinModal.confirmTitle'),
          inputs: [{ id: 'pin', label: t('bsvPayment.pinModal.confirmPrompt'), type: 'password', placeholder: t('bsvPayment.pinModal.pinInputPlaceholder'), required: true }],
          confirmButtonText: t('bsvPayment.pinModal.confirmButton'),
          showCancelButton: false,
          hideModalHeaderCloseButton: true,
        };
      } else { // unlock
        config = {
          mode: 'unlock',
          title: t('bsvPayment.pinModal.unlockTitle'),
          inputs: [{ id: 'pin', label: t('bsvPayment.pinModal.unlockPrompt'), type: 'password', placeholder: t('bsvPayment.pinModal.pinInputPlaceholder'), required: true }],
          confirmButtonText: t('bsvPayment.pinModal.unlockButton'),
          cancelButtonText: t('bsvPayment.pinModal.cancelButton'),
          showCancelButton: true,
          hideModalHeaderCloseButton: false,
        };
      }

      setPinState({
        ...config,
        ...options,
        isOpen: true,
        onResolve: resolve,
        onReject: reject,
      });
    });
  }, [t]);

  const contextValue = useMemo(() => ({
    promptForPin,
    showInfo,
  }), [promptForPin, showInfo]);

  return (
    <PinPromptContext.Provider value={contextValue}>
      <WalletUI />
      <PinDialog
        pinState={pinState}
        onResolve={handlePinResolve}
        onReject={handlePinReject}
      />
    </PinPromptContext.Provider>
  );
}
