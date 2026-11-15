import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useWallet } from '../hooks/useWallet';
import WalletManager from '../components/WalletManager';
import { useRate } from '../hooks/useRate';
import { Info, Coffee, History, Settings } from 'lucide-react';
import TransactionHistory from '../components/TransactionHistory.jsx';
import SettingsModal from '../components/SettingsModal.jsx';
import { getRecommendedProvider } from '../utils/apiProviderHealth';
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
import { usePinManager } from '../hooks/usePinManager';
import WalletInfo from '../components/WalletInfo.jsx';
import DebugConsole from '../components/DebugConsole.jsx';
import jsQR from 'jsqr';
import { checkGoogleConnectivity } from '../utils/network';
import { copyText } from '../utils/clipboard';
import { OFFLINE_RELEASE_URL } from '../utils/links';

function WalletUI() {
  const { t } = useTranslation();
  const { showInfo } = usePinManager();
  const importFileInput = useRef(null);
  const walletManagerRef = useRef(null);
  const appVersion = __APP_VERSION__;

  const wallet = useWallet();
  const {
    pubKey,
    address,
    qrcode,
    walletName,
    isWalletUiVisible,
    isWatchOnly,
    createWallet,
    getWifForBackup,
    handleDeleteWallet,
    handleImportData,
    ensurePrivateKeyLoaded,
    walletBalance,
    refreshBalance,
    calculateMaxSpendable,
    sendTransaction,
    transferStatus,
    transferMessage,
    clearTransferStatus,
    utxos,
    isBalanceLoading,
  } = wallet;

  const { rate, refreshRate } = useRate();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [maxTransferAmount, setMaxTransferAmount] = useState(null);
  const [initError, setInitError] = useState('');
  const [needsRecovery, setNeedsRecovery] = useState(false);
  // 用户在「设置钱包」里选了导入，文件选择框已经打开（或刚被取消）。
  const [needsSetup, setNeedsSetup] = useState(false);

  const [showAboutModal, setShowAboutModal] = useState(false);
  const [isDonationModalVisible, setIsDonationModalVisible] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [currentProvider, setCurrentProvider] = useState(() => getRecommendedProvider()?.name || 'bananablocks');
  const isInitializing = useRef(false);

  const copyAddress = async () => {
    const copied = await copyText(address);
    if (copied) {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } else {
      console.error('Failed to copy address');
    }
  };

  const refreshAll = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.all([
        refreshBalance(),
      ]);
    } catch (error) {
      console.error("Failed to refresh data:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, refreshBalance]);

    useEffect(() => {
        if (isInitializing.current) return;
        isInitializing.current = true;

        const initializeWallet = async () => {
            // 第三方付款请求入口（URL hash 形式的 paymentParams）已下线。
            // 这里仍识别旧链接：清掉 hash 并提示一次，避免调用方误以为页面卡住。
            // 注意：离线单文件版用 HashRouter（#/…），不能把路由 hash 当成旧付款参数。
            const legacyHash = window.location.hash;
            if (legacyHash.length > 1 && !legacyHash.startsWith('#/')) {
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
                console.warn('[payment] Legacy payment-request entry point is retired; URL hash cleared.');
                await showInfo(
                    t('bsvPayment.retiredPaymentRequest.title'),
                    t('bsvPayment.retiredPaymentRequest.message')
                );
            }

            checkGoogleConnectivity();

            const result = await createWallet({
                onImport: () => {
                    handleRequestImportWallet();
                }
            });

            applyInitResult(result);
        };

        initializeWallet();
    }, [createWallet, showInfo, t]);

    const applyInitResult = (result) => {
        if (!result?.error) {
            setNeedsRecovery(false);
            setNeedsSetup(false);
            return;
        }
        if (result.error === 'import-requested') {
            // 这不是失败：createWallet 已经替我们把文件选择框打开了，接下来会走
            // handleFileChange → handleImportData。以前这里被当成错误，于是用户一
            // 点「导入钱包」、文件框刚弹出来就看到「导入已取消 / 导入界面不可用」。
            // 只在「用户取消了文件选择」之后才需要给出路，所以这里留一张重试卡片。
            setNeedsSetup(true);
        } else if (result.error === 'wallet-needs-recovery' || result.error === 'wallet-unrecoverable') {
            // 加密私钥还在，只是地址缓存丢了，或者用户刚才取消了 PIN 解锁。
            // 不能把页面留给一个空地址的转圈，要给一个明确的重试入口。
            setNeedsRecovery(true);
            setInitError(result.message || t('bsvPayment.statusMessages.errors.walletRecoveryNeeded'));
        } else {
            setInitError(result.message);
        }
    };

    const handleRetryRecovery = async () => {
        setInitError('');
        setNeedsSetup(false);
        const result = await createWallet({
            onImport: () => {
                handleRequestImportWallet();
            }
        });
        applyInitResult(result);
    };

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
          await importFromTextFile(file);
        }
      };
      // 选了张不含二维码的图，或者根本不是图片（.bsv 备份文件就是纯文本/JSON），
      // 一律退回按文本读。老代码这里直接把 File 对象交给 handleImportData，
      // 而它只接受字符串，于是「导入 .bsv 备份文件」永远报 unexpected-data-type。
      img.onerror = async () => {
        await importFromTextFile(file);
      };
      img.src = imageData;
    };
    reader.readAsDataURL(file);
    // Reset file input to allow importing the same file again
    event.target.value = '';
  };

  const importFromTextFile = async (file) => {
    try {
      const text = await file.text();
      const result = await handleImportData(text);
      if (result?.error && walletManagerRef.current?.updateTransferStatus) {
        walletManagerRef.current.updateTransferStatus('error', result.message);
      }
    } catch (error) {
      console.error('Failed to read import file as text:', error);
    }
  };

  const handleRequestImportWallet = () => {
    importFileInput.current.click();
  };

  const handleRequestCalculateMax = useCallback(async (target = null) => {
    console.log("Request to calculate max transfer amount for target:", target);
    const result = await calculateMaxSpendable(target);
    if (result && typeof result.maxAmount === 'number') {
        setMaxTransferAmount(result.maxAmount);
    } else {
        setMaxTransferAmount(0);
    }
    return result;
  }, [calculateMaxSpendable]);

  const handleTransferFunds = useCallback(async (target, amount) => {
    try {
      const result = await sendTransaction(target, amount);
      console.log('Transfer result:', result);
      if (result.success) {
        await refreshAll();
      }
    } catch (error) {
      throw error;
    }
  }, [sendTransaction, refreshAll]);


  return (
    <>
      <div className="min-h-screen py-8">
        <div className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-sm font-semibold text-gray-500 dark:text-gray-400">{t('bsvPayment.title')}</h1>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{t('bsvPayment.tagline')}</p>
            </div>
            <div className="flex items-center space-x-2">
              <button onClick={() => setShowAboutModal(true)} title="About" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <Info className="h-5 w-5" />
              </button>
              <button onClick={() => setIsDonationModalVisible(true)} title="Buy me a coffee" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <Coffee className="h-5 w-5" />
              </button>
              <button onClick={() => setShowHistoryModal(true)} title="交易历史" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <History className="h-5 w-5" />
              </button>
              <button onClick={() => setShowSettingsModal(true)} title="设置" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </div>

          {(walletName || isWatchOnly) && (
            <div className="flex items-center justify-center gap-2 mb-3">
              {walletName && <span className="text-lg font-semibold text-gray-800 dark:text-gray-100">{walletName}</span>}
              {isWatchOnly && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  {t('bsvPayment.watchAddress.badge')}
                </span>
              )}
            </div>
          )}

          {initError && (
            <div className="mb-3 p-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/30 dark:border-red-800">
              <p className="text-center text-sm text-red-700 dark:text-red-300">{initError}</p>
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
                showQR={false}
                isBalanceLoading={isBalanceLoading}
              />
              <WalletManager
                ref={walletManagerRef}
                address={address}
                pubKey={pubKey}
                isWatchOnly={isWatchOnly}
                utxos={utxos}
                ensurePrivateKeyLoaded={ensurePrivateKeyLoaded}
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
            </>
          ) : needsRecovery ? (
            <div className="flex flex-col gap-2 py-4">
              <button
                onClick={handleRetryRecovery}
                className="px-4 py-2 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {t('bsvPayment.pinModal.unlockButton')}
              </button>
              <button
                onClick={handleRequestImportWallet}
                className="px-4 py-2 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                {t('bsvPayment.walletSetup.importButton')}
              </button>
            </div>
          ) : needsSetup ? (
            <div className="flex flex-col gap-2 py-4">
              <button
                onClick={handleRequestImportWallet}
                className="px-4 py-2 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {t('bsvPayment.walletSetup.importButton')}
              </button>
              <button
                onClick={handleRetryRecovery}
                className="px-4 py-2 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                {t('bsvPayment.walletSetup.backToSetup')}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">{t('bsvPayment.statusMessages.walletLoading')}</p>
            </div>
          )}

        </div>
        <footer className="flex items-center justify-center gap-3 p-4 text-sm text-gray-500 dark:text-gray-400">
          <a href="https://github.com/cyio/bitspv-pay" target="_blank" rel="noopener noreferrer" className="text-black dark:text-white hover:opacity-70" title="Source Code on GitHub">
            <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="inline-block h-6 w-6 fill-current">
              <title>GitHub</title>
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.228 0 1.605-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297 24 5.67 18.63 0 12 0z"/>
            </svg>
          </a>
          <a
            href={OFFLINE_RELEASE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:underline"
            title="Offline single-file build"
          >
            {t('bsvPayment.coldStorage.footer')}
          </a>
          <span>v{appVersion}</span>
        </footer>
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

          <SettingsModal
            show={showSettingsModal}
            onClose={() => setShowSettingsModal(false)}
            currentProvider={currentProvider}
            onProviderChange={setCurrentProvider}
          />

          <DonationModal
            show={isDonationModalVisible}
            onClose={() => setIsDonationModalVisible(false)}
            rate={rate}
          />

        <input type="file" ref={importFileInput} onChange={handleFileChange} accept="image/*,.bsv" style={{ display: 'none' }} />
      </div>
      <DebugConsole />
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
        // PinDialog 的 onResolve 已经是 handlePinResolve，这里必须直接把 resolve 挂上。
        // 曾经写成 `() => handlePinResolve(resolve)`，会变成 handlePinResolve 反过来
        // 再调 pinState.onResolve 的无限递归，导致这个 Promise 永远不 resolve
        // （所有 `await showInfo(...)` 的流程都会卡死）。
        onResolve: resolve,
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
            { id: 'pin', label: t('bsvPayment.pinModal.setPrompt'), type: 'password', placeholder: t('bsvPayment.pinModal.pinInputPlaceholder'), required: true, maxLength: 20, hintMessage: t('bsvPayment.pinModal.pinHintForSet'),
              validate: (v) => (v.length >= 8 && /[A-Za-z]/.test(v) && /\d/.test(v)) || t('bsvPayment.pinModal.validation.pinStrength') },
            // 二次输入：PIN 只存在于用户脑子里，输错一个字符就等于把钱包（以及同 PIN
            // 加密的备份文件）永久锁死。这一栏是唯一能在资金不可用之前发现笔误的地方。
            { id: 'pinConfirm', label: t('bsvPayment.pinModal.pinConfirmPrompt'), type: 'password', placeholder: t('bsvPayment.pinModal.pinInputPlaceholder'), required: true, maxLength: 20,
              validate: (v, allValues) => v === allValues?.pin || t('bsvPayment.pinModal.validation.pinMismatch') },
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
      } else if (mode === 'setup') { // New setup mode
          config = {
             mode: 'setup',
             confirmButtonText: '',
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

      if (mode === 'watch-address') {
        config = {
          mode: 'watch-address',
          title: t('bsvPayment.watchAddress.title'),
          inputs: [{ id: 'pin', label: t('bsvPayment.watchAddress.addressLabel'), type: 'text', placeholder: t('bsvPayment.watchAddress.placeholder'), required: true }],
          confirmButtonText: t('bsvPayment.watchAddress.confirmButton'),
          cancelButtonText: t('bsvPayment.pinModal.cancelButton'),
          showCancelButton: true,
          hideModalHeaderCloseButton: false,
        };
      }

      setPinState({
        ...config,
        ...options,
        onImport: options.onImport ? () => {
            if (options.onImport) options.onImport();
            reject({ importRequested: true });
            setPinState({ isOpen: false });
        } : undefined,
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
