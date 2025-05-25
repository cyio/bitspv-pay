import { P2PKH } from '@bsv/sdk';
import { isWeChat, downloadImage } from './index'; // 导入 downloadImage
import QRCode from 'qrcode'; // 导入 QRCode

// Constants
const WHATS_ON_CHAIN_API = 'https://api.whatsonchain.com/v1/bsv/main/tx/raw';

/**
 * Broadcasts a BSV transaction to the network using WhatsOnChain API
 * @param {string} txHex - The raw transaction hex string to broadcast
 * @returns {Promise<Response>} The response from the broadcast API
 * @throws {Error} If the broadcast fails or if txHex is invalid
 */
async function broadcastTransaction(txHex) {
  if (!txHex || typeof txHex !== 'string') {
    throw new Error('Invalid transaction hex: must be a non-empty string');
  }

  try {
    const response = await fetch(WHATS_ON_CHAIN_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ txhex: txHex }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Failed to broadcast transaction: ${response.status} ${response.statusText} ` + errorData
      );
    }

    return response.json();
  } catch (error) {
    if (error.message.includes('Failed to broadcast')) {
      throw error;
    }
    throw new Error(`Error broadcasting transaction: ${error.message}`);
  }
}

/**
 * 通过 Bitails API 广播 BSV 交易到网络
 * @param {string} txHex - 要广播的原始交易十六进制字符串
 * @returns {Promise<Response>} 来自广播 API 的响应
 * @throws {Error} 如果广播失败或 txHex 无效
 */
async function broadcastTransactionWithBitails(txHex) {
  if (!txHex || typeof txHex !== 'string') {
    throw new Error('无效的交易十六进制字符串：必须是非空字符串');
  }

  try {
    const response = await fetch('https://api.bitails.io/tx/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: txHex }),
    });
    const result = await response.json();
    // 检查是否存在未知错误
    if (result.error && result.error.code !== 0 && result.error.code !==  -27) {
      throw new Error(`Bitails API返回错误: ${JSON.stringify(result.error)}`);
    }
    // {"error":{"code":-1,"message":"unknown-error"}}
    // {"error":{"code":-27,"message":"already-in-mempool"}}
    if (!response.ok) {
      throw new Error(
        `广播交易失败: ${response.status} ${response.statusText} ` + JSON.stringify(result)
      );
    }

    return result;
  } catch (error) {
    if (error.message.includes('广播交易失败')) {
      throw error;
    }
    throw new Error(`广播交易时发生错误: ${error.message}`);
  }
}

function getSenderAddress(tx) {
  // 通常最后一个输出是找零地址，也就是发送者的地址
  const lastOutput = tx.vout[tx.vout.length - 1];
  return lastOutput.scriptPubKey.addresses[0];
}

// 1. 首先需要获取 UTXO 的完整信息
/**
 * 获取原始交易的十六进制字符串，支持多个来源，任一成功即返回。
 * @param {string} txid - 交易 ID
 * @returns {Promise<string>} 原始交易的十六进制字符串
 * @throws {Error} 如果所有来源都失败
 */
const getSourceTransaction = async txid => {
  // 定义多个 API 端点
  const apiEndpoints = [
    {
      url: `https://api.bitails.io/download/tx/${txid}/hex`,
      transform: data => data, // Bitails 直接返回 hex 字符串
    },
    {
      url: `https://api.whatsonchain.com/v1/bsv/main/tx/${txid}/hex`,
      transform: data => data, // WhatsOnChain 直接返回 hex 字符串
    },
    // 可以添加更多来源，例如 Taal 或 GorillaPool，如果它们提供直接获取交易 hex 的接口
    // {
    //   url: `${BASE_URL}/tx/${txid}/hex`, // 假设 Taal 有这样的接口
    //   transform: data => data.hex,
    // },
  ];

  try {
    // 创建一个 Promise 数组，每个 Promise 对应一个 API 请求
    const fetchPromises = apiEndpoints.map(async endpoint => {
      const response = await fetch(endpoint.url);

      if (!response.ok) {
        const errorData = await response.text().catch(() => `Failed to fetch from ${endpoint.url}`);
        throw new Error(
          `API ${endpoint.url} failed: ${response.status} ${response.statusText}. Data: ${errorData}`
        );
      }

      const data = await response.text(); // 假设这些 API 返回的是纯文本的 hex
      return endpoint.transform(data);
    });

    // 使用 Promise.any 返回第一个成功的响应
    const txHex = await Promise.any(fetchPromises);

    // 确保结果是字符串
    if (typeof txHex !== 'string' || !txHex) {
      throw new Error('从 API 接收到意外的数据格式或空数据');
    }

    return txHex;
  } catch (error) {
    console.error(`从所有提供者获取原始交易失败: ${error.message}`);
    throw new Error(`无法从任何提供者获取原始交易: ${error.message}`);
  }
};

