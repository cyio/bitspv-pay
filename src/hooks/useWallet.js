import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { PrivateKey, PublicKey, Transaction, Script } from '@bsv/sdk';
import QRCode from 'qrcode';
import { useStorage } from './useStorage';
import { getBalance, getUTXOs } from '../utils/api';
import { isWeChat } from '../utils';
import { encryptData, decryptData } from '../utils/webauthn';
import { usePinManager } from './usePinManager';
import { processRefund } from '../utils/transaction';
import { isValidAddress, isValidPaymail } from '../utils/bsv';

export function useWallet() {
  const { t } = useTranslation();
  const storage = useStorage();
  const { promptForPin, showInfo, ensurePrivateKeyLoaded, autoBackupPrivateKeyToFile, generateEncryptedBackupData } = usePinManager();

  const [pubKey, setPubKey] = useState(null);
  const [address, setAddress] = useState('');
  const [qrcode, setQrcode] = useState('');
  const [walletName, setWalletName] = useState(storage.getWalletName() || '');
  const [balance, setBalance] = useState({ confirmed: 0, unconfirmed: 0, total: 0 });
  const [transferStatus, setTransferStatus] = useState(null);
  const [transferMessage, setTransferMessage] = useState('');

  const isWalletUiVisible = useMemo(() => !!address, [address]);

  const refreshBalance = useCallback(async (currentAddress) => {
    const addr = currentAddress || address;
    if (!addr) return null;
    try {
      const newBalance = await getBalance(addr);
      setBalance(newBalance);
      return newBalance;
    } catch (error) {
      console.error('Failed to refresh balance:', error);
      return null;
    }
  }, [address]);

  const createWallet = useCallback(async () => {
    console.log('begin createWallet');

    try {
      const { ciphertext: encryptedWif } = storage.getEncryptedWifData();
      const oldPlaintextWif = localStorage.getItem('priv-key');
      const pubKeyDerHexFromStorage = localStorage.getItem('pub-key');
      const addressFromStorage = localStorage.getItem('wallet-address');

      let tempPrivKey;
      let currentWif;
      let newWalletName = storage.getWalletName() || '';

      if (encryptedWif) {
        console.log('Encrypted WIF found. Wallet uses PIN.');
        if (pubKeyDerHexFromStorage && addressFromStorage) {
          try {
            const potentialPubKey = PublicKey.fromString(pubKeyDerHexFromStorage);
            if (potentialPubKey instanceof PublicKey && potentialPubKey.toAddress().toString() === addressFromStorage) {
              setPubKey(potentialPubKey);
              setAddress(addressFromStorage);
              console.log('Public key and address loaded from cache for PIN-protected wallet.');
            } else {
              console.warn('Encrypted WIF exists, but public key/address cache is invalid. Clearing cache.');
              storage.removePublicKey();
              storage.removeWalletAddress();
            }
          } catch (e) {
            console.warn('Error loading PublicKey from storage, clearing cache.', e);
            storage.removePublicKey();
            storage.removeWalletAddress();
          }
        } else {
           console.warn('Encrypted WIF exists, but no cached public key or address.');
        }
        setWalletName(storage.getWalletName() || '');
      } else if (oldPlaintextWif) {
        console.log('Old plaintext WIF found. Starting migration to PIN protection.');
        await showInfo(t('bsvPayment.pinModal.migrationTitle'), t('bsvPayment.pinModal.migrationMessage'));
        
        const { pin: walletPin, walletName: fetchedWalletName } = await promptForPin('set');
        if (!walletPin) {
          return { error: 'migration-cancelled', message: t('bsvPayment.pinModal.migrationCancelled') };
        }
        newWalletName = fetchedWalletName;

        try {
          const encryptionResult = await encryptData(oldPlaintextWif, walletPin);
          storage.setEncryptedWifData(encryptionResult.ciphertext, encryptionResult.iv, encryptionResult.salt);
          storage.setWalletName(newWalletName);
          
          tempPrivKey = PrivateKey.fromWif(oldPlaintextWif);
          currentWif = oldPlaintextWif;

          localStorage.removeItem('priv-key');
          storage.setIsPinSetupDone(true);
          console.log('Migration to PIN successful. Old plaintext WIF removed.');
        } catch (encError) {
          console.error('Error encrypting old WIF during migration:', encError);
          return { error: 'encryption-failed', message: t('bsvPayment.statusMessages.errors.encryptionFailed') };
        }
      } else {
        console.log('No existing wallet found. Creating new wallet with PIN protection.');
        const { pin: walletPin, walletName: fetchedWalletName } = await promptForPin('set');
        if (!walletPin) {
          return { error: 'setup-cancelled', message: t('bsvPayment.pinModal.setupCancelledMessage') };
        }
        newWalletName = fetchedWalletName;
        tempPrivKey = PrivateKey.fromRandom();
        currentWif = tempPrivKey.toWif();
        try {
          const encryptionResult = await encryptData(currentWif, walletPin);
          storage.setEncryptedWifData(encryptionResult.ciphertext, encryptionResult.iv, encryptionResult.salt);
          storage.setWalletName(newWalletName);
          storage.setIsPinSetupDone(true);
          const newAddress = tempPrivKey.toPublicKey().toAddress().toString();
          autoBackupPrivateKeyToFile(currentWif, newAddress, walletPin, newWalletName);
          console.log('New wallet created and WIF encrypted with PIN.');
        } catch (encError) {
          console.error('Error encrypting new WIF:', encError);
          return { error: 'encryption-failed', message: t('bsvPayment.statusMessages.errors.encryptionFailed') };
        }
      }

      if (tempPrivKey) {
        const newPubKey = tempPrivKey.toPublicKey();
        const newAddress = newPubKey.toAddress().toString();
        setPubKey(newPubKey);
        setAddress(newAddress);
        setWalletName(newWalletName);
        storage.setPublicKey(newPubKey.toDER('hex'));
        storage.setWalletAddress(newAddress);
        console.log('Public key and address derived and cached.');
      }

      const currentAddress = tempPrivKey ? tempPrivKey.toPublicKey().toAddress().toString() : addressFromStorage;
      if (currentAddress) {
        setQrcode(await QRCode.toDataURL(currentAddress));
        refreshBalance(currentAddress);
      } else {
        console.log("Wallet is PIN protected, QR code will be shown after unlock.");
      }
      
      return { error: 0, message: 'Wallet created/loaded successfully.', walletName: newWalletName || storage.getWalletName() };

    } catch (error) {
      console.error('Failed to create wallet:', error);
      return { error: 'wallet-creation-failed', message: t('bsvPayment.statusMessages.walletCreateFailed') };
    }
  }, [storage, autoBackupPrivateKeyToFile, showInfo, promptForPin, t, refreshBalance]);

  const getWifForBackup = useCallback(async () => {
    const result = await ensurePrivateKeyLoaded(pubKey, address);
    if (result && result.loadedPrivKey && result.pin) {
      return await generateEncryptedBackupData(result.loadedPrivKey.toWif(), address, result.pin, walletName);
    }
    return null;
  }, [ensurePrivateKeyLoaded, pubKey, address, walletName, generateEncryptedBackupData, t]);

  const calculateMaxSpendable = useCallback(async () => {
    if (!address) return { maxAmount: 0, message: 'Address not available' };
    try {
        const utxos = await getUTXOs(address);
        const currentBalance = utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);

        if (currentBalance <= 0) {
            return {
                maxAmount: 0,
                message: t('bsvPayment.statusMessages.balanceStatus.zeroBalance')
            };
        }

        const dryRunRequest = [{
            address: address,
            satoshis: currentBalance,
        }];

        const dryRunResult = await processRefund(utxos, dryRunRequest, {
            dryRun: true,
            t,
            pubKey,
            address,
            setStatus: () => {},
            setStatusMessage: () => {}
        });

        if (dryRunResult.error === 'insufficient-funds' && dryRunResult.requiredFee) {
            const estimatedFee = dryRunResult.requiredFee;
            const calculatedMax = currentBalance - estimatedFee;
            const maxAmount = calculatedMax > 0 ? calculatedMax : 0;
            return {
                maxAmount,
                message: maxAmount <= 0 ? t('bsvPayment.statusMessages.balanceStatus.insufficientForFee') : ''
            };
        } else if (dryRunResult.error === 0) {
            return {
                maxAmount: 0,
                message: t('bsvPayment.statusMessages.balanceStatus.insufficientForFee')
            };
        } else {
            const errorMessage = dryRunResult.message || dryRunResult.error;
            return {
                maxAmount: 0,
                message: `${t('bsvPayment.statusMessages.feeCalculationFailed')}: ${errorMessage}`
            };
        }
    } catch (error) {
        console.error('Error calculating max spendable:', error);
        return {
            maxAmount: 0,
            message: `${t('bsvPayment.statusMessages.feeCalculationFailed')}: ${error.message}`
        };
    }
  }, [address, t, pubKey]);

  const clearTransferStatus = useCallback(() => {
    setTransferStatus(null);
    setTransferMessage('');
  }, []);

  const sendTransaction = useCallback(async (target, amount) => {
    let paymentTargetObject = {};
    if (isValidPaymail(target)) {
        paymentTargetObject.paymail = target;
    } else if (isValidAddress(target)) {
        paymentTargetObject.address = target;
    } else {
        const errorMessage = t('bsvPayment.statusMessages.errors.invalidReceivedTarget');
        setTransferStatus('error');
        setTransferMessage(errorMessage);
        throw new Error(errorMessage);
    }

    const transferRequest = [{
        ...paymentTargetObject,
        satoshis: amount,
    }];
    
    try {
        setTransferStatus('preparing');
        setTransferMessage(t('bsvPayment.transfer.preparing'));

        // Parallelize user PIN input and fetching UTXOs
        const [keyResult, utxos] = await Promise.all([
            ensurePrivateKeyLoaded(pubKey, address),
            getUTXOs(address)
        ]);

        if (!keyResult || !keyResult.loadedPrivKey) {
            if (keyResult && keyResult.error === 'unlock-cancelled') {
                const error = new Error(keyResult.message || 'Operation cancelled by user.');
                error.cancelled = true;
                throw error;
            }
            throw new Error('Failed to load private key. Is PIN correct?');
        }

        const result = await processRefund(utxos, transferRequest, {
            privateKey: keyResult.loadedPrivKey,
            dryRun: false,
            t,
            pubKey,
            address,
            setStatus: setTransferStatus,
            setStatusMessage: setTransferMessage,
        });

        if (result?.error === 0) {
            refreshBalance(address);
            const successMessage = {
                text: t('bsvPayment.statusMessages.transactionSent'),
                linkUrl: `https://whatsonchain.com/tx/${result.txid}`,
                linkText: t('bsvPayment.viewOnExplorer'),
            };
            setTransferMessage(successMessage);
            return { success: true, txid: result.txid };
        } else {
            const error = new Error(result.message || 'Transaction failed');
            error.code = result.error;
            throw error;
        }
    } catch (error) {
        if (!error.cancelled) {
             console.error('sendTransaction error:', error);
             setTransferStatus('error');
             setTransferMessage(error.message || t('bsvPayment.transfer.errors.transferFailed'));
        } else {
            // If user cancelled, clear the status to reset the button state
            clearTransferStatus();
        }
        throw error;
    }
}, [address, pubKey, t, ensurePrivateKeyLoaded, refreshBalance, clearTransferStatus]);

  const handleDeleteWallet = useCallback((isReload = true) => {
    const addressToDelete = address;
    storage.clearWalletData(addressToDelete);
    setPubKey(null);
    setAddress('');
    setQrcode('');
    setWalletName('');
    setBalance({ confirmed: 0, unconfirmed: 0, total: 0 });
    if (isReload) window.location.reload();
  }, [address, storage, t]);

  const handleImportData = useCallback(async (dataToImport) => {
    console.log('handleImportData called with:', dataToImport);
    let importDataType = null;
    let importDataContent = null;

    if (typeof dataToImport === 'string') {
      try {
        const parsed = JSON.parse(dataToImport);
        if (parsed && parsed.encryptedWif && parsed.iv && parsed.salt) {
          importDataType = 'encrypted';
          importDataContent = parsed;
        } else {
          throw new Error('Not encrypted JSON format');
        }
      } catch (e) {
        if (isValidAddress(dataToImport) || isValidPaymail(dataToImport)) {
          // This case is not a WIF or JSON, so it's likely an address/paymail.
          // We can't import a wallet from just an address/paymail.
          // Let it fall through to the wifError block.
        }
        try {
          PrivateKey.fromWif(dataToImport);
          importDataType = 'plain';
          importDataContent = { wif: dataToImport };
        } catch (wifError) {
          console.error('Invalid string import data format:', dataToImport);
          await showInfo(t('bsvPayment.statusMessages.errorTitle'), t('bsvPayment.statusMessages.errors.invalidImportData'));
          return { error: 'invalid-import-data' };
        }
      }
    } else {
        console.error('useWallet: Unexpected import data type or value:', dataToImport);
        await showInfo(t('bsvPayment.statusMessages.errorTitle'), t('bsvPayment.statusMessages.errors.invalidImportData'));
        return { error: 'unexpected-data-type' };
    }

    try {
      handleDeleteWallet(false);

      let importedWif = null;

      if (importDataType === 'plain') {
        importedWif = importDataContent.wif;
        console.log('Importing plain WIF.');

        const { pin, walletName: newWalletName } = await promptForPin('set');
        if (!pin) {
          await showInfo(t('bsvPayment.pinModal.importCancelledTitle'), t('bsvPayment.pinModal.importCancelledMessage'));
          return { error: 'import-cancelled' };
        }

        const encryptionResult = await encryptData(importedWif, pin);
        storage.setEncryptedWifData(encryptionResult.ciphertext, encryptionResult.iv, encryptionResult.salt);
        storage.setWalletName(newWalletName);
        storage.setIsPinSetupDone(true);

      } else if (importDataType === 'encrypted') {
        console.log('Importing encrypted data.');
        const { encryptedWif, iv, salt, address: importedAddressFromData, walletName: dataWalletName } = importDataContent;

        const { pin } = await promptForPin('unlock');
        if (!pin) {
          await showInfo(t('bsvPayment.pinModal.unlockCancelledTitle'), t('bsvPayment.pinModal.unlockCancelledMessage'));
          return { error: 'unlock-cancelled' };
        }

        try {
          importedWif = await decryptData(encryptedWif, iv, salt, pin);
          if (!importedWif) {
            throw new Error(t('bsvPayment.statusMessages.errors.decryptionFailedPinIncorrect'));
          }
          console.log('Encrypted data decrypted successfully.');

          const decryptedPrivKey = PrivateKey.fromWif(importedWif);
          const derivedAddress = decryptedPrivKey.toPublicKey().toAddress().toString();

          if (importedAddressFromData && derivedAddress !== importedAddressFromData) {
            await showInfo(t('bsvPayment.statusMessages.errors.addressMismatchTitle'), t('bsvPayment.statusMessages.errors.addressMismatch'));
            return { error: 'address-mismatch' };
          }

          storage.setEncryptedWifData(encryptedWif, iv, salt);
          storage.setWalletName(dataWalletName || '');
          storage.setIsPinSetupDone(true);

        } catch (decryptError) {
          console.error('Error decrypting imported data:', decryptError);
          await showInfo(t('bsvPayment.pinModal.decryptionFailedTitle'), decryptError.message || t('bsvPayment.pinModal.decryptionFailedMessage'));
          return { error: 'decryption-failed' };
        }
      }

      const finalPrivKey = PrivateKey.fromWif(importedWif);
      const finalPubKey = finalPrivKey.toPublicKey();
      const finalAddress = finalPubKey.toAddress().toString();

      storage.setPublicKey(finalPubKey.toDER('hex'));
      storage.setWalletAddress(finalAddress);
      storage.setBackupStatus(finalAddress, true);

      console.log('Wallet imported, encrypted with PIN, and pubKey/address cached.');
      
      window.location.reload();
      return { error: 0, message: 'Wallet imported successfully.' };

    } catch (error) {
      console.error('useWallet: Error processing imported data:', error);
      await showInfo(t('bsvPayment.statusMessages.errors.wifImportFailed'), error.message);
      storage.clearWalletData();
      return { error: 'import-processing-failed' };
    }
  }, [handleDeleteWallet, promptForPin, showInfo, storage, t]);

  return {
    pubKey,
    address,
    walletName,
    qrcode,
    isWalletUiVisible,
    balance: balance.total,
    walletBalance: balance,
    createWallet,
    getWifForBackup,
    handleDeleteWallet,
    handleImportData,
    ensurePrivateKeyLoaded,
    refreshBalance,
    calculateMaxSpendable,
    sendTransaction,
    transferStatus,
    transferMessage,
    clearTransferStatus,
  };
}
