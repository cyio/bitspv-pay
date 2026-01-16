import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom'; // Assuming you'll use React Router
import { useWallet } from '../hooks/useWallet';
import WalletManager from '../components/WalletManager';
import { useRate } from '../hooks/useRate';
import { convertSatoshisToBSV, convertSatoshisToFiat } from '../utils/bsv';

import AboutIcon from '../components/AboutIcon.jsx';
import CoffeeIcon from '../components/CoffeeIcon.jsx';
import RefreshIcon from '../components/RefreshIcon.jsx';
import HistoryIcon from '../components/HistoryIcon.jsx';
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

// Import jsQR for QR code scanning
import jsQR from 'jsqr';


// This component contains the actual UI and hooks that depend on the PinPromptContext
function WalletUI() {
  const { t } = useTranslation();
  const location = useLocation(); // Replaces useRoute
  const importFileInput = useRef(null);
  const walletManagerRef = useRef(null);

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
    ensurePrivateKeyLoaded,
    walletBalance,
    refreshBalance,
    calculateMaxSpendable,
    sendTransaction
  } = useWallet();

  const { rate, isLoading: isRateLoading, error: rateError, refreshRate } = useRate();


  const [status, setStatus] = useState('waiting'); // waiting, received, processing, completed, error
  const [statusMessage, setStatusMessage] = useState('');
  const [minCost, setMinCost] = useState(10);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copyBtnText, setCopyBtnText] = useState(t('bsvPayment.copyButton'));
  const [maxTransferAmount, setMaxTransferAmount] = useState(null);

  const [showAboutModal, setShowAboutModal] = useState(false);
  const [isDonationModalVisible, setIsDonationModalVisible] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [isAmountCalculated, setIsAmountCalculated] = useState(false);
  const [showWalletManager, setShowWalletManager] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  const statusClasses = useMemo(() => {
    switch (status) {
      case 'received': return 'text-green-600 dark:text-green-300';
      case 'processing': return 'text-blue-600 dark:text-blue-300';
      case 'completed': return 'text-green-600 dark:text-green-300';
      case 'error': return 'text-red-600 dark:text-red-300';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  }, [status]);

  const copyAddress = async () => {
    const preText = copyBtnText;
    try {
      await navigator.clipboard.writeText(address);
      setCopyBtnText(t('bsvPayment.statusMessages.addressCopied'));
    } catch (error) {
      console.error('Failed to copy address:', error);
      setCopyBtnText(t('bsvPayment.statusMessages.copyFailed'));
    }
    setTimeout(() => {
      setCopyBtnText(preText);
    }, 1000);
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

  // onMounted logic
  useEffect(() => {
    const initialize = async () => {
      if (hasInitialized) return; // Prevent duplicate initialization

      const result = await createWallet();
      if (result?.error) {
        setStatus('error');
        setStatusMessage(result.message);
      } else {
        setHasInitialized(true); // Mark as initialized on success
      }
    };

    initialize();
  }, [createWallet, hasInitialized]);

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

        // 使用导入的 jsQR 库来解码 QR 码
        const code = jsQR(imageDataObj.data, imageDataObj.width, imageDataObj.height);

        if (code) {
          const result = await handleImportData(code.data);
          if (result?.error && walletManagerRef.current?.updateTransferStatus) {
            walletManagerRef.current.updateTransferStatus('error', result.message);
          } else if (result?.walletName) {
            // 导入成功后，更新 walletName
            console.log('Wallet imported successfully:', result.walletName);
          }
        } else {
          // QR 码无效，尝试直接导入文件
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
    const max = await calculateMaxSpendable();
    setMaxTransferAmount(max);
  }, [calculateMaxSpendable]);

  const handleTransferFunds = useCallback(async (targetAddress, amount) => {
    console.log(`Transferring ${amount} sats to ${targetAddress}`);
    try {
      const result = await sendTransaction(targetAddress, amount);
      if (walletManagerRef.current) {
        if (result.success) {
          const message = {
            text: result.message,
            linkUrl: `https://whatsonchain.com/tx/${result.txid}`,
            linkText: t('bsvPayment.viewOnExplorer'),
          };
          walletManagerRef.current.updateTransferStatus('completed', message);
          refreshAll();
        } else {
          throw new Error(result.message || 'Transaction failed');
        }
      }
    } catch (error) {
      console.error('handleTransferFunds error:', error);
      throw error;
    }
  }, [sendTransaction, refreshAll, t]);


  return (
    <>
      <div className="min-h-screen py-8">
        <div className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 relative">
          <div className="absolute top-4 right-4 flex items-center space-x-2">
            <button onClick={() => setShowAboutModal(true)} title="About" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              <AboutIcon />
            </button>
            <button onClick={() => setIsDonationModalVisible(true)} title="Buy me a coffee" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              <CoffeeIcon />
            </button>
            <button onClick={() => setShowHistoryModal(true)} title="交易历史" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              <HistoryIcon />
            </button>
          </div>
          <h1 className="text-2xl font-bold text-center">{t('bsvPayment.title')}</h1>
          <p className="text-sm text-center text-gray-500 mb-4">{t('bsvPayment.statusMessages.notSafeForStorage')}</p>

          {walletName && (
            <div className="text-center text-gray-600 dark:text-gray-300">
              <span className="text-sm"><span className="font-semibold">{walletName}</span></span>
            </div>
          )}

          {isWalletUiVisible ? (
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
                  <button onClick={copyAddress} className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">
                    {copyBtnText}
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
                  <RefreshIcon isRefreshing={isRefreshing} />
                </button>
              </div>

              <WalletManager
                ref={walletManagerRef}
                address={address}
                maxTransferAmountValue={maxTransferAmount}
                isWalletMode={isWalletUiVisible}
                getWifFunction={getWifForBackup}
                rate={rate}
                onDeleteWallet={handleDeleteWallet}
                onRequestCalculateMaxTransfer={handleRequestCalculateMax}
                onTransferFunds={handleTransferFunds}
                onRequestImportWallet={handleRequestImportWallet}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">{t('bsvPayment.statusMessages.walletLoading')}</p>
            </div>
          )}

        </div>
          <Dialog open={showHistoryModal} onOpenChange={(open) => !open && setShowHistoryModal(false)}>
            <DialogContent className="max-w-3xl">
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

// This component now sets up the context and renders the UI component.
function PaymentContent() {
  const { t } = useTranslation();
  const [pinState, setPinState] = useState({ isOpen: false });

  const handlePinResolve = useCallback((resolve) => {
    setPinState({ isOpen: false });
    resolve();
  }, []);

  const handlePinReject = useCallback((reject) => {
    setPinState({ isOpen: false });
    reject();
  }, []);

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
        onResolve: (value) => handlePinResolve(() => resolve(value)),
        onReject: () => handlePinReject(reject)
      });
    });
  }, [t, handlePinResolve, handlePinReject]);

  const contextValue = useMemo(() => ({
    promptForPin,
    showInfo,
  }), [promptForPin, showInfo]);

  return (
    <PinPromptContext.Provider value={contextValue}>
      <WalletUI />
      <PinDialog
        pinState={pinState}
        onResolve={pinState.onResolve}
        onReject={pinState.onReject}
      />
    </PinPromptContext.Provider>
  );
}

export default function Payment() {
  // The parent component is now much simpler.
  return (
    <PaymentContent />
  );
}