const getOpReturnFromBittails = async txid => {
  try {
    // 假设这是从某个 API 获取完整的交易信息
    const response = await fetch(`https://api.bitails.io/tx/${txid}/outputs/0/10`);
    // const response = await fetch(`https://api.bitails.io/tx/${txid}/output/0`);
    // const response = await fetch(`https://api.bitails.io/tx/${txid}`);
    if (response.status !== 200) {
      throw new Error(response.status + ' ' + response.statusText);
    }
    const res = await response.json();
    const target = res.find(i => i.satoshis === 0);
    return target.script;
    // return res;
  } catch (error) {
    console.error('Error fetching source transaction:', error);
    throw error;
  }
};
const getOpReturnFromWhatsOnChain = async txid => {
  try {
    // 获取完整交易
    const response = await fetch(`https://api.whatsonchain.com/v1/bsv/main/tx/${txid}`);
    if (!response.ok) {
      throw new Error(`WhatsOnChain API error: ${response.status}`);
    }
    const tx = await response.json();

    // 筛选出 OP_RETURN 输出
    const opReturns = tx.vout.filter(
      output => output.value === 0 && output.scriptPubKey?.type === 'nulldata'
    );

    return '00' + opReturns[0].scriptPubKey.hex;
  } catch (error) {
    console.error('WhatsOnChain API error:', error);
    throw error;
  }
};

/**
 * 获取地址的总余额 (已确认 + 未确认)
 * @param {string} address - 要查询余额的 BSV 地址
 * @param {string} network - 网络类型 ('main' 或 'test')
 * @returns {Promise<{confirmed: number, unconfirmed: number}>} 地址的总余额 (以聪为单位)
 * @throws {Error} 如果查询失败
 */
async function getBalance(address, network = 'main') {
  // Define multiple API endpoints
  let apiEndpoints = [
    // WhatsOnChain API
    {
      url: `https://api.whatsonchain.com/v1/bsv/${network}/address/${address}/balance`,
      transform: data => ({ confirmed: data.confirmed, unconfirmed: data.unconfirmed }),
    },
    // Bitails API
    {
      url: `https://api.bitails.io/address/${address}/balance`,
      transform: data => ({ confirmed: data.confirmed, unconfirmed: data.unconfirmed }),
    },
  ];

  // If in WeChat environment, prioritize Bitails
  if (isWeChat) {
    apiEndpoints = [
      {
        url: `https://api.bitails.io/address/${address}/balance`,
        transform: data => ({ confirmed: data.confirmed, unconfirmed: data.unconfirmed }),
      },
    ];
  }

  try {
    // Create an array of fetch promises
    const fetchPromises = apiEndpoints.map(async endpoint => {
      const response = await fetch(endpoint.url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `API ${endpoint.url} failed: ${response.status} ${response.statusText} ` + JSON.stringify(errorData)
        );
      }

      const data = await response.json();
      return endpoint.transform(data);
  });

    // Use Promise.any to return the first successful response
    const result = await Promise.any(fetchPromises);

    // Ensure the result has the expected structure
    if (typeof result !== 'object' || result === null || typeof result.confirmed !== 'number' || typeof result.unconfirmed !== 'number') {
        throw new Error('Received unexpected data format from API');
    }

    // Calculate total balance
    const total = result.confirmed + result.unconfirmed;

    return { ...result, total };
  } catch (error) {
    console.error(`Error fetching balance for ${address} from all providers:`, error);
    throw new Error(`Failed to fetch balance from any provider: ${error.message}`);
  }
}

