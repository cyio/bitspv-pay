import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useWallet } from '../hooks/useWallet';
import WalletManager from '../components/WalletManager';
import { useRate } from '../hooks/useRate';
import { Info, Coffee, History, Settings } from 'lucide-react';
import TransactionHistory from '../components/TransactionHistory.jsx';
import SettingsModal from '../components/SettingsModal.jsx';
import { getRecommendedProvider } from '../utils/apiProviderHealth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { isValidAddress } from '../utils/bsv';
import ReceiveModal from '../components/ReceiveModal.jsx';

function WalletUI() {
  const { t } = useTranslation();
  const { showInfo } = usePinManager();
  const importFileInput = useRef(null);
  const walletManagerRef = useRef(null);
  const appVersion = __APP_VERSION__;
  const isOfflineBuild = import.meta.env.VITE_OFFLINE_BUILD === 'true';

  const wallet = useWallet();
  const {
    pubKey,
    address,
    qrcode,
    walletName,
    isWalletUiVisible,
    isWatchOnly,
    createWallet,
    createNewWallet,
    createWatchOnly,
    getWifForBackup,
    changeWalletPassword,
    handleDeleteWallet,
    handleImportData,
    ensurePrivateKeyLoaded,
    walletBalance,
    refreshBalance,
    calculateMaxSpendable,
    estimateTransfer,
    sendTransaction,
    transferStatus,
    transferMessage,
    clearTransferStatus,
    utxos,
    isBalanceLoading,
    balanceError,
  } = wallet;

  const { rate, refreshRate } = useRate();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [maxTransferAmount, setMaxTransferAmount] = useState(null);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [initError, setInitError] = useState('');
  /**
   * 'loading'  正在读取本地状态（只在 createWallet 真的在跑时）
   * 'empty'    没有钱包 —— 空态，创建 / 导入 / 观察地址由用户发起
   * 'recovery' 私钥还在但地址缓存丢了，需要解锁重建
   * 'failed'   初始化失败
   * 'ready'    有地址，渲染钱包
   */
  const [initState, setInitState] = useState('loading');

  const [showAboutModal, setShowAboutModal] = useState(false);
  const [isDonationModalVisible, setIsDonationModalVisible] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [currentProvider, setCurrentProvider] = useState(
    () => getRecommendedProvider()?.name || 'bananablocks'
  );
  const isInitializing = useRef(false);

  // 地址被清空（删钱包）时不要落回 loading：ready 但没有地址就是空态。
  const viewState = initState === 'ready' && !isWalletUiVisible ? 'empty' : initState;

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
      await Promise.all([refreshBalance()]);
    } catch (error) {
      console.error('Failed to refresh data:', error);
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

      const result = await createWallet();
      applyInitResult(result);
    };

    initializeWallet();
  }, [createWallet, showInfo, t]);

  const applyInitResult = result => {
    const error = result?.error;
    if (!error) {
      setInitError('');
      setInitState('ready');
      return;
    }
    if (error === 'no-wallet') {
      // 没有钱包是正常状态，不是错误，也不需要弹窗。
      setInitError('');
      setInitState('empty');
      return;
    }
    if (error === 'setup-cancelled' || error === 'import-requested') {
      // 用户取消 / 打开了文件选择框：回到空态，不留错误提示。
      setInitError('');
      setInitState('empty');
      return;
    }
    if (error === 'wallet-needs-recovery' || error === 'wallet-unrecoverable') {
      // 加密私钥还在，只是地址缓存丢了，或者用户刚才取消了 PIN 解锁。
      setInitState('recovery');
      setInitError(result.message || t('bsvPayment.statusMessages.errors.walletRecoveryNeeded'));
      return;
    }
    setInitState('failed');
    setInitError(result.message || t('bsvPayment.statusMessages.walletCreateFailed'));
  };

  const handleRetryInit = async () => {
    setInitError('');
    setInitState('loading');
    const result = await createWallet();
    applyInitResult(result);
  };

  const handleCreateWallet = async () => {
    setInitError('');
    const result = await createNewWallet();
    applyInitResult(result);
  };

  const handleWatchOnly = async () => {
    setInitError('');
    const result = await createWatchOnly();
    applyInitResult(result);
  };

  const handleFileChange = async event => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async e => {
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

  const importFromTextFile = async file => {
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
    setImportText('');
    setImportError('');
    setShowImportModal(true);
  };

  const handleChooseImportFile = () => {
    setShowImportModal(false);
    importFileInput.current?.click();
  };

  const handleSubmitImportText = async () => {
    const text = importText.trim();
    if (!text) {
      setImportError(t('bsvPayment.importDialog.emptyError'));
      return;
    }
    setImportError('');
    setIsImporting(true);
    try {
      const result = await handleImportData(text);
      if (result?.error) {
        setImportError(result.message || t('bsvPayment.statusMessages.errors.invalidImportData'));
      }
      // 成功导入时 handleImportData 会 reload 页面，无需在此关闭弹窗
    } catch (error) {
      setImportError(error?.message || t('bsvPayment.statusMessages.errors.invalidImportData'));
    } finally {
      setIsImporting(false);
    }
  };

  const handleRequestCalculateMax = useCallback(
    async (target = null) => {
      console.log('Request to calculate max transfer amount for target:', target);
      const result = await calculateMaxSpendable(target);
      if (result && typeof result.maxAmount === 'number') {
        setMaxTransferAmount(result.maxAmount);
      } else {
        setMaxTransferAmount(0);
      }
      return result;
    },
    [calculateMaxSpendable]
  );

  const handleTransferFunds = useCallback(
    async (target, amount) => {
      try {
        const result = await sendTransaction(target, amount);
        console.log('Transfer result:', result);
        if (result.success) {
          // Max 是按上一组 UTXO 算出来的；不重置，收款后想再转更大金额会被旧上限拦住。
          setMaxTransferAmount(null);
          await refreshAll();
        }
      } catch (error) {
        throw error;
      }
    },
    [sendTransaction, refreshAll]
  );

  return (
    <>
      <div className="min-h-dvh bg-background">
        <div className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col border-border bg-card sm:border-x">
          <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h1 className="text-[15px] leading-5 text-foreground">
                {/* 品牌字标：BitSPV 600 + 产品名 400，同字号、不加分隔符、不用主题色。
                    点击回主站是品牌 header 的规则；离线单文件没有站点可回，故不挂链接。 */}
                {isOfflineBuild ? (
                  <>
                    <span className="font-semibold">BitSPV</span>{' '}
                    <span className="font-normal">Pay</span>
                  </>
                ) : (
                  <a
                    href="https://www.bitspv.com/"
                    className="transition-colors hover:text-primary"
                    title="BitSPV"
                  >
                    <span className="font-semibold">BitSPV</span>{' '}
                    <span className="font-normal">Pay</span>
                  </a>
                )}
              </h1>
              <p className="mt-0.5 text-[12px] leading-[17px] text-muted-foreground">
                {t('bsvPayment.tagline')}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowAboutModal(true)}
                title={t('paymentAbout.title')}
                aria-label={t('paymentAbout.title')}
                className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <Info className="h-5 w-5" />
              </button>
              <button
                onClick={() => setIsDonationModalVisible(true)}
                title={t('donation.title')}
                aria-label={t('donation.title')}
                className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <Coffee className="h-5 w-5" />
              </button>
              <button
                onClick={() => setShowHistoryModal(true)}
                title={t('transactionHistory.title')}
                aria-label={t('transactionHistory.title')}
                className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <History className="h-5 w-5" />
              </button>
              <button
                onClick={() => setShowSettingsModal(true)}
                title={t('bsvPayment.settings.title')}
                aria-label={t('bsvPayment.settings.title')}
                className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </header>

          <main className="flex-1 px-5 py-6">
            {(walletName || isWatchOnly) && (
              <div className="flex items-center justify-center gap-2 mb-3">
                {walletName && (
                  <span className="text-lg font-semibold text-foreground">{walletName}</span>
                )}
                {isWatchOnly && (
                  <span className="rounded border border-[var(--warn-border)] bg-[var(--warn-soft)] px-1.5 py-0.5 text-[11px] text-[var(--warn)]">
                    {t('bsvPayment.watchAddress.badge')}
                  </span>
                )}
              </div>
            )}

            {isWalletUiVisible ? (
              <>
                <WalletInfo
                  address={address}
                  isCopied={isCopied}
                  copyAddress={copyAddress}
                  walletBalance={walletBalance}
                  rate={rate}
                  refreshAll={refreshAll}
                  isRefreshing={isRefreshing}
                  isBalanceLoading={isBalanceLoading}
                  balanceError={balanceError}
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
                  onChangePassword={changeWalletPassword}
                  rate={rate}
                  onDeleteWallet={handleDeleteWallet}
                  onRequestCalculateMaxTransfer={handleRequestCalculateMax}
                  onRequestEstimateTransfer={estimateTransfer}
                  onTransferFunds={handleTransferFunds}
                  onRequestImportWallet={handleRequestImportWallet}
                  onOpenReceive={() => setShowReceiveModal(true)}
                  transferStatus={transferStatus}
                  transferMessage={transferMessage}
                  onClearTransferStatus={clearTransferStatus}
                />
              </>
            ) : viewState === 'recovery' ? (
              <div className="py-2">
                <div className="border-l-2 border-[var(--danger)] pl-3">
                  <p className="text-[12px] leading-[17px] text-muted-foreground">
                    {initError || t('bsvPayment.statusMessages.errors.walletRecoveryNeeded')}
                  </p>
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    onClick={handleRetryInit}
                    className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  >
                    {t('bsvPayment.pinModal.unlockButton')}
                  </button>
                  <button
                    onClick={handleRequestImportWallet}
                    className="w-full px-4 py-2 rounded-md border border-border bg-card text-foreground hover:bg-muted"
                  >
                    {t('bsvPayment.walletSetup.importButton')}
                  </button>
                </div>
              </div>
            ) : viewState === 'failed' ? (
              <div className="py-2">
                <div className="border-l-2 border-[var(--danger)] pl-3">
                  <p className="text-[12px] leading-[17px] text-muted-foreground">{initError}</p>
                </div>
                <button
                  onClick={handleRetryInit}
                  className="mt-4 w-full px-4 py-2 rounded-md border border-border bg-card text-foreground hover:bg-muted"
                >
                  {t('bsvPayment.walletSetup.retry')}
                </button>
              </div>
            ) : viewState === 'empty' ? (
              <div className="py-2">
                <h2 className="text-[15px] font-semibold text-foreground">
                  {t('bsvPayment.walletSetup.title')}
                </h2>
                <p className="mt-1 text-[12px] leading-[17px] text-muted-foreground">
                  {t('bsvPayment.walletSetup.prompt')}
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    onClick={handleCreateWallet}
                    className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  >
                    {t('bsvPayment.walletSetup.createButton')}
                  </button>
                  <button
                    onClick={handleRequestImportWallet}
                    className="w-full px-4 py-2 rounded-md border border-border bg-card text-foreground hover:bg-muted"
                  >
                    {t('bsvPayment.walletSetup.importButton')}
                  </button>
                  <button
                    onClick={handleWatchOnly}
                    className="w-full px-4 py-2 rounded-md border border-border bg-card text-foreground hover:bg-muted"
                  >
                    {t('bsvPayment.walletSetup.watchButton')}
                  </button>
                </div>

                {/* 冷存储是同一把钥匙的第二种用法，但它不属于这个网页：
                    只想离线保管的人应该拿到一个文件，而不是先被要求建个热钱包。 */}
                <div className="mt-5 border-t border-border pt-4">
                  <p className="text-[12px] font-medium text-foreground">
                    {t('bsvPayment.coldStorage.setupTitle')}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                    {t('bsvPayment.coldStorage.setupHint')}
                  </p>
                  <a
                    href={OFFLINE_RELEASE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-[12px] text-primary underline"
                  >
                    {t('bsvPayment.coldStorage.setupLink')} →
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-muted-foreground">
                  {t('bsvPayment.statusMessages.walletLoading')}
                </p>
              </div>
            )}
          </main>

          <footer className="border-t border-border px-5 py-4">
            <p className="text-center text-[11px] leading-4 text-muted-foreground">
              {t('bsvPayment.trustLine')}
            </p>
            <div className="mt-3 flex items-center justify-center gap-4 text-[12px] text-muted-foreground">
              <a
                href="https://github.com/cyio/bitspv-pay"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:opacity-70"
                title={t('bsvPayment.footer.sourceCode')}
                aria-label={t('bsvPayment.footer.sourceCode')}
              >
                <svg
                  role="img"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  className="inline-block h-6 w-6 fill-current"
                >
                  <title>GitHub</title>
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.228 0 1.605-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297 24 5.67 18.63 0 12 0z" />
                </svg>
              </a>
              <a
                href={OFFLINE_RELEASE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground hover:underline"
                title={t('bsvPayment.footer.offlineBuild')}
              >
                {t('bsvPayment.coldStorage.footer')}
              </a>
              <span>v{appVersion}</span>
            </div>
          </footer>
          <Dialog
            open={showHistoryModal}
            onOpenChange={open => !open && setShowHistoryModal(false)}
          >
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>{t('transactionHistory.title')}</DialogTitle>
              </DialogHeader>
              <TransactionHistory address={address} pubKey={pubKey} />
            </DialogContent>
          </Dialog>

          <PaymentAbout show={showAboutModal} onClose={() => setShowAboutModal(false)} />

          <Dialog open={showImportModal} onOpenChange={(open) => !isImporting && setShowImportModal(open)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{t('bsvPayment.importDialog.title')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t('bsvPayment.importDialog.description')}</p>
                <textarea
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    if (importError) setImportError('');
                  }}
                  aria-label={t('bsvPayment.importDialog.placeholder')}
                  aria-invalid={importError ? 'true' : undefined}
                  placeholder={t('bsvPayment.importDialog.placeholder')}
                  className="min-h-[140px] w-full rounded-[var(--radius)] border border-input bg-transparent px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
                {importError && <p className="text-sm text-destructive">{importError}</p>}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                  <button
                    type="button"
                    onClick={handleChooseImportFile}
                    disabled={isImporting}
                    className="inline-flex items-center justify-center rounded-[var(--radius)] border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                  >
                    {t('bsvPayment.importDialog.chooseFile')}
                  </button>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => setShowImportModal(false)}
                      disabled={isImporting}
                      className="inline-flex items-center justify-center rounded-[var(--radius)] border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                    >
                      {t('bsvPayment.cancelButton')}
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitImportText}
                      disabled={isImporting}
                      className="inline-flex items-center justify-center rounded-[var(--radius)] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                    >
                      {isImporting ? t('bsvPayment.processingButton') : t('bsvPayment.importDialog.importButton')}
                    </button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <ReceiveModal
            open={showReceiveModal}
            onClose={() => setShowReceiveModal(false)}
            address={address}
            qrcode={qrcode}
          />

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

          <input
            type="file"
            ref={importFileInput}
            onChange={handleFileChange}
            accept="image/*,.bsv,.json,.txt"
            style={{ display: 'none' }}
          />
        </div>
      </div>
      <DebugConsole />
    </>
  );
}

