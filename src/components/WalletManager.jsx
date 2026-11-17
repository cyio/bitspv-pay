import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, QrCode } from 'lucide-react';
import { isWeChat } from '../utils';
import { copyText } from '../utils/clipboard';
import {
  generateEncryptedDataQrCodeUrl,
  downloadEncryptedDataQrCode,
} from '../utils/bsv';
import { useDialog } from '../contexts/DialogContext';
import { AirGapSender, AirGapSigner } from './AirGapFlow';
import SendPanel from './SendPanel';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';


const WalletManager = ({
  address,
  pubKey,
  isWatchOnly = false,
  utxos = [],
  ensurePrivateKeyLoaded,
  maxTransferAmountValue,
  isWalletMode = true,
  getWifForBackup,
  onChangePassword,
  rate,
  onDeleteWallet,
  onRequestCalculateMaxTransfer,
  onRequestEstimateTransfer,
  onTransferFunds,
  onRequestImportWallet,
  onOpenReceive,
  transferStatus,
  transferMessage,
  onClearTransferStatus,
}) => {
  const { t } = useTranslation();
  const { showDialog } = useDialog();

  const [showManageSheet, setShowManageSheet] = useState(false);
  const [showSendPanel, setShowSendPanel] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [privateKeyQrCodeUrl, setPrivateKeyQrCodeUrl] = useState('');
  const [activeBackupData, setActiveBackupData] = useState(null);
  const [showPubKeyModal, setShowPubKeyModal] = useState(false);
  const [isPubKeyCopied, setIsPubKeyCopied] = useState(false);
  const [pubKeyCopyError, setPubKeyCopyError] = useState('');

  // air-gap 模式：'sender' | 'signer' | null
  const [airGapMode, setAirGapMode] = useState(null);

  const pubKeyHex = useMemo(() => {
    try {
      return pubKey ? pubKey.toDER('hex') : '';
    } catch {
      return '';
    }
  }, [pubKey]);

  const openPubKeyModal = () => {
    setIsPubKeyCopied(false);
    setPubKeyCopyError('');
    setShowPubKeyModal(true);
  };

  const copyPublicKey = async () => {
    const copied = await copyText(pubKeyHex);
    if (copied) {
      setIsPubKeyCopied(true);
      setPubKeyCopyError('');
      setTimeout(() => setIsPubKeyCopied(false), 2000);
    } else {
      setPubKeyCopyError(t('bsvPayment.publicKeyCopyFailed'));
    }
  };

  const pendingActionRef = useRef(null);

  useEffect(() => {
    if (!showManageSheet && pendingActionRef.current) {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      const timer = setTimeout(action, 50);
      return () => clearTimeout(timer);
    }
  }, [showManageSheet]);

  const closeSheetAndRun = (fn) => () => {
    pendingActionRef.current = fn;
    setShowManageSheet(false);
  };

  const openAirGap = (mode) => {
    resetPanels();
    setAirGapMode(mode);
  };

  const resetPanels = () => {
    setShowQrModal(false);
    setPrivateKeyQrCodeUrl('');
    setActiveBackupData(null);
    setAirGapMode(null);
    if (transferStatus) onClearTransferStatus();
  };

  const showBackup = async () => {
    resetPanels();
    let backupData = null;
    if (getWifForBackup) {
      backupData = await getWifForBackup();
      if (!backupData) return;
    }

    setActiveBackupData(backupData);

    const confirmed = await showDialog({
      title: t('bsvPayment.backupPlaceholderWarningTitle'),
      message: t('bsvPayment.backupPlaceholderWarningText'),
      confirmText: t('bsvPayment.showQrCodeButton'),
      cancelText: t('bsvPayment.cancelButton'),
    });

    if (confirmed) {
      displayQrCodeModal(backupData);
    } else {
      setActiveBackupData(null);
    }
  };
  
  const displayQrCodeModal = async (backupDataForQr) => {
    if (backupDataForQr && backupDataForQr.encryptedWif) {
      setPrivateKeyQrCodeUrl(await generateEncryptedDataQrCodeUrl(backupDataForQr, backupDataForQr.address));
    } else {
      setPrivateKeyQrCodeUrl('');
      console.warn('WalletManager: displayQrCodeModal called with incomplete backup data.');
    }
    setShowQrModal(true);
  };

  const downloadPrivateKeyQrCode = async () => {
    if (activeBackupData && activeBackupData.encryptedWif && address) {
      await downloadEncryptedDataQrCode(activeBackupData, address);
    } else {
      console.error('Encrypted backup data or address is not available for QR code download.');
      await showDialog({
        title: t('bsvPayment.privateKeyQrModalTitle'),
        message: t('bsvPayment.statusMessages.errors.privateKeyNotAvailableForDownload'),
        confirmText: t('dialog.gotIt'),
        showCancel: false,
      });
    }
  };

  useEffect(() => {
    if (!showQrModal) {
      setActiveBackupData(null);
      setPrivateKeyQrCodeUrl('');
    }
  }, [showQrModal]);

  const triggerImportWallet = async () => {
    resetPanels();
    if (address) {
      const confirmed = await showDialog({
        title: t('bsvPayment.importConfirmation.title'),
        message: t('bsvPayment.importConfirmation.message'),
        confirmText: t('bsvPayment.importConfirmation.confirmButton'),
        cancelText: t('bsvPayment.importConfirmation.cancelButton')
      });
      if (!confirmed) {
        await showDialog({
          title: t('bsvPayment.importDialog.title'),
          message: t('bsvPayment.statusMessages.info.importCancelled'),
          confirmText: t('dialog.gotIt'),
          showCancel: false,
        });
        return;
      }
    }
    onRequestImportWallet();
  };

  const showDeleteWalletConfirm = async () => {
    resetPanels();
    const confirmed = await showDialog({
      title: t('bsvPayment.deleteWalletTitle'),
      message: t('bsvPayment.deleteWalletWarning'),
      confirmText: t('bsvPayment.confirmDeleteButton'),
      cancelText: t('bsvPayment.cancelButton'),
    });
    if (confirmed) {
      onDeleteWallet();
    }
  };

  const handleAirGapDone = useCallback(() => {
    console.log('[DEBUG] AirGapSender onDone called');
    setAirGapMode(null);
  }, []);

  const handleAirGapCancel = useCallback(() => {
    console.log('[DEBUG] AirGapSender onCancel called');
    setAirGapMode(null);
  }, []);

  const airGapSheetTitle = airGapMode === 'sender'
    ? t('bsvPayment.airGap.transferOffline')
    : t('bsvPayment.airGap.signerButton');

  if (!isWalletMode) return null;

  return (
    <div className="relative mt-4">
      {/* ── 收款与转账并列为两个主操作；观察模式下转账换成离线签名 ── */}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onOpenReceive} disabled={!onOpenReceive}>
          <QrCode className="h-4 w-4" />
          {t('bsvPayment.receive.button')}
        </Button>
        {isWatchOnly ? (
          <Button className="flex-1" onClick={() => openAirGap('sender')}>
            {t('bsvPayment.airGap.transferOffline')}
          </Button>
        ) : (
          <Button className="flex-1" onClick={() => setShowSendPanel(true)}>
            {t('bsvPayment.transfer.transferButton')}
          </Button>
        )}
      </div>

      <Button
        onClick={() => setShowManageSheet(true)}
        variant="outline"
        className="w-full mt-2"
      >
        {t('bsvPayment.manageWalletButton')}
      </Button>

      <Sheet open={showManageSheet} onOpenChange={setShowManageSheet}>
        <SheetContent
          animated={false}
          side="bottom"
          className="left-1/2 right-auto w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-[var(--radius)] pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[85dvh]"
        >
          <SheetHeader className="mb-4">
            <SheetTitle>{t('bsvPayment.manageWalletButton')}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              onClick={closeSheetAndRun(openPubKeyModal)}
              variant="outline"
              disabled={isWatchOnly || !pubKeyHex}
              title={isWatchOnly ? t('bsvPayment.publicKeyUnavailable') : ''}
            >
              {t('bsvPayment.viewPublicKeyButton')}
            </Button>
            <Button
              onClick={closeSheetAndRun(showBackup)}
              variant="outline"
              disabled={isWatchOnly}
              title={isWatchOnly ? t('bsvPayment.airGap.watchOnlyNoKey') : ''}
            >
              {t('bsvPayment.backupWalletButton')}
            </Button>
            <Button
              onClick={closeSheetAndRun(onChangePassword)}
              variant="outline"
              disabled={isWatchOnly || !onChangePassword}
              title={isWatchOnly ? t('bsvPayment.airGap.watchOnlyNoKey') : ''}
            >
              {t('bsvPayment.changePasswordButton')}
            </Button>
            <Button onClick={closeSheetAndRun(triggerImportWallet)} variant="outline">{t('bsvPayment.importWalletButton')}</Button>
            <Button
              variant="outline"
              onClick={closeSheetAndRun(() => openAirGap('signer'))}
              disabled={isWatchOnly}
              title={isWatchOnly ? t('bsvPayment.airGap.watchOnlyNoKey') : ''}
            >
              {t('bsvPayment.airGap.signerButton')}
            </Button>
            <Button onClick={closeSheetAndRun(showDeleteWalletConfirm)} variant="destructive">{t('bsvPayment.deleteWalletButton')}</Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={Boolean(airGapMode)}
        onOpenChange={(open) => {
          if (!open) handleAirGapCancel();
        }}
      >
        <SheetContent
          animated={false}
          side="bottom"
          className="left-1/2 right-auto w-full max-w-md -translate-x-1/2 overflow-y-auto rounded-t-[var(--radius)] pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[85dvh]"
        >
          <SheetHeader className="mb-4">
            <SheetTitle>{airGapSheetTitle}</SheetTitle>
          </SheetHeader>
          {airGapMode === 'sender' && (
            <AirGapSender
              address={address}
              rate={rate}
              utxos={utxos}
              onDone={handleAirGapDone}
              onCancel={handleAirGapCancel}
              className="pt-1"
            />
          )}
          {airGapMode === 'signer' && (
            <AirGapSigner
              address={address}
              ensurePrivateKeyLoaded={ensurePrivateKeyLoaded}
              pubKey={pubKey}
              onCancel={handleAirGapCancel}
              className="pt-1"
            />
          )}
        </SheetContent>
      </Sheet>

      <Dialog
        open={showPubKeyModal}
        onOpenChange={(open) => {
          setShowPubKeyModal(open);
          if (!open) {
            setIsPubKeyCopied(false);
            setPubKeyCopyError('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('bsvPayment.publicKeyModalTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded bg-muted p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 select-all break-all font-mono text-sm">{pubKeyHex}</div>
                <button
                  onClick={copyPublicKey}
                  title={isPubKeyCopied ? t('bsvPayment.publicKeyCopied') : t('bsvPayment.copyButton')}
                  aria-label={isPubKeyCopied ? t('bsvPayment.publicKeyCopied') : t('bsvPayment.copyButton')}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] transition-colors hover:bg-background/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {isPubKeyCopied ? <Check size={16} className="text-primary" /> : <Copy size={16} />}
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t('bsvPayment.publicKeyFormat')}
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {t('bsvPayment.publicKeyAddressLabel')}
              </p>
              <p className="break-all font-mono text-sm">{address}</p>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              {t('bsvPayment.publicKeyDescription')}
            </DialogDescription>
            {pubKeyCopyError && (
              <p className="text-xs text-[var(--danger)]">{pubKeyCopyError}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showQrModal} onOpenChange={setShowQrModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('bsvPayment.privateKeyQrModalTitle')}</DialogTitle>
          </DialogHeader>
          <div className="p-4 text-center">
            {privateKeyQrCodeUrl ? (
              <img
                src={privateKeyQrCodeUrl}
                alt={t('bsvPayment.privateKeyQrModalTitle')}
                className="mx-auto my-4 h-48 w-48 rounded-[var(--radius)] border border-border bg-white p-2"
              />
            ) : (
              <div className="mx-auto my-4 flex h-48 w-48 items-center justify-center rounded-[var(--radius)] bg-muted text-xs text-muted-foreground">
                {t('bsvPayment.qrLoading')}
              </div>
            )}
            {!isWeChat && (
              <p className="mt-1 text-xs text-muted-foreground">{t('bsvPayment.qrCodeDownloadTip')}</p>
            )}
            <p className="mt-2 text-xs text-[var(--danger)]">{t('bsvPayment.privateKeyWarning')}</p>
          </div>
          <DialogFooter>
            {!isWeChat && (
              <Button onClick={downloadPrivateKeyQrCode} className="w-full">
                {t('bsvPayment.downloadQrCodeButton')}
              </Button>
            )}
            {isWeChat && (
              <p className="w-full py-2 text-center text-sm font-medium text-primary">
                {t('bsvPayment.qrCodeSaveTipWeChat')}
              </p>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showSendPanel && (
        <SendPanel
          onClose={() => setShowSendPanel(false)}
          rate={rate}
          maxTransferAmountValue={maxTransferAmountValue}
          onRequestCalculateMaxTransfer={onRequestCalculateMaxTransfer}
          onRequestEstimateTransfer={onRequestEstimateTransfer}
          onTransferFunds={onTransferFunds}
          transferStatus={transferStatus}
          transferMessage={transferMessage}
          onClearTransferStatus={onClearTransferStatus}
        />
      )}
    </div>
  );
};

export default WalletManager;