const getOpReturn = async txid => {
  try {
    // 首先尝试从 Bittails 获取数据
    return await getOpReturnFromBittails(txid);
  } catch {
    // 如果 Bittails 接口失败，兜底调用 WhatsOnChain
    console.warn('Falling back to WhatsOnChain API');
    return await getOpReturnFromWhatsOnChain(txid);
  }
};

// 404
const getOpReturnFromTaal = async txid => {
  try {
    const response = await fetch(`/api-taal/api/v1/tx/${txid}`, {
      headers: {
        Authorization: 'YOUR_TAAL_API_KEY',
      },
    });
    if (!response.ok) {
      throw new Error(`TAAL API error: ${response.status}`);
    }
    const tx = await response.json();

    // 筛选 OP_RETURN 输出
    const opReturns = tx.outputs.filter(
      output => output.satoshis === 0 && output.script.startsWith('006a') // OP_RETURN 的十六进制前缀
    );

    return opReturns;
  } catch (error) {
    console.error('TAAL API error:', error);
    throw error;
  }
};

const getOpReturnFromGorillaPool = async txid => {
  try {
    const response = await fetch(`https://api.gorillapool.io/v1/transaction/${txid}`);
    if (!response.ok) {
      throw new Error(`GorillaPool API error: ${response.status}`);
    }
    const tx = await response.json();

    // 筛选 OP_RETURN 输出
    const opReturns = tx.outputs.filter(
      output => output.value === 0 && output.script.startsWith('006a')
    );

    return opReturns;
  } catch (error) {
    console.error('GorillaPool API error:', error);
    throw error;
  }
};

const BASE_URL = import.meta.env.PROD ? 'https://api.taal.com/v1' : '/api-taal';
const ARC_BASE_URL = import.meta.env.PROD ? 'https://arc.taal.com/v1' : '/api-arc';

// not work
const getSourceTransaction3 = async txid => {
  try {
    // Use Taal API to fetch transaction hex
    const response = await fetch(`${BASE_URL}/tx/${txid}`, {
      // const response = await fetch(`https://api.taal.com/api/v1/tx/${txid}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        // You would typically add an API key here
        Authorization: `Bearer ${import.meta.env.VITE_AUTH_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    // Assuming the Taal API returns the transaction hex in a specific field
    const txHex = data.hex; // Adjust this based on the actual API response structure

    return txHex;
  } catch (error) {
    console.error('Error fetching source transaction from Taal:', error);
    throw error;
  }
};

const getTransactionStatus = async txid => {
  try {
    // Use Taal API to fetch transaction hex
    const response = await fetch(`${ARC_BASE_URL}/tx/${txid}`, {
      // const response = await fetch(`https://api.taal.com/api/v1/tx/${txid}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        // You would typically add an API key here
        // 注意：硬编码 API 密钥存在安全风险，建议从环境变量读取
        Authorization: `Bearer ${import.meta.env.VITE_AUTH_TOKEN}`,
      },
    });

    if (!response.ok) {
      // 尝试解析错误响应体
      let errorBody = '';
      try {
        errorBody = await response.text(); // 或者 response.json() 如果 API 返回 JSON 错误
      } catch (parseError) {
        // 解析失败，忽略
      }
      throw new Error(`HTTP error! status: ${response.status} ${response.statusText}. Body: ${errorBody}`);
    }

    const data = await response.json();
    return data;
  } catch (error) { // 将 catch 参数命名为 error
    // console.error('Error fetching source transaction from Taal:', error); // 修正变量名
    // 抛出捕获到的错误，而不是未定义的变量
    // throw error;
    // 暂时不抛出错误，返回 null 或其他表示失败的值，让调用者处理
    console.error('Error fetching transaction status from Taal ARC:', error);
    return null; // 或者可以根据需要返回一个包含错误信息的对象 { error: true, message: error.message }
  }
};

