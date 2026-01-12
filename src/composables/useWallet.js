import { ref, computed, nextTick } from 'vue';
import { useI18n } from 'vue-i18n'; // 导入 useI18n
import { PrivateKey, PublicKey } from '@bsv/sdk';
import QRCode from 'qrcode';
import { useStorage } from './useStorage';
import { usePinManager } from './usePinManager';
import { showInfoDialog, showConfirmationDialog, showPromptDialog } from '../utils/confirm';
import { isWeChat } from '../utils';
import { downloadEncryptedDataQrCode, generateEncryptedDataQrCodeUrl } from '../utils/bsv'; // 导入新的工具函数

export function useWallet() {
  const { t } = useI18n(); // 获取翻译函数
  const storage = useStorage();
  const { promptForPin, ensurePrivateKeyLoaded, autoBackupPrivateKeyToFile, encryptData, decryptData, generateEncryptedBackupData } = usePinManager(); // 导入 generateEncryptedBackupData

  const pubKey = ref(null);
  const address = ref('');
  const qrcode = ref('');
  const walletName = ref(storage.getWalletName() || ''); // 从 storage 中获取初始值

  const isWalletUiVisible = computed(() => {
    return !!address.value;
  });

  // 创建新钱包
  const createWallet = async () => {
    console.log('begin createWallet');
    // needsPinInput.value = false; // Reset PIN input state - handled by usePinManager
    // pinErrorMessage.value = ''; // Handled by usePinManager

    try {
      const { ciphertext: encryptedWif, iv: encryptedIv, salt: encryptedSalt } = storage.getEncryptedWifData();
      const oldPlaintextWif = localStorage.getItem('priv-key'); // 保持对旧格式的处理
      const pubKeyDerHexFromStorage = localStorage.getItem('pub-key');
      const addressFromStorage = localStorage.getItem('wallet-address');

      let currentWif = null;
      let tempPrivKey; // To hold PrivateKey instance temporarily
      let newWalletName = storage.getWalletName() || ''; // 确保 newWalletName 在所有分支中都有定义

      if (encryptedWif) {
        // Wallet with PIN already exists, load pubkey and address
        // Private key will be loaded on demand by ensurePrivateKeyLoaded()
        console.log('Encrypted WIF found. Wallet uses PIN.');
        if (pubKeyDerHexFromStorage && addressFromStorage) {
          try {
            const potentialPubKey = PublicKey.fromString(pubKeyDerHexFromStorage);
            if (potentialPubKey instanceof PublicKey && potentialPubKey.toAddress() === addressFromStorage) {
              pubKey.value = potentialPubKey;
              address.value = addressFromStorage;
              console.log('Public key and address loaded from cache for PIN-protected wallet.');
            } else {
              // This is a problematic state: encrypted WIF exists, but pubkey/address mismatch or missing.
              // Might indicate corruption or incomplete previous migration.
              console.warn('Encrypted WIF exists, but public key/address cache is invalid. Attempting to recover or re-setup.');
              // We'll try to force a re-derivation if possible after PIN unlock, or re-setup.
              // For now, clear potentially inconsistent pubkey/address.
              storage.removePublicKey();
              storage.removeWalletAddress();
              // The user will be prompted for PIN by ensurePrivateKeyLoaded if an operation is attempted.
              // If that fails, or if no operation is attempted, they might need a "reset/fix" option.
            }
          } catch (e) {
            console.warn('Error loading PublicKey from DER Hex for PIN-protected wallet, might be corrupted.', e);
            storage.removePublicKey();
            storage.removeWalletAddress();
          }
        } else {
           console.warn('Encrypted WIF exists, but no cached public key or address. These will be derived after PIN unlock.');
           // pubKey and address will be set after successful PIN unlock and WIF decryption.
        }
        // 对于已存在的加密钱包，其名称应从 storage 中获取
        newWalletName = storage.getWalletName() || '';
      } else if (oldPlaintextWif) {
        // Old plaintext WIF exists, need to migrate to PIN protection
        console.log('Old plaintext WIF found. Starting migration to PIN protection.');
        await showInfoDialog(
          t('bsvPayment.pinModal.migrationTitle'),
          t('bsvPayment.pinModal.migrationMessage')
        );
        const { pin: walletPin, walletName: fetchedWalletName } = await promptForPin('set'); // 捕获 walletName
        if (!walletPin) {
          return { error: 'migration-cancelled', message: t('bsvPayment.pinModal.migrationCancelled') };
        }
        newWalletName = fetchedWalletName; // 赋值给外部的 newWalletName
        try {
          const encryptionResult = await encryptData(oldPlaintextWif, walletPin);
          storage.setEncryptedWifData(
            encryptionResult.ciphertext,
            encryptionResult.iv,
            encryptionResult.salt
          );
          storage.setWalletName(newWalletName); // 保存钱包名称
          
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
        const { pin: walletPin, walletName: fetchedWalletName } = await promptForPin('set'); // 捕获 walletName
        if (!walletPin) {
          return { error: 'setup-cancelled', message: t('bsvPayment.pinModal.setupCancelledMessage') };
        }
        newWalletName = fetchedWalletName; // 赋值给外部的 newWalletName
        tempPrivKey = PrivateKey.fromRandom();
        currentWif = tempPrivKey.toWif();
        try {
          const encryptionResult = await encryptData(currentWif, walletPin);
          storage.setEncryptedWifData(
            encryptionResult.ciphertext,
            encryptionResult.iv,
            encryptionResult.salt
          );
          storage.setWalletName(newWalletName); // 保存用户设置的钱包名称
          storage.setIsPinSetupDone(true);
          const address = tempPrivKey.toPublicKey().toAddress();
          autoBackupPrivateKeyToFile(currentWif, address, walletPin, newWalletName); // 传递 walletName
          console.log('New wallet created and WIF encrypted with PIN.');
        } catch (encError) {
          console.error('Error encrypting new WIF:', encError);
          return { error: 'encryption-failed', message: t('bsvPayment.statusMessages.errors.encryptionFailed') };
        }
      }

      if (tempPrivKey) {
        pubKey.value = tempPrivKey.toPublicKey();
        if (!(pubKey.value instanceof PublicKey)) {
           console.error("CRITICAL: tempPrivKey.toPublicKey() did not return a PublicKey instance.");
           throw new Error("SDK Error: toPublicKey() failed to return PublicKey instance.");
        }
        address.value = pubKey.value.toAddress();
        storage.setPublicKey(pubKey.value.toDER('hex'));
        storage.setWalletAddress(address.value);
        console.log('Public key and address derived and cached.');
      }

      if (address.value) {
        qrcode.value = await QRCode.toDataURL(address.value);
      } else if (encryptedWif && !pubKey.value) {
        console.log("Wallet is PIN protected, QR code will be shown after unlock if pubKey/address not cached.");
      }
      
      return { error: 0, message: 'Wallet created/loaded successfully.', walletName: newWalletName || storage.getWalletName() };

    } catch (error) {
      console.error('Failed to create wallet or handle payment request:', error);
      return { error: 'wallet-creation-failed', message: t('bsvPayment.statusMessages.walletCreateFailed') };
    }
  };

  // 为 WalletManager 提供备份所需的数据
  const getWifForBackup = async () => {
    const result = await ensurePrivateKeyLoaded(pubKey.value, address.value);
    if (result && result.loadedPrivKey && result.pin) {
      // 调用通用的生成备份数据函数，并传入已获取的 PIN 和存储的 walletName
      const backupData = await generateEncryptedBackupData(result.loadedPrivKey.toWif(), address.value, result.pin, walletName.value);
      return backupData;
    }
    return null;
  };

  // 处理删除钱包事件
  const handleDeleteWallet = (isReload = true) => {
    const addressToDelete = address.value;
    
    storage.clearWalletData(addressToDelete);

    pubKey.value = null;
    address.value = '';
    qrcode.value = '';
    walletName.value = ''; // 清除 walletName

    isReload && window.location.reload();
  };

  // 处理导入数据
  const handleImportData = async (dataToImport) => {
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
          await showInfoDialog(
            t('bsvPayment.statusMessages.errorTitle'),
            t('bsvPayment.statusMessages.errors.invalidImportData')
          );
          return { error: 'invalid-import-data', message: t('bsvPayment.statusMessages.errors.invalidImportData') };
        }
      }
    } else if (typeof dataToImport === 'object' && dataToImport !== null) {
      if (dataToImport.type && dataToImport.data) {
        importDataType = dataToImport.type;
        importDataContent = dataToImport.data;
      } else {
        console.error('useWallet: Invalid object import data received.');
        return { error: 'invalid-object-data', message: t('bsvPayment.statusMessages.errors.genericError') };
      }
    } else {
      console.error('useWallet: Unexpected import data type or value:', dataToImport);
      return { error: 'unexpected-data-type', message: t('bsvPayment.statusMessages.errors.genericError') };
    }

    try {
      handleDeleteWallet(false);

      let importedWif = null;
      let importedWalletName = ''; // 用于存储导入的 walletName

      if (importDataType === 'plain') {
        importedWif = importDataContent.wif;
        console.log('Importing plain WIF.');

        const { pin, walletName: newWalletName } = await promptForPin('set'); // 获取 PIN 和可选的 walletName
        if (!pin) {
          await showInfoDialog(t('bsvPayment.pinModal.importCancelledTitle'), t('bsvPayment.pinModal.importCancelledMessage'));
          return { error: 'import-cancelled', message: t('bsvPayment.pinModal.importCancelledMessage') };
        }
        importedWalletName = newWalletName; // 保存用户设置的 walletName

        const encryptionResult = await encryptData(importedWif, pin);
        storage.setEncryptedWifData(encryptionResult.ciphertext, encryptionResult.iv, encryptionResult.salt);
        storage.setWalletName(importedWalletName); // 保存钱包名称
        storage.setIsPinSetupDone(true);

      } else if (importDataType === 'encrypted') {
        console.log('Importing encrypted data.');
        const { encryptedWif, iv, salt, address: importedAddressFromData, walletName: dataWalletName } = importDataContent; // 解构 walletName

        const { pin } = await promptForPin('unlock'); // 移除 dataNote 参数
        if (!pin) {
          await showInfoDialog(t('bsvPayment.pinModal.unlockCancelledTitle'), t('bsvPayment.pinModal.unlockCancelledMessage'));
          return { error: 'unlock-cancelled', message: t('bsvPayment.pinModal.unlockCancelledTitle') };
        }

        try {
          importedWif = await decryptData(encryptedWif, iv, salt, pin);
          if (!importedWif) {
            throw new Error(t('bsvPayment.statusMessages.errors.decryptionFailedPinIncorrect'));
          }
          console.log('Encrypted data decrypted successfully.');

          const decryptedPrivKey = PrivateKey.fromWif(importedWif);
          const decryptedPubKey = decryptedPrivKey.toPublicKey();
          const derivedAddress = decryptedPubKey.toAddress();

          if (importedAddressFromData && derivedAddress !== importedAddressFromData) {
            await showInfoDialog(t('bsvPayment.statusMessages.errors.addressMismatchTitle'), t('bsvPayment.statusMessages.errors.addressMismatch'));
            return { error: 'address-mismatch', message: t('bsvPayment.statusMessages.errors.addressMismatch') };
          }

          storage.setEncryptedWifData(encryptedWif, iv, salt); // 移除 dataNote 参数
          storage.setWalletName(dataWalletName || ''); // 保存导入的 walletName
          storage.setIsPinSetupDone(true);

        } catch (decryptError) {
          console.error('Error decrypting imported data:', decryptError);
          await showInfoDialog(t('bsvPayment.pinModal.decryptionFailedTitle'), decryptError.message || t('bsvPayment.pinModal.decryptionFailedMessage'));
          return { error: 'decryption-failed', message: decryptError.message || t('bsvPayment.pinModal.decryptionFailedMessage') };
        }
      } else {
        console.error('useWallet: Unknown import data type:', importDataType);
        return { error: 'unknown-import-type', message: t('bsvPayment.statusMessages.errors.genericError') };
      }

      const finalPrivKey = PrivateKey.fromWif(importedWif);
      const finalPubKey = finalPrivKey.toPublicKey();
      const finalAddress = finalPubKey.toAddress();

      storage.setPublicKey(finalPubKey.toDER('hex'));
      storage.setWalletAddress(finalAddress);
      
      storage.setBackupStatus(finalAddress, true);

      console.log('Wallet imported, encrypted with PIN, and pubKey/address cached.');
      
      window.location.reload();
      return { error: 0, message: 'Wallet imported successfully.' };

    } catch (error) {
      console.error('useWallet: Error processing imported data:', error);
      const errorMessage = t('bsvPayment.statusMessages.errors.wifImportFailed') + `: ${error.message}`;
      storage.removeEncryptedWifData();
      storage.removeIsPinSetupDone();
      return { error: 'import-processing-failed', message: errorMessage };
    }
  };

  const handleRequestImportWallet = async (importFileInputRef) => {
    await nextTick();
    if (importFileInputRef) {
      importFileInputRef.click();
    } else {
      console.error('File input for import not available.');
      await showInfoDialog(t('bsvPayment.statusMessages.errorTitle'), t('bsvPayment.statusMessages.errors.importUiNotAvailable'));
      return { error: 'import-ui-not-available', message: t('bsvPayment.statusMessages.errors.importUiNotAvailable') };
    }
    return { error: 0, message: 'Import file input triggered.' };
  };

  return {
    pubKey,
    address,
    walletName,
    qrcode,
    isWalletUiVisible,
    createWallet,
    getWifForBackup,
    handleDeleteWallet,
    handleImportData,
    handleRequestImportWallet,
    ensurePrivateKeyLoaded,
  };
}
