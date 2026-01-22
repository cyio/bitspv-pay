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
      console.error('Encrypted WIF data not found.');
      throw new Error(t('bsvPayment.statusMessages.errors.encryptedDataMissing'));
    }

    try {
      const pinData = await promptForPin('unlock');
      const pin = pinData.pin;

      // promptForPin promise rejects on cancellation, caught below.

      const decryptedWif = await decryptData(encryptedWif, iv, salt, pin);
      if (!decryptedWif) {
        throw new Error(t('bsvPayment.statusMessages.errors.decryptionFailedPinIncorrect'));
      }
      const loadedPrivKey = PrivateKey.fromWif(decryptedWif);

      if (currentPubKey && currentPubKey instanceof PublicKey && loadedPrivKey.toPublicKey().toDER('hex') !== currentPubKey.toDER('hex')) {
        console.error("CRITICAL: Decrypted private key does not match cached public key!");
        throw new Error(t('bsvPayment.statusMessages.errors.privateKeyMismatch'));
      }
      
      console.log('Private key decrypted and loaded successfully.');
      return { loadedPrivKey, pin, walletName: storedWalletName };

    } catch (error) {
      if (error && error.cancelled) {
        console.log('PIN entry was cancelled by the user.');
        return { error: 'unlock-cancelled', message: error.message || 'User cancelled PIN entry' };
      }

      console.error('Failed to load private key:', error);
      const errorMessage = error.message || t('bsvPayment.statusMessages.errors.decryptionFailedGeneric');
      await showInfo(t('bsvPayment.pinModal.decryptionFailedTitle'), t('bsvPayment.pinModal.decryptionFailedMessage'));

      // Throw a new error to ensure the calling function's flow is stopped
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
