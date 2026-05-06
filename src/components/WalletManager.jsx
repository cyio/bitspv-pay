
import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { isWeChat } from '../utils';
import {
  isValidAddress,
  convertSatoshisToBSV,
  isValidPaymail,
  generateEncryptedDataQrCodeUrl,
  downloadEncryptedDataQrCode,
  convertSatoshisToFiat,
  convertFiatToSatoshis,
} from '../utils/bsv';
import { useDialog } from '../contexts/DialogContext';
import QRScanner from './QRScanner';
import { AirGapSender, AirGapSigner } from './AirGapFlow';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SimpleSelect, SimpleSelectItem } from '@/components/ui/SimpleSelect';


const ScanIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const ChevronDownIcon = ({ rotation }) => (
  <svg
    className={`w-4 h-4 transition-transform ${rotation}`}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
  </svg>
);


const WalletManager = ({
  address,
  pubKey,
  isWatchOnly = false,
  utxos = [],
  ensurePrivateKeyLoaded,
  maxTransferAmountValue,
  isWalletMode = true,
  getWifForBackup,
  rate,
  onDeleteWallet,
  onRequestCalculateMaxTransfer,
  onTransferFunds,
  onRequestImportWallet,
  transferStatus,
  transferMessage,
  onClearTransferStatus,
}) => {
  const { t } = useTranslation();
  const { showDialog } = useDialog();

  const [showManagePanel, setShowManagePanel] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [privateKeyQrCodeUrl, setPrivateKeyQrCodeUrl] = useState('');
  const [showTransferSection, setShowTransferSection] = useState(false);
  const [activeBackupData, setActiveBackupData] = useState(null);
  const [targetAddress, setTargetAddress] = useState('');
  const [formError, setFormError] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('BSV');
  const [inputAmount, setInputAmount] = useState('');

  // air-gap 模式：'sender' | 'signer' | null
  const [airGapMode, setAirGapMode] = useState(null);
  
  const transferAmountSatoshis = useMemo(() => {
    if (inputAmount === '') return null;
    const amount = Number(inputAmount);
    if (isNaN(amount)) return null;

    switch (selectedUnit) {
      case 'BSV':
        return Math.round(amount * 100000000);
      case 'sats':
        return Math.round(amount);
      case 'USD':
        return rate ? convertFiatToSatoshis(amount, rate) : null;
      default:
        return null;
    }
  }, [inputAmount, selectedUnit, rate]);

  const setSatoshiValue = (satoshiValue) => {
    if (satoshiValue === null) {
      setInputAmount('');
      return;
    }
    let valueToSet;
    switch (selectedUnit) {
      case 'BSV':
        valueToSet = convertSatoshisToBSV(satoshiValue);
        break;
      case 'sats':
        valueToSet = satoshiValue;
        break;
      case 'USD':
        valueToSet = rate ? convertSatoshisToFiat(satoshiValue, rate) : '';
        break;
      default:
        valueToSet = '';
    }
    setInputAmount(valueToSet.toString());
  };

  useEffect(() => {
    if (transferAmountSatoshis !== null) {
      setSatoshiValue(transferAmountSatoshis);
    }
  }, [selectedUnit]);
  const handleScanResult = (result) => {
    if (result.error) {
      setFormError(result.error);
    } else if (result.data) {
      setTargetAddress(result.data);
      setFormError('');
      if (transferStatus) onClearTransferStatus();
    } else {
      setFormError(t('bsvPayment.statusMessages.errors.invalidQRCode'));
    }
  };

  const resetPanels = () => {
    setShowQrModal(false);
    setPrivateKeyQrCodeUrl('');
    setActiveBackupData(null);
    setShowTransferSection(false);
    setAirGapMode(null);
    setFormError('');
    if (transferStatus) onClearTransferStatus();
  };

  const toggleManagePanel = () => {
    setShowManagePanel(!showManagePanel);
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
      setFormError(t('bsvPayment.statusMessages.errors.privateKeyNotAvailableForDownload'));
    }
  };

  useEffect(() => {
    if (!showQrModal) {
      setActiveBackupData(null);
      setPrivateKeyQrCodeUrl('');
    }
  }, [showQrModal]);

  const toggleTransferSection = () => {
    if (showTransferSection) {
      setShowTransferSection(false);
      return;
    }
    resetPanels();
    setShowTransferSection(true);
    setInputAmount('');
    onRequestCalculateMaxTransfer();
  };

  const setAmountToMax = () => {
    if (maxTransferAmountValue !== null) {
      if (selectedUnit === 'USD') {
        // To avoid floating point inaccuracies with fiat conversion,
        // switch to BSV unit when setting the max amount from USD.
        setSelectedUnit('BSV');
        setInputAmount(convertSatoshisToBSV(maxTransferAmountValue).toString());
      } else {
        setSatoshiValue(maxTransferAmountValue);
      }
    }
  };

  const executeTransfer = async () => {
    setFormError('');
    if (transferStatus) onClearTransferStatus();

    if (maxTransferAmountValue === null) {
      setFormError(`${t('bsvPayment.transfer.calculating')}...`);
      return;
    }
    if (!targetAddress || (!isValidAddress(targetAddress) && !isValidPaymail(targetAddress))) {
      setFormError(t('bsvPayment.statusMessages.errors.invalidTargetAddress'));
      return;
    }
    const amount = transferAmountSatoshis;
    if (!amount || amount <= 0) {
      setFormError(t('bsvPayment.transfer.errors.invalidAmount'));
      return;
    }
    if (amount > maxTransferAmountValue) {
      setFormError(t('bsvPayment.transfer.errors.amountExceedsMax'));
      return;
    }

    try {
      await onTransferFunds(targetAddress, amount);
      // On success, the status will be updated by useWallet, and we can clear the form.
      setTargetAddress('');
      setInputAmount('');
    } catch (error) {
      // Errors, including cancellation, are caught here.
      // useWallet is already handling the state change for real errors.
      // If it's a cancellation, we do nothing to avoid showing an error.
      if (error && error.cancelled) {
        console.log('Transfer cancelled by user at PIN prompt.');
      } else {
        // For any other error, useWallet has already set the error state.
        // We just log it here for debugging.
        console.error('Failed to execute transfer:', error);
      }
    }
  };

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
        setFormError(t('bsvPayment.statusMessages.info.importCancelled'));
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

  const displayMessage = transferMessage || formError;
  const displayStatus = transferStatus || (formError ? 'error' : null);
  
  const getTransferStatusClass = (status) => {
    switch (status) {
      case 'processing':
        return 'text-blue-600 dark:text-blue-300';
      case 'completed':
        return 'text-green-600 dark:text-green-300';
      case 'error':
        return 'text-red-600 dark:text-red-300';
      default:
        return '';
    }
  };

  if (!isWalletMode) return null;

  return (
    <div className="relative mt-4">
      {/* ── 观察模式：替换转账按钮 ── */}
      {isWatchOnly ? (
        <>
          <Button
            onClick={() => { resetPanels(); setAirGapMode('sender'); }}
            className="w-full"
          >
            {t('bsvPayment.airGap.transferOffline')}
          </Button>
          {airGapMode === 'sender' && (
            <AirGapSender
              address={address}
              rate={rate}
              utxos={utxos}
              onDone={() => setAirGapMode(null)}
              onCancel={() => setAirGapMode(null)}
            />
          )}
        </>
      ) : (
        <>
          <Button onClick={toggleTransferSection} className="w-full">
            {t('bsvPayment.transfer.transferButton')}
          </Button>

          {airGapMode === 'signer' && (
            <AirGapSigner
              ensurePrivateKeyLoaded={ensurePrivateKeyLoaded}
              pubKey={pubKey}
              onCancel={() => setAirGapMode(null)}
            />
          )}
        </>
      )}

      {showTransferSection && (
        <div className="mt-4 px-2 py-4 bg-gray-100 dark:bg-gray-700 rounded">
          <h2 className="text-lg font-semibold mb-3">{t('bsvPayment.transfer.transferTitle')}</h2>
          <div className="mb-3">
            <label htmlFor="targetAddress" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('bsvPayment.transfer.targetAddressLabel')}
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                id="targetAddress"
                value={targetAddress}
                onChange={(e) => {
                  setTargetAddress(e.target.value);
                  setFormError('');
                  if (transferStatus) onClearTransferStatus();
                }}
                placeholder={t('bsvPayment.transfer.targetAddressPlaceholder')}
              />
              <QRScanner onScanResult={handleScanResult}>
                {({ scan }) => (
                  <Button onClick={scan} size="icon" variant="outline" title={t('bsvPayment.scanButton')}>
                    <ScanIcon />
                  </Button>
                )}
              </QRScanner>
            </div>
          </div>
          <div className="mb-3">
            <label htmlFor="transferAmount" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('bsvPayment.transfer.transferAmountLabel')}
            </label>
            <div className="flex items-center gap-2">
            <Input
              type="number"
              id="transferAmount"
              value={inputAmount}
              onChange={(e) => {
                setInputAmount(e.target.value);
                setFormError('');
                if (transferStatus) onClearTransferStatus();
              }}
              placeholder={t('bsvPayment.transfer.transferAmountPlaceholder')}
              autoComplete="off"
              step="any"
            />
            <SimpleSelect value={selectedUnit} onValueChange={setSelectedUnit} className="w-[100px]">
              <SimpleSelectItem value="BSV">BSV</SimpleSelectItem>
              <SimpleSelectItem value="sats">sats</SimpleSelectItem>
              {rate && <SimpleSelectItem value="USD">USD</SimpleSelectItem>}
            </SimpleSelect>
            </div>
            <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              {maxTransferAmountValue !== null ? (
                <>
                  {t('bsvPayment.transfer.maxLabel')}:
                  <Button onClick={setAmountToMax} variant="link" className="p-0 h-auto">
                    {selectedUnit === 'BSV' && `${convertSatoshisToBSV(maxTransferAmountValue)} BSV`}
                    {selectedUnit === 'sats' && `${maxTransferAmountValue} sats`}
                    {selectedUnit === 'USD' && rate && `$${convertSatoshisToFiat(maxTransferAmountValue, rate)}`}
                  </Button>
                </>
              ) : (
                `${t('bsvPayment.transfer.calculating')}...`
              )}
            </div>
          </div>
          {displayStatus && (
            <div className={`mb-3 text-sm break-words ${getTransferStatusClass(displayStatus)}`}>
              {typeof displayMessage === 'object' ? (
                <>
                  {displayMessage.text}{' '}
                  {displayMessage.linkUrl && (
                    <a
                      href={displayMessage.linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {displayMessage.linkText}
                    </a>
                  )}
                </>
              ) : (
                <span>{displayMessage}</span>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={toggleTransferSection} variant="outline">
              {t('bsvPayment.cancelButton')}
            </Button>
            <Button
              onClick={executeTransfer}
              disabled={transferStatus === 'processing'}
            >
              {transferStatus === 'processing' ? t('bsvPayment.processingButton') : t('bsvPayment.confirmTransferButton')}
            </Button>
          </div>
        </div>
      )}

      <Button
        onClick={toggleManagePanel}
        variant="outline"
        className="w-full mt-2 flex items-center justify-center gap-2"
      >
        <span>{t('bsvPayment.manageWalletButton')}</span>
        <ChevronDownIcon rotation={showManagePanel ? 'rotate-180' : ''} />
      </Button>

      {showManagePanel && (
        <div className="mt-2 py-4 px-1 bg-gray-50 dark:bg-gray-700 rounded shadow-lg">
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={showBackup} variant="outline">{t('bsvPayment.backupWalletButton')}</Button>
            <Button onClick={triggerImportWallet} variant="outline">{t('bsvPayment.importWalletButton')}</Button>
            <Button
              variant="outline"
              onClick={() => { resetPanels(); setShowManagePanel(false); setAirGapMode('signer'); }}
              disabled={isWatchOnly}
              title={isWatchOnly ? t('bsvPayment.airGap.watchOnlyNoKey') : ''}
            >
              {t('bsvPayment.airGap.signerButton')}
            </Button>
            <Button onClick={showDeleteWalletConfirm} variant="destructive">{t('bsvPayment.deleteWalletButton')}</Button>
          </div>
            <Dialog open={showQrModal} onOpenChange={setShowQrModal}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('bsvPayment.privateKeyQrModalTitle')}</DialogTitle>
                </DialogHeader>
                <div className="p-4 text-center">
                  {privateKeyQrCodeUrl ? (
                    <img src={privateKeyQrCodeUrl} alt="Private Key QR Code" className="w-48 h-48 mx-auto my-4" />
                  ) : (
                    <div className="w-48 h-48 bg-gray-200 dark:bg-gray-600 mx-auto my-4 flex items-center justify-center text-xs text-gray-500 dark:text-gray-300">
                      {t('bsvPayment.qrLoading')}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('bsvPayment.qrCodeDownloadTip')}</p>
                  <p className="mt-2 text-xs text-red-500 dark:text-red-400">{t('bsvPayment.privateKeyWarning')}</p>
                </div>
                <DialogFooter>
                  {!isWeChat && (
                    <Button onClick={downloadPrivateKeyQrCode} className="w-full">
                      {t('bsvPayment.downloadQrCodeButton')}
                    </Button>
                  )}
                  {isWeChat && (
                    <p className="w-full text-center text-sm font-medium text-blue-600 dark:text-blue-400 py-2">
                       {t('bsvPayment.qrCodeDownloadTip')}
                    </p>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
        </div>
      )}
    </div>
  );
};

export default WalletManager;
