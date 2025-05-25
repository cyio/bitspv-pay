import { ref } from 'vue';
import { showInfoDialog, showPromptDialog } from '../utils/confirm';
import { encryptData, decryptData } from '../utils/webauthn';
import { downloadEncryptedDataQrCode } from '../utils/bsv';
import { useStorage } from './useStorage'; // 导入 useStorage
import { PrivateKey, PublicKey } from '@bsv/sdk';
import { isWeChat } from '../utils';
import i18n from '@/i18n'; // 导入主应用的 i18n 实例

export function usePinManager() { // 不再接受 t 作为参数
  const storage = useStorage(); // 在 composable 内部使用 useStorage
  const { t } = i18n.global; // 在 composable 内部获取 t

  // PIN and Encryption related state
  const needsPinInput = ref(false);
  const pinInputMode = ref(''); // 'set' or 'unlock'
  const enteredPin = ref(''); // For v-model in PIN input UI
  const pinErrorMessage = ref('');

  // --- PIN Management Functions ---
  const promptForPin = async (mode) => { // mode: 'set' or 'unlock'
    pinInputMode.value = mode;
    pinErrorMessage.value = '';
    let pin;

    if (mode === 'set') {
      // PIN setting is now mandatory and will loop until successful.
      let pinSuccessfullySet = false;
      while (!pinSuccessfullySet) {
        pin = await showPromptDialog(
          t('bsvPayment.pinModal.setTitle'),
          t('bsvPayment.pinModal.setPrompt'), // Main prompt message
          t('bsvPayment.pinModal.setButton'),
          '', // Cancel button text (not strictly needed now, but kept for consistency if showCancelButton is true elsewhere)
          'password',
          '', // inputPlaceholder, not used here
          t('bsvPayment.pinModal.pinHintForSet'), // Hint message
          false, // showCancelButton: false
          true // hideModalHeaderCloseButton: true
        );

        if (!pin) { // User entered empty string (cancel is not possible)
          await showInfoDialog(
            t('bsvPayment.pinModal.pinIsMandatoryTitle'),
            t('bsvPayment.pinModal.pinIsMandatoryMessage')
          );
          continue; // Loop back to re-prompt for PIN
        }

        if (pin.length < 6) {
          await showInfoDialog(t('bsvPayment.pinModal.pinTooShortTitle'), t('bsvPayment.pinModal.pinTooShortMessage'));
          continue; // Loop back to re-prompt for PIN
        }

        const confirmPin = await showPromptDialog(
          t('bsvPayment.pinModal.confirmTitle'),
          t('bsvPayment.pinModal.confirmPrompt'),
          t('bsvPayment.pinModal.confirmButton'),
          '', // Cancel button text (not strictly needed now)
          'password',
          undefined, // inputPlaceholder, not used here
          undefined, // hintMessage, not used here
          false, // showCancelButton: false
          true // hideModalHeaderCloseButton: true
        );

        if (pin !== confirmPin) {
          await showInfoDialog(t('bsvPayment.pinModal.pinsDoNotMatchTitle'), t('bsvPayment.pinModal.pinsDoNotMatchMessage'));
          continue; // Loop back to re-prompt for initial PIN setting
        }
        
        pinSuccessfullySet = true; // PIN set successfully, exit loop
      }
    } else { // mode === 'unlock'
      pin = await showPromptDialog(
        t('bsvPayment.pinModal.unlockTitle'),
        t('bsvPayment.pinModal.unlockPrompt'),
        t('bsvPayment.pinModal.unlockButton'),
        t('bsvPayment.pinModal.cancelButton'),
        'password'
      );
      if (!pin) {
        return null;
      }
    }
    return pin;
  };

  // 辅助函数：确保私钥已加载到组件状态 (PIN Unlocked)
  const ensurePrivateKeyLoaded = async (currentPubKey, currentAddress) => {
    const { ciphertext: encryptedWif, iv, salt } = storage.getEncryptedWifData();

    if (!encryptedWif || !iv || !salt) {
      // status.value = 'error'; // This should be handled by the calling component
      // statusMessage.value = t('bsvPayment.statusMessages.errors.encryptedDataMissing'); // This should be handled by the calling component
      console.error('Encrypted WIF data not found in localStorage.');
      return { error: 'encrypted-data-missing', message: t('bsvPayment.statusMessages.errors.encryptedDataMissing') };
    }

    needsPinInput.value = true; // Prompt for PIN
    pinInputMode.value = 'unlock';
    // statusMessage.value = t('bsvPayment.pinModal.unlockPrompt'); // Update general status message, handled by calling component

    const pin = await promptForPin('unlock');
    if (!pin) {
      // statusMessage.value = t('bsvPayment.pinModal.unlockCancelledMessage'); // Handled by calling component
      needsPinInput.value = false; // User cancelled
      return { error: 'unlock-cancelled', message: t('bsvPayment.pinModal.unlockCancelledMessage') };
    }

    try {
      const decryptedWif = await decryptData(encryptedWif, iv, salt, pin);
      if (!decryptedWif) {
        throw new Error(t('bsvPayment.statusMessages.errors.decryptionFailedPinIncorrect'));
      }
      const loadedPrivKey = PrivateKey.fromWif(decryptedWif);

      // Optional: Verify against stored public key if still doing that
      if (currentPubKey && currentPubKey instanceof PublicKey && loadedPrivKey.toPublicKey().toDER('hex') !== currentPubKey.toDER('hex')) {
        console.error("CRITICAL: Decrypted private key does not match cached public key!");
        // status.value = 'error'; // Handled by calling component
        // statusMessage.value = t('bsvPayment.statusMessages.errors.privateKeyMismatch'); // Handled by calling component
        needsPinInput.value = false; // Stop further PIN attempts for this session
        return { error: 'private-key-mismatch', message: t('bsvPayment.statusMessages.errors.privateKeyMismatch') };
      }

      console.log('Private key decrypted and loaded.');
      // statusMessage.value = t('bsvPayment.statusMessages.walletUnlocked'); // Handled by calling component
      needsPinInput.value = false;
      pinErrorMessage.value = '';
      return {
        loadedPrivKey,
        encryptedWif,
        iv,
        salt,
        pin, // 返回用户输入的 PIN
      };
    } catch (e) {
      console.error('Failed to decrypt or load private key from WIF:', e);
      // status.value = 'error'; // Handled by calling component
      // statusMessage.value = e.message || t('bsvPayment.statusMessages.errors.decryptionFailedGeneric'); // Handled by calling component
      pinErrorMessage.value = e.message || t('bsvPayment.statusMessages.errors.decryptionFailedGeneric');
      await showInfoDialog(t('bsvPayment.pinModal.decryptionFailedTitle'), t('bsvPayment.pinModal.decryptionFailedMessage'));
      return { error: 'decryption-failed', message: e.message || t('bsvPayment.statusMessages.errors.decryptionFailedGeneric') };
    }
  };

  // 通用函数：生成加密的备份数据
  const generateEncryptedBackupData = async (privateKeyContent, address, prefilledPin = null) => {
    if (!privateKeyContent) {
      console.warn('传入的 privateKeyContent 为空，无法生成备份数据。');
      return null;
    }

    if (!address) {
      console.warn('钱包地址尚未生成，无法创建备份数据。');
      return null;
    }

    let pin = prefilledPin;
    if (!pin) {
      // 提示用户输入 PIN 码用于加密备份
      pin = await promptForPin('unlock');
      if (!pin) {
        console.log('用户取消了生成备份数据操作。');
        return null;
      }
    }

    try {
      // 使用 PIN 加密私钥
      const encryptionResult = await encryptData(privateKeyContent, pin);
      
      // 创建包含加密信息的备份数据
      const backupData = {
        encryptedWif: encryptionResult.ciphertext,
        iv: encryptionResult.iv,
        salt: encryptionResult.salt,
        address: address,
        timestamp: new Date().toISOString(),
        note: t('bsvPayment.backupDataNote') // 使用 i18n 字符串
      };
      return backupData;
    } catch (error) {
      console.error('生成加密备份数据时出错:', error);
      await showInfoDialog(
        t('bsvPayment.statusMessages.errorTitle'),
        t('bsvPayment.statusMessages.backupEncryptionFailed'),
        t('bsvPayment.statusMessages.gotItButton')
      );
      return null;
    }
  };

  // 自动备份私钥到文件（使用 PIN 加密）
  const autoBackupPrivateKeyToFile = async (privateKeyContent, address, prefilledPin = null) => {
    if (isWeChat) {
      console.log('在微信内置浏览器中，跳过自动备份私钥。');
      return;
    }

    // 使用 storage composable 检查备份状态
    if (storage.getBackupStatus(address)) {
      console.log(`地址 ${address} 的私钥已经备份过，跳过自动备份。`);
      return;
    }

    const backupData = await generateEncryptedBackupData(privateKeyContent, address, prefilledPin);
    if (!backupData) {
      console.log('未能生成备份数据，跳过自动备份。');
      return;
    }

    try {
      // 生成加密数据的二维码
      await downloadEncryptedDataQrCode(backupData, address);
      
      // 使用 storage composable 标记已备份
      storage.setBackupStatus(address, true);
      
      // 友好提示用户备份成功
      await showInfoDialog(
        t('bsvPayment.statusMessages.tipTitle'),
        t('bsvPayment.statusMessages.autoBackupSuccessEncrypted'),
        t('bsvPayment.statusMessages.gotItButton')
      );
    } catch (error) {
      console.error('备份加密私钥时出错:', error);
      await showInfoDialog(
        t('bsvPayment.statusMessages.errorTitle'),
        t('bsvPayment.statusMessages.backupEncryptionFailed'),
        t('bsvPayment.statusMessages.gotItButton')
      );
    }
  };

  return {
    needsPinInput,
    pinInputMode,
    enteredPin,
    pinErrorMessage,
    promptForPin,
    ensurePrivateKeyLoaded,
    autoBackupPrivateKeyToFile,
    encryptData, // 导出 encryptData
    decryptData, // 导出 decryptData
    generateEncryptedBackupData, // 导出新的通用函数
  };
}
