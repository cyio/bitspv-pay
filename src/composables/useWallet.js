import { ref, computed, nextTick } from 'vue';
import { PrivateKey, PublicKey } from '@bsv/sdk';
import QRCode from 'qrcode';
import { useStorage } from './useStorage';
import { usePinManager } from './usePinManager';
import { showInfoDialog, showConfirmationDialog, showPromptDialog } from '../utils/confirm';
import { isWeChat } from '../utils';
import { downloadEncryptedDataQrCode, generateEncryptedDataQrCodeUrl } from '../utils/bsv'; // 导入新的工具函数

export function useWallet(t) { // 接受 t 作为参数
  const storage = useStorage();
  const { promptForPin, ensurePrivateKeyLoaded, autoBackupPrivateKeyToFile, encryptData, decryptData, generateEncryptedBackupData } = usePinManager(); // 导入 generateEncryptedBackupData

  const pubKey = ref(null);
  const address = ref('');
  const qrcode = ref('');

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
      } else if (oldPlaintextWif) {
        // Old plaintext WIF exists, need to migrate to PIN protection
        console.log('Old plaintext WIF found. Starting migration to PIN protection.');
        await showInfoDialog(
          t('bsvPayment.pinModal.migrationTitle'),
          t('bsvPayment.pinModal.migrationMessage')
        );
        const walletPin = await promptForPin('set');
        if (!walletPin) {
          // status.value = 'error'; // Handled by calling component
          // statusMessage.value = t('bsvPayment.pinModal.migrationCancelled'); // Handled by calling component
          // Potentially offer to retry or inform user they can't use wallet without PIN.
          // For now, they'll be stuck without a usable key.
          return { error: 'migration-cancelled', message: t('bsvPayment.pinModal.migrationCancelled') };
        }
        try {
          const encryptionResult = await encryptData(oldPlaintextWif, walletPin);
          storage.setEncryptedWifData(
            encryptionResult.ciphertext,
            encryptionResult.iv,
            encryptionResult.salt
          ); // Ensure storage composable is updated
          
          // Load the migrated key
          tempPrivKey = PrivateKey.fromWif(oldPlaintextWif);
          currentWif = oldPlaintextWif; // Keep for backup logic if needed immediately

          // Remove old plaintext WIF *after* successful encryption and storage
          localStorage.removeItem('priv-key'); // 保留对旧格式的处理
          storage.setIsPinSetupDone(true); // Mark PIN setup as complete
          // await showInfoDialog(t('bsvPayment.pinModal.migrationSuccessTitle'), t('bsvPayment.pinModal.migrationSuccessMessage'));
          console.log('Migration to PIN successful. Old plaintext WIF removed.');
        } catch (encError) {
          console.error('Error encrypting old WIF during migration:', encError);
          // status.value = 'error'; // Handled by calling component
          // statusMessage.value = t('bsvPayment.statusMessages.errors.encryptionFailed'); // Handled by calling component
          return { error: 'encryption-failed', message: t('bsvPayment.statusMessages.errors.encryptionFailed') };
        }
      } else {
        // No existing wallet (neither encrypted nor old plaintext), create a new one with PIN
        console.log('No existing wallet found. Creating new wallet with PIN protection.');
        const walletPin = await promptForPin('set');
        if (!walletPin) {
          // status.value = 'error'; // Handled by calling component
          // statusMessage.value = t('bsvPayment.pinModal.setupCancelledMessage'); // Handled by calling component
          return { error: 'setup-cancelled', message: t('bsvPayment.pinModal.setupCancelledMessage') };
        }
        tempPrivKey = PrivateKey.fromRandom();
        currentWif = tempPrivKey.toWif();
        try {
          const encryptionResult = await encryptData(currentWif, walletPin);
          storage.setEncryptedWifData(
            encryptionResult.ciphertext,
            encryptionResult.iv,
            encryptionResult.salt
          ); // Ensure storage composable is updated
          storage.setIsPinSetupDone(true);
          const address = tempPrivKey.toPublicKey().toAddress();
          autoBackupPrivateKeyToFile(currentWif, address, walletPin); // Auto-backup with PIN
          console.log('New wallet created and WIF encrypted with PIN.');
          // await showInfoDialog(t('bsvPayment.pinModal.setupSuccessTitle'), t('bsvPayment.pinModal.setupSuccessMessage'));
        } catch (encError) {
          console.error('Error encrypting new WIF:', encError);
          // status.value = 'error'; // Handled by calling component
          // statusMessage.value = t('bsvPayment.statusMessages.errors.encryptionFailed'); // Handled by calling component
          return { error: 'encryption-failed', message: t('bsvPayment.statusMessages.errors.encryptionFailed') };
        }
      }

      // If tempPrivKey was set (new or migrated wallet), derive and cache pubKey and address
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
        // The actual privKey.value (PrivateKey object) is not set here.
        // It will be loaded by ensurePrivateKeyLoaded when needed, prompting for PIN.
      }


      // Update QR code if address is available
      if (address.value) {
        qrcode.value = await QRCode.toDataURL(address.value);
      } else if (encryptedWif && !pubKey.value) {
        // If wallet is PIN protected but pubKey/address not cached, user needs to unlock first
        // to display QR code. This state should be handled in UI.
        // For now, QR code will be empty until unlock.
        console.log("Wallet is PIN protected, QR code will be shown after unlock if pubKey/address not cached.");
      }
      
      // Auto-backup logic (if applicable, now uses currentWif if available from new/migration)
      // This needs careful consideration: backup should ideally happen *after* PIN setup is confirmed.
      // And it should backup the WIF, not the encrypted version.
      // This part is now handled by autoBackupPrivateKeyToFile within the new wallet creation flow.
      // if (currentWif && address.value && !sendRequest.value) { // sendRequest.value is not available here
      //   if (!storage.getBackupStatus(address.value)) {
      //     // autoBackupPrivateKeyToFile(currentWif, address.value);
      //   } else {
      //     console.log(`Address ${address.value} already backed up.`);
      //   }
      // }
      return { error: 0, message: 'Wallet created/loaded successfully.' };

    } catch (error) {
      console.error('Failed to create wallet or handle payment request:', error);
      // status.value = 'error'; // Handled by calling component
      // statusMessage.value = t('bsvPayment.statusMessages.walletCreateFailed'); // Handled by calling component
      return { error: 'wallet-creation-failed', message: t('bsvPayment.statusMessages.walletCreateFailed') };
    }
  };

  // 为 WalletManager 提供备份所需的数据
  const getWifForBackup = async () => {
    const result = await ensurePrivateKeyLoaded(pubKey.value, address.value); // ensurePrivateKeyLoaded 会处理 PIN 提示和相关状态消息
    if (result && result.loadedPrivKey && result.pin) { // 确保获取到 PIN
      // 调用通用的生成备份数据函数，并传入已获取的 PIN
      const backupData = await generateEncryptedBackupData(result.loadedPrivKey.toWif(), address.value, result.pin);
      return backupData;
    }
    return null;
  };

  // 处理删除钱包事件
  const handleDeleteWallet = (isReload = true) => {
    const addressToDelete = address.value;
    
    // 使用 storage composable 清除所有钱包相关数据
    storage.clearWalletData(addressToDelete);

    // 重置组件状态
    pubKey.value = null;
    address.value = '';
    qrcode.value = '';
    // ... 其他需要重置的状态

    // 重新加载页面或重新调用 createWallet 以生成新钱包
    isReload && window.location.reload();
  };

  // 处理导入数据
  const handleImportData = async (dataToImport) => {
    console.log('handleImportData called with:', dataToImport);
    let importDataType = null;
    let importDataContent = null;

    // Determine if dataToImport is a string (from QR code) or an object (from WalletManager)
    if (typeof dataToImport === 'string') {
      try {
        // Try parsing as JSON first (for encrypted backup data)
        const parsed = JSON.parse(dataToImport);
        if (parsed && parsed.encryptedWif && parsed.iv && parsed.salt) {
          importDataType = 'encrypted';
          importDataContent = parsed;
        } else {
          // If not encrypted JSON, it's an invalid string format
          // The old format (plain WIF string) will be handled in the catch block
          throw new Error('Not encrypted JSON format');
        }
      } catch (e) {
        // If JSON parsing fails, try as plain WIF
        try {
          PrivateKey.fromWif(dataToImport); // This will throw if not a valid WIF
          importDataType = 'plain';
          importDataContent = { wif: dataToImport };
        } catch (wifError) {
          // If JSON parsing or WIF parsing fails, it's an invalid string format
          console.error('Invalid string import data format:', wifError);
          await showInfoDialog(
            t('bsvPayment.statusMessages.errorTitle'),
            t('bsvPayment.statusMessages.errors.invalidImportData')
          );
          return { error: 'invalid-import-data', message: t('bsvPayment.statusMessages.errors.invalidImportData') };
        }
      }
    } else if (typeof dataToImport === 'object' && dataToImport !== null) {
      // Data from WalletManager should already be structured
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
      // Clear all existing wallet data before import
      handleDeleteWallet(false); // Pass false to prevent reload

      let importedWif = null;

      if (importDataType === 'plain') {
        importedWif = importDataContent.wif;
        console.log('Importing plain WIF.');

        const pin = await promptForPin('set');
        if (!pin) {
          await showInfoDialog(t('bsvPayment.pinModal.importCancelledTitle'), t('bsvPayment.pinModal.importCancelledMessage'));
          return { error: 'import-cancelled', message: t('bsvPayment.pinModal.importCancelledMessage') };
        }

        const encryptionResult = await encryptData(importedWif, pin);
        storage.setEncryptedWifData(encryptionResult.ciphertext, encryptionResult.iv, encryptionResult.salt);
        storage.setIsPinSetupDone(true); // 使用 composable

      } else if (importDataType === 'encrypted') {
        console.log('Importing encrypted data.');
        const { encryptedWif, iv, salt, address: importedAddressFromData } = importDataContent; // Destructure address from content

        const pin = await promptForPin('unlock'); // 提示用户输入 PIN 进行解密
        if (!pin) {
          await showInfoDialog(t('bsvPayment.pinModal.unlockCancelledTitle'), t('bsvPayment.pinModal.unlockCancelledMessage'));
          return { error: 'unlock-cancelled', message: t('bsvPayment.pinModal.unlockCancelledMessage') };
        }

        try {
          importedWif = await decryptData(encryptedWif, iv, salt, pin);
          if (!importedWif) {
            throw new Error(t('bsvPayment.statusMessages.errors.decryptionFailedPinIncorrect'));
          }
          console.log('Encrypted data decrypted successfully.');

          // 验证解密出的私钥
          const decryptedPrivKey = PrivateKey.fromWif(importedWif);
          const decryptedPubKey = decryptedPrivKey.toPublicKey();
          const derivedAddress = decryptedPubKey.toAddress();

          // 验证解密出的私钥与导入数据中的地址是否匹配
          if (importedAddressFromData && derivedAddress !== importedAddressFromData) {
            await showInfoDialog(t('bsvPayment.statusMessages.errors.addressMismatchTitle'), t('bsvPayment.statusMessages.errors.addressMismatch'));
            return { error: 'address-mismatch', message: t('bsvPayment.statusMessages.errors.addressMismatch') };
          }

          // 如果验证通过，存储加密数据
          storage.setEncryptedWifData(encryptedWif, iv, salt); // 使用原始的 encryptedWif
          storage.setIsPinSetupDone(true); // 标记 PIN 已设置

        } catch (decryptError) {
          console.error('Error decrypting imported data:', decryptError);
          await showInfoDialog(t('bsvPayment.pinModal.decryptionFailedTitle'), decryptError.message || t('bsvPayment.pinModal.decryptionFailedMessage'));
          return { error: 'decryption-failed', message: decryptError.message || t('bsvPayment.pinModal.decryptionFailedMessage') };
        }
      } else {
        // Should not happen if WalletManager correctly categorizes
        console.error('useWallet: Unknown import data type:', importDataType);
        return { error: 'unknown-import-type', message: t('bsvPayment.statusMessages.errors.genericError') };
      }

      // 共同的存储逻辑
      const finalPrivKey = PrivateKey.fromWif(importedWif);
      const finalPubKey = finalPrivKey.toPublicKey();
      const finalAddress = finalPubKey.toAddress();

      storage.setPublicKey(finalPubKey.toDER('hex'));
      storage.setWalletAddress(finalAddress);
      
      storage.setBackupStatus(finalAddress, true); // 标记为已备份

      console.log('Wallet imported, encrypted with PIN, and pubKey/address cached.');
      
      // Reload to reflect new wallet state
      window.location.reload();
      return { error: 0, message: 'Wallet imported successfully.' };

    } catch (error) {
      console.error('useWallet: Error processing imported data:', error);
      const errorMessage = t('bsvPayment.statusMessages.errors.wifImportFailed') + `: ${error.message}`;
      // Clear any partial import data
      storage.removeEncryptedWifData();
      storage.removeIsPinSetupDone(); // 保持对 is-pin-setup-done 的直接操作
      return { error: 'import-processing-failed', message: errorMessage };
    }
  };

  // 处理 WalletManager 请求导入钱包的事件
  const handleRequestImportWallet = async (importFileInputRef) => {
    await nextTick(); // 确保 DOM 更新
    if (importFileInputRef) {
      importFileInputRef.click(); // 直接触发文件输入框点击
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
    qrcode,
    isWalletUiVisible,
    createWallet,
    getWifForBackup,
    handleDeleteWallet,
    handleImportData,
    handleRequestImportWallet,
    ensurePrivateKeyLoaded, // 导出 ensurePrivateKeyLoaded
  };
}
