import { ref } from 'vue'

// Storage Keys
const ENCRYPTED_WIF = 'encrypted-wif';
const ENCRYPTED_WIF_IV = 'encrypted-wif-iv';
const ENCRYPTED_WIF_SALT = 'encrypted-wif-salt';
const WALLET_NAME = 'wallet-name'; // 用于存储钱包名称
const PUBLIC_KEY = 'pub-key';
const WALLET_ADDRESS = 'wallet-address';
const IS_PIN_SETUP_DONE = 'is-pin-setup-done';
const BACKUP_STATUS_PREFIX = 'backup-status-';
const OLD_PRIV_KEY = 'priv-key'; // 定义旧私钥的 localStorage key

export const useStorage = () => {
  // 钱包数据相关
  const getEncryptedWifData = () => {
    const ciphertext = localStorage.getItem(ENCRYPTED_WIF);
    const iv = localStorage.getItem(ENCRYPTED_WIF_IV);
    const salt = localStorage.getItem(ENCRYPTED_WIF_SALT);
    const walletName = localStorage.getItem(WALLET_NAME); // 获取钱包名称
    return { ciphertext, iv, salt, walletName };
  };
  const setEncryptedWifData = (ciphertext, iv, salt) => { // 移除 hint 参数
    localStorage.setItem(ENCRYPTED_WIF, ciphertext);
    localStorage.setItem(ENCRYPTED_WIF_IV, iv);
    localStorage.setItem(ENCRYPTED_WIF_SALT, salt);
  };
  const removeEncryptedWifData = () => {
    localStorage.removeItem(ENCRYPTED_WIF);
    localStorage.removeItem(ENCRYPTED_WIF_IV);
    localStorage.removeItem(ENCRYPTED_WIF_SALT);
  };

  const getWalletName = () => localStorage.getItem(WALLET_NAME);
  const setWalletName = (value) => localStorage.setItem(WALLET_NAME, value);
  const removeWalletName = () => localStorage.removeItem(WALLET_NAME);

  // 新增：获取旧格式的明文私钥
  const getOldPlaintextWif = () => localStorage.getItem(OLD_PRIV_KEY);
  const removeOldPlaintextWif = () => localStorage.removeItem(OLD_PRIV_KEY);

  const getPublicKey = () => localStorage.getItem(PUBLIC_KEY)
  const setPublicKey = (value) => localStorage.setItem(PUBLIC_KEY, value)
  const removePublicKey = () => localStorage.removeItem(PUBLIC_KEY)

  const getWalletAddress = () => localStorage.getItem(WALLET_ADDRESS)
  const setWalletAddress = (value) => localStorage.setItem(WALLET_ADDRESS, value)
  const removeWalletAddress = () => localStorage.removeItem(WALLET_ADDRESS)

  // PIN 相关
  const getIsPinSetupDone = () => localStorage.getItem(IS_PIN_SETUP_DONE) === 'true'
  const setIsPinSetupDone = (value) => localStorage.setItem(IS_PIN_SETUP_DONE, value.toString())
  const removeIsPinSetupDone = () => localStorage.removeItem(IS_PIN_SETUP_DONE)

  // 备份状态相关
  const getBackupStatus = (address) => localStorage.getItem(`${BACKUP_STATUS_PREFIX}${address}`) === 'true'
  const setBackupStatus = (address, value) => localStorage.setItem(`${BACKUP_STATUS_PREFIX}${address}`, value.toString())
  const removeBackupStatus = (address) => localStorage.removeItem(`${BACKUP_STATUS_PREFIX}${address}`)

  // 清除所有钱包数据
  const clearWalletData = (address) => {
    removeEncryptedWifData(); // 使用合并后的函数
    removePublicKey();
    removeWalletAddress();
    removeIsPinSetupDone();
    removeWalletName(); // 移除钱包名称
    if (address) {
      removeBackupStatus(address);
    }
  };

  return {
    getEncryptedWifData,
    setEncryptedWifData,
    removeEncryptedWifData, // 导出合并后的函数
    getPublicKey,
    setPublicKey,
    removePublicKey, // 导出 removePublicKey
    getWalletAddress,
    setWalletAddress,
    getIsPinSetupDone,
    setIsPinSetupDone,
    getBackupStatus,
    setBackupStatus,
    getOldPlaintextWif,
    removeOldPlaintextWif,
    clearWalletData,
    getWalletName, // 导出新的函数
    setWalletName, // 导出新的函数
    removeWalletName, // 导出新的函数
  };
};