// This component sets up the PinPrompt context and renders the main UI.
export default function Payment() {
  const { t } = useTranslation();
  const [pinState, setPinState] = useState({ isOpen: false });

  const handlePinResolve = useCallback(
    value => {
      if (pinState.onResolve) {
        pinState.onResolve(value);
      }
      setPinState({ isOpen: false });
    },
    [pinState.onResolve]
  );

  const handlePinReject = useCallback(() => {
    if (pinState.onReject) {
      // Pass a special value to indicate cancellation, avoiding an Error object
      // which might trigger unwanted notifications.
      pinState.onReject({ cancelled: true });
    }
    setPinState({ isOpen: false });
  }, [pinState.onReject]);

  const showInfo = useCallback(
    (title, message) => {
      return new Promise(resolve => {
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
          onReject: () => {
            // Should not happen for info
            setPinState({ isOpen: false });
            resolve();
          },
        });
      });
    },
    [t, handlePinResolve]
  );

  const promptForPin = useCallback(
    (mode, options = {}) => {
      return new Promise((resolve, reject) => {
        let config = {};
        const defaultWalletName = t('bsvPayment.pinModal.defaultWalletName');

        // 浏览器密码库的键是 (origin, username)，路径不参与。把一个只读的
        // autocomplete="username" 地址栏塞进表单，同一个 origin 下的每个钱包地址
        // 就各存一条密码，删了再导入也不会互相覆盖。
        const addressInput = options.walletAddress
          ? [
              {
                id: 'username',
                htmlName: 'username',
                label: t('bsvPayment.pinModal.walletAddressLabel'),
                type: 'text',
                readOnly: true,
                autoComplete: 'username',
                defaultValue: options.walletAddress,
                hintMessage: t('bsvPayment.pinModal.walletAddressHint'),
              },
            ]
          : [];

        if (mode === 'set') {
          config = {
            mode: 'set',
            title: t('bsvPayment.pinModal.setTitle'),
            inputs: [
              ...addressInput,
              // 钱包名单独标成 off：否则浏览器会把它当用户名，地址栏就白加了。
              {
                id: 'walletName',
                htmlName: 'walletName',
                autoComplete: 'off',
                label: t('bsvPayment.pinModal.walletNamePrompt'),
                type: 'text',
                placeholder: t('bsvPayment.pinModal.walletNamePlaceholder'),
                defaultValue: defaultWalletName,
                maxLength: 20,
              },
              // 这里故意用 current-password 而不是 new-password：后者会让 Chrome
              // 推荐一个随机强密码，用户看不见它，备份 QR 就变成只有这台浏览器能解。
              {
                id: 'pin',
                htmlName: 'password',
                autoComplete: 'current-password',
                label: t('bsvPayment.pinModal.setPrompt'),
                type: 'password',
                placeholder: t('bsvPayment.pinModal.pinInputPlaceholder'),
                required: true,
                maxLength: 20,
                minLength: 8,
                showStrength: true,
                hintMessage: t('bsvPayment.pinModal.pinHintForSet'),
              },
              // 二次输入：PIN 只存在于用户脑子里，输错一个字符就等于把钱包（以及同 PIN
              // 加密的备份文件）永久锁死。这一栏是唯一能在资金不可用之前发现笔误的地方。
              {
                id: 'pinConfirm',
                htmlName: 'pinConfirm',
                autoComplete: 'off',
                label: t('bsvPayment.pinModal.pinConfirmPrompt'),
                type: 'password',
                placeholder: t('bsvPayment.pinModal.pinInputPlaceholder'),
                required: true,
                maxLength: 20,
                validate: (v, allValues) =>
                  v === allValues?.pin || t('bsvPayment.pinModal.validation.pinMismatch'),
              },
            ],
            confirmButtonText: t('bsvPayment.pinModal.setButton'),
            cancelButtonText: t('bsvPayment.pinModal.cancelButton'),
            // 密钥还没落盘，取消是安全的：生成的密钥直接丢弃，回到空态。
            showCancelButton: true,
            hideModalHeaderCloseButton: false,
          };
        } else if (mode === 'confirm') {
          config = {
            mode: 'confirm',
            title: t('bsvPayment.pinModal.confirmTitle'),
            inputs: [
              {
                id: 'pin',
                label: t('bsvPayment.pinModal.confirmPrompt'),
                type: 'password',
                placeholder: t('bsvPayment.pinModal.pinInputPlaceholder'),
                required: true,
              },
            ],
            confirmButtonText: t('bsvPayment.pinModal.confirmButton'),
            showCancelButton: false,
            hideModalHeaderCloseButton: true,
          };
        } else if (mode === 'change-password') {
          // 只换信封，不动私钥和地址。旧密码在上一屏已经验过了。
          config = {
            mode: 'change-password',
            title: t('bsvPayment.pinModal.changeTitle'),
            message: t('bsvPayment.pinModal.changeMessage'),
            inputs: [
              ...addressInput,
              {
                id: 'pin',
                htmlName: 'password',
                autoComplete: 'current-password',
                label: t('bsvPayment.pinModal.changePrompt'),
                type: 'password',
                placeholder: t('bsvPayment.pinModal.pinInputPlaceholder'),
                required: true,
                maxLength: 20,
                minLength: 8,
                showStrength: true,
                hintMessage: t('bsvPayment.pinModal.pinHintForSet'),
              },
              {
                id: 'pinConfirm',
                htmlName: 'pinConfirm',
                autoComplete: 'off',
                label: t('bsvPayment.pinModal.pinConfirmPrompt'),
                type: 'password',
                placeholder: t('bsvPayment.pinModal.pinInputPlaceholder'),
                required: true,
                maxLength: 20,
                validate: (v, allValues) =>
                  v === allValues?.pin || t('bsvPayment.pinModal.validation.pinMismatch'),
              },
            ],
            confirmButtonText: t('bsvPayment.pinModal.changeButton'),
            cancelButtonText: t('bsvPayment.pinModal.cancelButton'),
            showCancelButton: true,
            hideModalHeaderCloseButton: false,
          };
        } else {
          // unlock
          config = {
            mode: 'unlock',
            title: t('bsvPayment.pinModal.unlockTitle'),
            inputs: [
              ...addressInput,
              {
                id: 'pin',
                htmlName: 'password',
                autoComplete: 'current-password',
                label: t('bsvPayment.pinModal.unlockPrompt'),
                type: 'password',
                placeholder: t('bsvPayment.pinModal.pinInputPlaceholder'),
                required: true,
              },
            ],
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
            inputs: [
              {
                id: 'pin',
                htmlName: 'watchAddress',
                autoComplete: 'off',
                label: t('bsvPayment.watchAddress.addressLabel'),
                type: 'text',
                placeholder: t('bsvPayment.watchAddress.placeholder'),
                required: true,
                // 观察地址只用来查余额/历史。不校验就会把任意字符串存下来，
                // 之后余额请求失败，界面却只显示 0.
                validate: v =>
                  isValidAddress(String(v || '').trim()) ||
                  t('bsvPayment.statusMessages.errors.invalidAddress'),
              },
            ],
            confirmButtonText: t('bsvPayment.watchAddress.confirmButton'),
            cancelButtonText: t('bsvPayment.pinModal.cancelButton'),
            showCancelButton: true,
            hideModalHeaderCloseButton: false,
          };
        }

        setPinState({
          ...config,
          ...options,
          onImport: options.onImport
            ? () => {
                if (options.onImport) options.onImport();
                reject({ importRequested: true });
                setPinState({ isOpen: false });
              }
            : undefined,
          isOpen: true,
          onResolve: resolve,
          onReject: reject,
        });
      });
    },
    [t]
  );

  const contextValue = useMemo(
    () => ({
      promptForPin,
      showInfo,
    }),
    [promptForPin, showInfo]
  );

  return (
    <PinPromptContext.Provider value={contextValue}>
      <WalletUI />
      <PinDialog pinState={pinState} onResolve={handlePinResolve} onReject={handlePinReject} />
    </PinPromptContext.Provider>
  );
}
