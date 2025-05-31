import { P2PKH, Script, PublicKey, Hash } from '@bsv/sdk'; // 导入 Script, Address, Hash
import { isWeChat, downloadImage } from './index'; // 导入 downloadImage 和 getAddressFromScript
import QRCode from 'qrcode'; // 导入 QRCode
import {
  broadcastTransaction,
  broadcastTransactionWithBitails,
  getSourceTransaction,
  getOpReturnFromBittails,
  getOpReturnFromWhatsOnChain,
  getBalance,
  getOpReturn,
  getOpReturnFromTaal,
  getOpReturnFromGorillaPool,
  getSourceTransaction3,
  getTransactionStatus,
  getSourceTransaction2,
  getSourceAddressFromTx,
  getUTXOs,
  getAddressDetail,
  fetchMinerFee,
  fetchAddressTransactions, // 导入获取地址交易历史的函数
} from './api';

function getSenderAddress(tx) {
  // 通常最后一个输出是找零地址，也就是发送者的地址
  const lastOutput = tx.vout[tx.vout.length - 1];
  return lastOutput.scriptPubKey.addresses[0];
}

function convertSatoshisToBSV(satoshis) {
  // 将聪转换为 BSV
  const bsv = satoshis / 100000000;

  // 使用 toFixed(8) 保留 8 位小数，并避免使用科学计数法
  return bsv.toFixed(8);
}

function isValidAddress(address) {
  // Basic Bitcoin address validation
  const regex = /^[13][a-km-zA-HJ-NP-Z0-9]{25,34}$/;
  return regex.test(address);
}

const truncate = (str, startLength, endLength) => {
  if (typeof str !== 'string') {
    throw new Error('Expected a string');
  }
  if (str.length <= startLength + endLength) {
    return str; // No need to truncate
  }
  const startStr = str.substring(0, startLength);
  const endStr = str.substring(str.length - endLength);
  return `${startStr}...${endStr}`;
};

/**
 * 生成私钥的二维码 Data URL。
 * @param {string} privateKeyWif WIF 格式的私钥。
 * @returns {Promise<string>} 返回二维码的 Data URL，如果生成失败则返回空字符串。
 */
async function generatePrivateKeyQrCodeUrl(privateKeyWif) {
  if (!privateKeyWif) {
    console.error('Private key WIF is required to generate QR code.');
    return '';
  }
  try {
    // 使用 errorCorrectionLevel: 'H' 提高容错率，width 设置二维码宽度
    return await QRCode.toDataURL(privateKeyWif, { errorCorrectionLevel: 'H', width: 256 });
  } catch (err) {
    console.error('Failed to generate QR code URL:', err);
    return '';
  }
}

/**
 * 生成加密数据的二维码 Data URL。
 * @param {Object} backupData 包含加密信息的完整备份数据对象。
 * @returns {Promise<string>} 返回二维码的 Data URL，如果生成失败则返回空字符串。
 */
async function generateEncryptedDataQrCodeUrl(backupData) {
  if (!backupData || !backupData.encryptedWif || !backupData.address) {
    console.error('完整的备份数据对象（包含 encryptedWif 和 address）是生成二维码所必需的。');
    return '';
  }
  try {
    const backupDataString = JSON.stringify(backupData);

    // console.log('bsv.js: backupData string length:', backupDataString.length);
    // console.log('bsv.js: backupData content (first 200 chars):', backupDataString.substring(0, 200));

    // 使用 errorCorrectionLevel: 'H' 提高容错率，width 设置二维码宽度
    return await QRCode.toDataURL(backupDataString, { errorCorrectionLevel: 'H', width: 300 });
  } catch (err) {
    console.error('Failed to generate encrypted data QR code URL:', err);
    return '';
  }
}

export {
  broadcastTransaction,
  broadcastTransactionWithBitails,
  getSenderAddress,
  getOpReturnFromBittails,
  getSourceTransaction,
  getSourceAddressFromTx,
  getSourceTransaction2,
  getSourceTransaction3,
  convertSatoshisToBSV,
  getUTXOs,
  getBalance,
  getAddressDetail,
  getOpReturnFromTaal,
  getOpReturnFromGorillaPool,
  getOpReturnFromWhatsOnChain,
  getOpReturn,
  getTransactionStatus,
  fetchMinerFee,
  isValidAddress,
  truncate,
  isValidPaymail, // 添加导出
  generatePrivateKeyQrCodeUrl, // 导出新函数
  generateEncryptedDataQrCodeUrl, // 导出加密数据二维码生成函数
  downloadPrivateKeyAsQrCode, // 导出新的工具函数
  downloadEncryptedDataQrCode, // 导出加密数据二维码下载函数
};

// Function to validate Paymail format
function isValidPaymail(paymail) {
  if (typeof paymail !== 'string') return false;
  // Basic Paymail format validation (alias@domain.tld)
  const paymailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return paymailRegex.test(paymail);
}

/**
 * 生成私钥的二维码并触发下载。
 * @param {string} privateKeyWif WIF 格式的私钥。
 * @param {string} address 钱包地址，用于生成文件名。
 * @param {string} [filenamePrefix='bitspv-wif-'] 文件名前缀。
 * @returns {Promise<void>}
 */
async function downloadPrivateKeyAsQrCode(privateKeyWif, address, filenamePrefix = 'bitspv-wif-') {
  if (!privateKeyWif || !address) {
    console.error('Private key WIF and address are required for QR code download.');
    return;
  }
  try {
    const qrCodeUrl = await generatePrivateKeyQrCodeUrl(privateKeyWif);
    if (!qrCodeUrl) {
      console.error('Failed to generate QR code URL, download aborted.');
      return;
    }
    const filename = `${filenamePrefix}${address}.png`;
    downloadImage(qrCodeUrl, filename);
  } catch (error) {
    console.error('Error downloading private key QR code:', error);
  }
}

/**
 * 生成加密数据的二维码并触发下载。
 * @param {Object} backupData 包含加密信息的完整备份数据对象。
 * @param {string} address 钱包地址，用于生成文件名。
 * @param {string} [filenamePrefix='bitspv-encrypted-'] 文件名前缀。
 * @returns {Promise<void>}
 */
async function downloadEncryptedDataQrCode(
  backupData,
  address,
  filenamePrefix = 'bitspv-encrypted-'
) {
  if (!backupData || !address) {
    console.error('完整的备份数据对象和地址是二维码下载所必需的。');
    return;
  }
  try {
    const qrCodeUrl = await generateEncryptedDataQrCodeUrl(backupData);
    if (!qrCodeUrl) {
      console.error('Failed to generate encrypted data QR code URL, download aborted.');
      return;
    }
    const filename = `${filenamePrefix}${address}.png`;
    downloadImage(qrCodeUrl, filename);
  } catch (error) {
    console.error('Error downloading encrypted data QR code:', error);
  }
}
