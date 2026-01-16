import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { encryptData, decryptData } from '../utils/webauthn';
import { downloadEncryptedDataQrCode } from '../utils/bsv';
import { useStorage } from './useStorage';
import { PrivateKey, PublicKey } from '@bsv/sdk';
import { isWeChat } from '../utils';
import { usePinPrompt } from '../contexts/PinPromptContext';

// This hook manages the logic for PIN operations by using the PinPromptContext.
export function usePinManager() {
  const storage = useStorage();
  const { t } = useTranslation();
  const { promptForPin, showInfo } = usePinPrompt();

  const ensurePrivateKeyLoaded = useCallback(async (currentPubKey) => {
    const { ciphertext: encryptedWif, iv, salt, walletName: storedWalletName } = storage.getEncryptedWifData();
  
    if (!encryptedWif || !iv || !salt) {
      console.error('Encrypted WIF data not found in localStorage.');
      throw new Error(t('bsvPayment.statusMessages.errors.encryptedDataMissing'));
    }
  
    try {
      // promptForPin now correctly resolves with an object like { pin: '...' }
      const pinData = await promptForPin('unlock');
      const pin = pinData.pin;
  
      if (!pin) {
        // This case handles cancellation or empty submission.
        // The rejection is now handled by the calling component's catch block.
        throw new Error(t('bsvPayment.pinModal.unlockCancelledTitle'));
      }
  
      const decryptedWif = await decryptData(encryptedWif, iv, salt, pin);
      if (!decryptedWif) {
        throw new Error(t('bsvPayment.statusMessages.errors.decryptionFailedPinIncorrect'));
      }
      const loadedPrivKey = PrivateKey.fromWif(decryptedWif);
  
      if (currentPubKey && currentPubKey instanceof PublicKey && loadedPrivKey.toPublicKey().toDER('hex') !== currentPubKey.toDER('hex')) {
        console.error("CRITICAL: Decrypted private key does not match cached public key!");
        throw new Error(t('bsvPayment.statusMessages.errors.privateKeyMismatch'));
      }
  
      console.log('Private key decrypted and loaded.');
      if (storedWalletName) {
        storage.setWalletName(storedWalletName);
      }
      // Return all necessary data, including the loaded private key
      return { loadedPrivKey, encryptedWif, iv, salt, pin, walletName: storedWalletName };
    } catch (e) {
      // This catch block now correctly handles rejections from promptForPin (e.g., user cancellation)
      // as well as any other errors within the try block.
      console.error('Decryption/loading process failed:', e);
      const errorMessage = e.message || t('bsvPayment.statusMessages.errors.decryptionFailedGeneric');

      // Show a user-friendly dialog for specific errors, but not for cancellation.
      if (e.message !== 'User cancelled PIN input.' && e.message !== t('bsvPayment.pinModal.unlockCancelledTitle')) {
        await showInfo(t('bsvPayment.pinModal.decryptionFailedTitle'), t('bsvPayment.pinModal.decryptionFailedMessage'));
      }

      // Re-throw the error so the calling function (in useWallet) can catch it and update its state.
      throw new Error(errorMessage);
    }
  }, [storage, t, promptForPin, showInfo]);
  
  const generateEncryptedBackupData = useCallback(async (privateKeyContent, address, prefilledPin = null, walletName = t('bsvPayment.pinModal.defaultWalletName')) => {
    if (!privateKeyContent || !address) {
      console.warn('Private key or address is empty, cannot generate backup data.');
      return null;
    }

    let pin = prefilledPin;
    if (!pin) {
      const result = await promptForPin('unlock');
      pin = result.pin;
      if (!pin) {
        console.log('User cancelled backup data generation.');
        return null;
      }
    }

    try {
      const encryptionResult = await encryptData(privateKeyContent, pin);
      return {
        encryptedWif: encryptionResult.ciphertext,
        iv: encryptionResult.iv,
        salt: encryptionResult.salt,
        address,
        timestamp: new Date().toISOString(),
        walletName: walletName || t('bsvPayment.pinModal.defaultWalletName'),
      };
    } catch (error) {
      console.error('Error generating encrypted backup data:', error);
      await showInfo(t('bsvPayment.statusMessages.errorTitle'), t('bsvPayment.statusMessages.backupEncryptionFailed'));
      return null;
    }
  }, [promptForPin, showInfo, t]);

  const autoBackupPrivateKeyToFile = useCallback(async (privateKeyContent, address, prefilledPin = null, walletName = t('bsvPayment.pinModal.defaultWalletName')) => {
    if (isWeChat) {
      console.log('Auto-backup skipped in WeChat browser.');
      return;
    }

    if (storage.getBackupStatus(address)) {
      console.log(`Private key for ${address} already backed up, skipping.`);
      return;
    }

    const backupData = await generateEncryptedBackupData(privateKeyContent, address, prefilledPin, walletName);
    if (!backupData) {
      return;
    }

    try {
      await downloadEncryptedDataQrCode(backupData, address);
      storage.setBackupStatus(address, true);
      await showInfo(t('bsvPayment.statusMessages.tipTitle'), t('bsvPayment.statusMessages.autoBackupSuccessEncrypted'));
    } catch (error) {
      console.error('Error during auto-backup:', error);
      await showInfo(t('bsvPayment.statusMessages.errorTitle'), t('bsvPayment.statusMessages.backupEncryptionFailed'));
    }
  }, [storage, generateEncryptedBackupData, showInfo, t]);

  return {
    promptForPin,
    showInfo,
    ensurePrivateKeyLoaded,
    autoBackupPrivateKeyToFile,
    generateEncryptedBackupData,
  };
}
