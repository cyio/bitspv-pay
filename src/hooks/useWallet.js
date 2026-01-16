import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { PrivateKey, PublicKey, Transaction, Script } from '@bsv/sdk';
import QRCode from 'qrcode';
import { useStorage } from './useStorage';
import { getBalance, getUTXOs, broadcastTransaction, fetchMinerFee } from '../utils/api';
import { isWeChat } from '../utils';
import { encryptData, decryptData } from '../utils/webauthn';
import { usePinManager } from './usePinManager';

export function useWallet() {
  const { t } = useTranslation();
  const storage = useStorage();
  const { promptForPin, showInfo, ensurePrivateKeyLoaded, autoBackupPrivateKeyToFile, generateEncryptedBackupData } = usePinManager();

  const [pubKey, setPubKey] = useState(null);
  const [address, setAddress] = useState('');
  const [qrcode, setQrcode] = useState('');
  const [walletName, setWalletName] = useState(storage.getWalletName() || '');
  const [balance, setBalance] = useState({ confirmed: 0, unconfirmed: 0, total: 0 });

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
    if (!address) return 0;
    const utxos = await getUTXOs(address);
    if (!utxos || utxos.length === 0) return 0;
    const totalSatoshis = utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);
    // Rough estimation of fee, assuming 1 input and 1 output
    const fee = (180 * (await fetchMinerFee() || 0.05))/100;
    return Math.max(0, totalSatoshis - fee);
  }, [address]);

  const sendTransaction = useCallback(async (toAddress, amountSatoshis) => {
    try {
      const result = await ensurePrivateKeyLoaded(pubKey, address);
      if (!result || !result.loadedPrivKey) {
        return { success: false, message: 'Could not load private key. PIN correct?' };
      }
      const privateKey = result.loadedPrivKey;

      const utxos = await getUTXOs(address);
      if (!utxos || utxos.length === 0) {
        return { success: false, message: t('bsvPayment.statusMessages.errors.noUTXOs') };
      }

      const transaction = new Transaction();
      transaction.from(utxos.map(utxo => ({
        txid: utxo.txid,
        vout: utxo.vout,
        scriptPubKey: Script.fromAddress(address).toHex(),
        satoshis: utxo.satoshis,
      })));
      transaction.to(toAddress, amountSatoshis);
      transaction.change(address);
      transaction.sign(privateKey);

      const txHex = transaction.toHex();
      const broadcastResult = await broadcastTransaction(txHex);

      refreshBalance(address); // Refresh balance after sending
      return { success: true, message: t('bsvPayment.statusMessages.transactionSent'), txid: broadcastResult.txid };

    } catch (error) {
      if (error === undefined) {
        // User cancelled the PIN prompt
        throw undefined;
      }
      console.error('Error sending transaction:', error);
      return { success: false, message: error.message || t('bsvPayment.statusMessages.errors.transactionFailed') };
    }
  }, [address, pubKey, ensurePrivateKeyLoaded, refreshBalance, t]);

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
        try {
          PrivateKey.fromWif(dataToImport);
          importDataType = 'plain';
          importDataContent = { wif: dataToImport };
        } catch (wifError) {
          console.error('Invalid string import data format:', wifError);
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
  };
}
