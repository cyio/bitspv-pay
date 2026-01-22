import { P2PKH, Script, PublicKey, Hash } from '@bsv/sdk';
import { downloadImage } from './index';
import QRCode from 'qrcode';
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
  fetchAddressTransactions,
  getExchangeRate,
} from './api';

function getSenderAddress(tx) {
  // Typically, the last output is the change address, which is the sender's address.
  const lastOutput = tx.vout[tx.vout.length - 1];
  return lastOutput.scriptPubKey.addresses[0];
}

function convertSatoshisToBSV(satoshis) {
  const bsv = satoshis / 100000000;
  // Use toFixed(8) to keep 8 decimal places and avoid scientific notation.
  return bsv.toFixed(8);
}

function convertSatoshisToFiat(satoshis, rate) {
  if (typeof satoshis !== 'number' || typeof rate !== 'number' || rate <= 0) {
    return '0.00';
  }
  const bsv = satoshis / 100000000;
  const fiat = bsv * rate;
  return fiat.toFixed(2);
}

function convertFiatToSatoshis(fiatAmount, rate) {
  if (typeof fiatAmount !== 'number' || typeof rate !== 'number' || rate <= 0) {
    return 0;
  }
  const bsv = fiatAmount / rate;
  return Math.round(bsv * 100000000);
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
 * Generates a QR code Data URL for a private key.
 * @param {string} privateKeyWif The private key in WIF format.
 * @returns {Promise<string>} A promise that resolves to the QR code's Data URL, or an empty string on failure.
 */
async function generatePrivateKeyQrCodeUrl(privateKeyWif) {
  if (!privateKeyWif) {
    console.error('Private key WIF is required to generate QR code.');
    return '';
  }
  try {
    // Use errorCorrectionLevel: 'H' for high redundancy, and set width.
    return await QRCode.toDataURL(privateKeyWif, { errorCorrectionLevel: 'H', width: 256 });
  } catch (err) {
    console.error('Failed to generate QR code URL:', err);
    return '';
  }
}

/**
 * Generates a QR code Data URL for encrypted data.
 * @param {Object} backupData The full backup data object, including encryptedWif and address.
 * @returns {Promise<string>} A promise that resolves to the QR code's Data URL, or an empty string on failure.
 */
async function generateEncryptedDataQrCodeUrl(backupData) {
  if (!backupData || !backupData.encryptedWif || !backupData.address) {
    console.error('A complete backup data object (including encryptedWif and address) is required to generate the QR code.');
    return '';
  }
  try {
    const backupDataString = JSON.stringify(backupData);

    // Use errorCorrectionLevel: 'H' for high redundancy, and set width.
    return await QRCode.toDataURL(backupDataString, { errorCorrectionLevel: 'H', width: 256 });
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
  isValidPaymail,
  generatePrivateKeyQrCodeUrl,
  generateEncryptedDataQrCodeUrl,
  downloadPrivateKeyAsQrCode,
  downloadEncryptedDataQrCode,
  getExchangeRate,
  convertSatoshisToFiat,
  convertFiatToSatoshis,
};

// Function to validate Paymail format
function isValidPaymail(paymail) {
  if (typeof paymail !== 'string') return false;
  // Basic Paymail format validation (alias@domain.tld)
  const paymailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return paymailRegex.test(paymail);
}

/**
 * Generates and triggers the download of a QR code for a private key.
 * @param {string} privateKeyWif The private key in WIF format.
 * @param {string} address The wallet address, used for the filename.
 * @param {string} [filenamePrefix='bitspv-wif-'] The prefix for the filename.
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
 * Generates and triggers the download of a QR code for encrypted data.
 * @param {Object} backupData The full backup data object, including encryptedWif.
 * @param {string} address The wallet address, used for the filename.
 * @param {string} [filenamePrefix='bitspv-encrypted-'] The prefix for the filename.
 * @returns {Promise<void>}
 */
async function downloadEncryptedDataQrCode(
  backupData,
  address,
  filenamePrefix = 'bitspv-encrypted-'
) {
  if (!backupData || !address) {
    console.error('A complete backup data object and address are required for QR code download.');
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