const getSourceTransaction2 = async txid => {
  try {
    return '0100beef01fe114e0d001002fd67810051c82fa56f4f9fe719ecf4adcb7e8f1c95e3f8f8ab0a7256da0d17945198e1dcfd6681022aebe5932a79b34ff764f9ce04c66e81929f89298fb2f0dcf633fe32576bbbe801fdb240000905c37b124e8397e25a091cbc8f41b309b6ed9c50d60c63902c52171ae64cb701fd5820009a01d7011a8cd7c19bfec39ddc1758e61b8f5069c26ab1b8f91c4db9e2b67a0401fd2d10000a19e0f642e134d24a97a1c021ecf60438c971ab68d8fa4886deb10c06ee24b801fd17080064b3a0081284b6cf60ba63db6a44e68a5945e9727fb0fe69d6416d9addb4fc4e01fd0a040073a5ca4d168ceaa57002fea20405dd5d51bf4506a67dd83771908dd3b44537bb01fd04020012d30b56e33334261b718d06a5e09f7034aa7e536e669b5459913d8026061e1701fd0301004bf2bb1a43b12c6369e0c6d7ac369fad30fbe108e866f0517f86448bbcb5bbf001800080a38204b68a33471949f113e2ccab6e9a49cd5e437cc3e779fde057240b526c014100d1cda2ebe31d2170bf48ffbcb6e9f03303922f86f90f056a17dc40e19c98765501210026ba97c007391538cb0fb795b526bd7b4bcd2c1c34aadeb597f99842d7a8eeb701110026309b8a570b54a65c6ea1c99fa1624196c2e0d777beeb8e3c8f90958684faab010900787ef77f6db05c798718b611dedd2be8bfc34cae9aa4b05e271f25a2ac8fe0f6010500e6954fa9dadfb71c379df7711306512dec23617343654a0e5efc164831770457010300f75593d2c1a2df891088fe21bbca3c515e754873a6890898766b7dac02efe8a3010000b6cf5ae226e2009318c4020a88f730362ef85542cf980ce2b7074a7bfd5966820101000000015428b2bf69fc8838e847fc8b0b901a01108a2d0f06cd2aa96827f879476a4549020000006b483045022100d7428156b24e2e45559fd9f3ee20ee86f3f6ad0278476c1c6b1e3edc5e036de602207766411ccf4b491b5ed08cad79fdd32c241080445f118a10a846a33062fe5d9e412103a9d240d8e4489a202c92d5ab705d1286516775e3648ee1cd7d1d3e467c416e09ffffffff02e6000000000000001976a9146d7cb9010f8ba8c746b7ae67ddbcfa720ac4157a88acfb170000000000001976a914e3e26e2985ab9e036dd2ee67484d07c340f2c72f88ac000000000100';
    // 假设这是从某个 API 获取完整的交易信息
    const response = await fetch(`https://beef.xn--nda.network/${txid}`);
    const json = await response.json();
    return json.beef;
  } catch (error) {
    console.error('Error fetching source transaction:', error);
    throw error;
  }
};

const getSourceAddressFromTx = async txid => {
  try {
    // 调用whatsonchain API获取交易详情
    const response = await fetch(`https://api.whatsonchain.com/v1/bsv/main/tx/hash/${txid}`);
    if (!response.ok) {
      throw new Error('Failed to fetch transaction details');
    }
    const txData = await response.json();

    // 获取输入的第一个地址作为来源地址
    // const sourceAddress = txData.vin[0].addr
    return txData;
  } catch (error) {
    console.error('Error getting source address:', error);
    throw error;
  }
};

