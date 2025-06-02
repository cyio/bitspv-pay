import { ref } from 'vue';
import { showInfoDialog, showPromptDialog, showMultiInputPrompt } from '../utils/confirm'; // 导入新的对话框函数
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
    let walletName = t('bsvPayment.pinModal.defaultWalletName'); // 默认钱包名称

    if (mode === 'set') {
      // PIN setting is now mandatory and will loop until successful.
      let pinSuccessfullySet = false;
      while (!pinSuccessfullySet) {
        const result = await showMultiInputPrompt({
          title: t('bsvPayment.pinModal.setTitle'),
          inputs: [
            {
              id: 'walletName',
              label: t('bsvPayment.pinModal.walletNamePrompt'),
              type: 'text',
              placeholder: t('bsvPayment.pinModal.walletNamePlaceholder'),
              defaultValue: walletName,
              maxLength: 20,
            },
            {
              id: 'pin',
              label: t('bsvPayment.pinModal.setPrompt'),
              type: 'password',
              placeholder: t('bsvPayment.pinModal.pinInputPlaceholder'),
              required: true,
              maxLength: 20,
              hintMessage: t('bsvPayment.pinModal.pinHintForSet'),
            },
          ],
          confirmButtonText: t('bsvPayment.pinModal.setButton'),
          showCancelButton: false, // PIN is mandatory
          hideModalHeaderCloseButton: true,
        });

        if (!result || !result.pin) { // User entered empty PIN or cancelled (cancel is not possible for PIN)
          await showInfoDialog(
            t('bsvPayment.pinModal.pinIsMandatoryTitle'),
            t('bsvPayment.pinModal.pinIsMandatoryMessage')
          );
          continue; // Loop back to re-prompt for PIN
        }

        pin = result.pin;
        walletName = result.walletName || t('bsvPayment.pinModal.defaultWalletName');

        if (pin.length < 6) {
          await showInfoDialog(t('bsvPayment.pinModal.pinTooShortTitle'), t('bsvPayment.pinModal.pinTooShortMessage'));
          continue; // Loop back to re-prompt for PIN
        }
        
        // 重新添加 PIN 确认步骤
        const confirmPin = await showPromptDialog(
          t('bsvPayment.pinModal.confirmTitle'),
          t('bsvPayment.pinModal.confirmPrompt'),
          t('bsvPayment.pinModal.confirmButton'),
          '', // Cancel button text (not strictly needed now)
          'password',
          undefined, // inputPlaceholder, not used here
          '', // 移除 hint 参数
          false, // showCancelButton: false
          true, // hideModalHeaderCloseButton: true
          undefined, // maxLength
        );

        if (!confirmPin) { // 用户取消了确认
          await showInfoDialog(t('bsvPayment.pinModal.confirmPinCancelledTitle'), t('bsvPayment.pinModal.confirmPinCancelledMessage'));
          continue; // Loop back to re-prompt for initial PIN setting
        }

        if (pin !== confirmPin) {
          await showInfoDialog(t('bsvPayment.pinModal.pinsDoNotMatchTitle'), t('bsvPayment.pinModal.pinsDoNotMatchMessage'));
          continue; // Loop back to re-prompt for initial PIN setting
        }
        
        pinSuccessfullySet = true; // PIN set successfully, exit loop
        // 保存 walletName 到 storage
        storage.setWalletName(walletName);
      }

    } else { // mode === 'unlock'
      const result = await showMultiInputPrompt({
        title: t('bsvPayment.pinModal.unlockTitle'),
        inputs: [
          {
            id: 'pin',
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
      });

      if (!result || !result.pin) {
        return { pin: null, walletName: null }; // Return object for consistency
      }
      pin = result.pin;
    }
    return { pin, walletName }; // Return pin and walletName
  };

  // 辅助函数：确保私钥已加载到组件状态 (PIN Unlocked)
  const ensurePrivateKeyLoaded = async (currentPubKey, currentAddress) => {
    const { ciphertext: encryptedWif, iv, salt, walletName: storedWalletName } = storage.getEncryptedWifData();

    if (!encryptedWif || !iv || !salt) {
      console.error('Encrypted WIF data not found in localStorage.');
      return { error: 'encrypted-data-missing', message: t('bsvPayment.statusMessages.errors.encryptedDataMissing') };
    }

    needsPinInput.value = true; // Prompt for PIN
    pinInputMode.value = 'unlock';

    // Pass the stored walletName to promptForPin for display
    const { pin, walletName: returnedWalletName } = await promptForPin('unlock');
    if (!pin) {
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
        needsPinInput.value = false; // Stop further PIN attempts for this session
        return { error: 'private-key-mismatch', message: t('bsvPayment.statusMessages.errors.privateKeyMismatch') };
      }

      console.log('Private key decrypted and loaded.');
      needsPinInput.value = false;
      pinErrorMessage.value = '';
      // 导入时将 walletName 写入 storage
      if (storedWalletName) {
        storage.setWalletName(storedWalletName);
      }
      return {
        loadedPrivKey,
        encryptedWif,
        iv,
        salt,
        pin, // 返回用户输入的 PIN
        walletName: storedWalletName, // 返回存储的钱包名称
      };
    } catch (e) {
      console.error('Failed to decrypt or load private key from WIF:', e);
      pinErrorMessage.value = e.message || t('bsvPayment.statusMessages.errors.decryptionFailedGeneric');
      await showInfoDialog(t('bsvPayment.pinModal.decryptionFailedTitle'), t('bsvPayment.pinModal.decryptionFailedMessage'));
      return { error: 'decryption-failed', message: e.message || t('bsvPayment.statusMessages.errors.decryptionFailedGeneric') };
    }
  };

  // 通用函数：生成加密的备份数据
  const generateEncryptedBackupData = async (privateKeyContent, address, prefilledPin = null, walletName = t('bsvPayment.pinModal.defaultWalletName')) => {
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
      const result = await promptForPin('unlock'); // Use unlock mode for backup PIN
      pin = result.pin;
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
        walletName: walletName || t('bsvPayment.pinModal.defaultWalletName'), // 使用传入的 walletName 或默认值
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
  const autoBackupPrivateKeyToFile = async (privateKeyContent, address, prefilledPin = null, walletName = t('bsvPayment.pinModal.defaultWalletName')) => {
    if (isWeChat) {
      console.log('在微信内置浏览器中，跳过自动备份私钥。');
      return;
    }

    // 使用 storage composable 检查备份状态
    if (storage.getBackupStatus(address)) {
      console.log(`地址 ${address} 的私钥已经备份过，跳过自动备份。`);
      return;
    }

    const backupData = await generateEncryptedBackupData(privateKeyContent, address, prefilledPin, walletName);
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