function convertSatoshisToBSV(satoshis) {
  // 将聪转换为 BSV
  const bsv = satoshis / 100000000;

  // 使用 toFixed(8) 保留 8 位小数，并避免使用科学计数法
  return bsv.toFixed(8);
}

// // 示例使用
// const satoshis = 1234567890;
// const bsv = convertSatoshisToBSV(satoshis);
// console.log(bsv);  // 输出: 12.34567890

// 获取 UTXO
const getUTXOs = async (address, pubKey) => {
  // Define multiple API endpoints
  let apiEndpoints = [
    // WhatsOnChain API
    {
      url: `https://api.whatsonchain.com/v1/bsv/main/address/${address}/unspent`,
      transform: data =>
        data.map(utxo => ({
          txid: utxo.tx_hash,
          vout: utxo.tx_pos,
          satoshis: utxo.value,
        })),
    },
    {
      url: `https://api.bitails.io/address/${address}/unspent`,
      transform: data =>
        data.unspent.map(utxo => ({
          txid: utxo.txid,
          vout: utxo.vout,
          satoshis: utxo.satoshis,
        })),
    },
  ];
  // if (isWeChat) {
  //   apiEndpoints = [
  //     // Bitails API
  //     {
  //       url: `https://api.bitails.io/address/${address}/unspent`,
  //       transform: data =>
  //         data.unspent.map(utxo => ({
  //           txid: utxo.txid,
  //           vout: utxo.vout,
  //           satoshis: utxo.satoshis,
  //         })),
  //     },
  //   ];
  // }

  try {
    // Create an array of fetch promises
    const fetchPromises = apiEndpoints.map(async endpoint => {
      const response = await fetch(endpoint.url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return endpoint.transform(data);
    });

    // Use Promise.any to return the first successful response
    const utxos = await Promise.any(fetchPromises);

    // Optional: Add locking script if needed
    const lockingScript = new P2PKH().lock(pubKey.toHash());

    // Return UTXOs with optional locking script
    return utxos.map(utxo => ({
      ...utxo,
      script: lockingScript.toHex(), // Convert to hexadecimal format
    }));
  } catch (error) {
    // Handle case where all API calls fail
    console.error('Failed to get UTXOs from any API:', error);
    return [];
  }
};

// API 调用函数
async function getAddressDetail(addr) {
  let apis = [
    `https://api.whatsonchain.com/v1/bsv/main/address/${addr}/balance`,
    // `https://ordinals.gorillapool.io/api/txos/address/${addr}/balance?refresh=false`
  ];

  if (isWeChat) {
    apis = [`https://api.bitails.io/address/${addr}/balance`];
  }

  try {
    // 创建多个 API 请求
    const fetchRequests = apis.map(api =>
      fetch(api).then(response => {
        if (!response.ok) {
          throw new Error(`API 请求失败: ${api}`);
        }
        return response.json();
      })
    );

    // 使用 Promise.any 实现只要一个成功即返回
    const result = await Promise.any(fetchRequests);
    if (typeof result === 'object') {
      return result;
    }
    const confirmed = result;
    const unconfirmed = 0;

    return {
      confirmed,
      unconfirmed,
    };
  } catch (err) {
    // error.value = t('bsvAccountViewer.errors.fetchFailed', { message: err.message });
    return err.message;
  }
}

const fetchMinerFee = async () => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 86400;
    const response = await fetch(`https://api.whatsonchain.com/v1/bsv/main/miner/fees?from=${oneDayAgo}&to=${now}`);
    const data = await response.json();
    const minFee = Math.min(...data.map(item => item.min_fee_rate));
    return Math.max(minFee, 1.0011); // 确保不低于1.0011
  } catch (error) {
    console.error('Failed to fetch miner fees:', error);
    return 1.0011; // 默认值
  }
};
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
