// Constants
import { updateProviderHealth, getRecommendedProvider } from './apiProviderHealth';

const WOC_API_BASE = import.meta.env.PROD ? 'https://api.whatsonchain.com' : '/whatsonchain';

const WHATS_ON_CHAIN_API = `${WOC_API_BASE}/v1/bsv/main/tx/raw`;
const BITAILS_BROADCAST_API = 'https://api.bitails.io/tx/broadcast';
const BITAILS_DOWNLOAD_TX_API = 'https://api.bitails.io/download/tx';
const WHATS_ON_CHAIN_TX_API = `${WOC_API_BASE}/v1/bsv/main/tx`;
const WHATS_ON_CHAIN_TX_BATCH_API = `${WOC_API_BASE}/v1/bsv/main/tx/hash`; // 修改为单笔查询接口的基础URL
const BITAILS_TX_OUTPUTS_API = 'https://api.bitails.io/tx';
const WHATS_ON_CHAIN_ADDRESS_BALANCE_API = `${WOC_API_BASE}/v1/bsv`;
const BITAILS_ADDRESS_BALANCE_API = 'https://api.bitails.io/address';
const TAAL_API_BASE = import.meta.env.PROD ? 'https://api.taal.com/v1' : '/api-taal';
const ARC_API_BASE = import.meta.env.PROD ? 'https://arc.taal.com/v1' : '/api-arc';
const BEEF_NETWORK_API = 'https://beef.xn--nda.network';
const WHATS_ON_CHAIN_MINER_FEES_API = `${WOC_API_BASE}/v1/bsv/main/miner/fees`;
const WHATS_ON_CHAIN_ADDRESS_HISTORY_API =
  `${WOC_API_BASE}/v1/bsv/main/addresses/history/all`;
const WHATS_ON_CHAIN_EXCHANGE_RATE_API = `${WOC_API_BASE}/v1/bsv/main/exchangerate`;


/**
 * Fetches the current BSV exchange rate from WhatsOnChain.
 * @returns {Promise<Object>} The exchange rate data.
 */
async function getExchangeRate() {
  try {
    const response = await fetch(WHATS_ON_CHAIN_EXCHANGE_RATE_API);
    if (!response.ok) {
      throw new Error(`Failed to fetch exchange rate: ${response.status} ${response.statusText}`);
    }
    return response.json();
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    throw error;
  }
}

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
    const response = await fetch(BITAILS_BROADCAST_API, {
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

/**
 * 获取原始交易的十六进制字符串，支持多个来源，任一成功即返回。
 * @param {string} txid - 交易 ID
 * @returns {Promise<string>} 原始交易的十六进制字符串
 * @throws {Error} 如果所有来源都失败
 */
const getSourceTransaction = async txid => {
  const provider = getRecommendedProvider();
  if (!provider) {
    throw new Error(`No healthy service provider available for source transaction check for txid: ${txid}`);
  }

  const sourceApiEndpoints = {
    whatsOnChain: {
      url: `${WHATS_ON_CHAIN_TX_API}/${txid}/hex`,
      transform: data => data,
    },
    bitails: {
      url: `${BITAILS_DOWNLOAD_TX_API}/${txid}/hex`,
      transform: data => data,
    },
  };

  const currentSourceApi = sourceApiEndpoints[provider.name] || Object.values(sourceApiEndpoints)[0];

  const startTime = Date.now();
  try {
    const response = await fetch(currentSourceApi.url);
    const endTime = Date.now();
    const latency = endTime - startTime;

    if (!response.ok) {
      const errorData = await response.text().catch(() => ({}));
      console.warn(`API ${provider.name} (${currentSourceApi.url}) failed: ${response.status} ${response.statusText}. Data: ${errorData}. Updating health.`);
      updateProviderHealth(provider.name, false, latency); // 失败，更新健康度
      throw new Error(`Failed to fetch source transaction from ${provider.name}: ${response.status} ${response.statusText}`);
    }

    const data = await response.text();
    const txHex = currentSourceApi.transform(data);
    
    if (typeof txHex !== 'string' || !txHex) {
      throw new Error('从 API 接收到意外的数据格式或空数据');
    }

    updateProviderHealth(provider.name, true, latency); // 成功，更新健康度
    return txHex;

  } catch (error) {
    const endTime = Date.now();
    const latency = endTime - startTime;
    console.error(`Error fetching source transaction from ${provider.name} (${sourceApiEndpoints[provider.name]?.url || 'N/A'}):`, error);
    updateProviderHealth(provider.name, false, latency); // 失败，更新健康度
    throw new Error(`Failed to fetch source transaction: ${error.message}`);
  }
};

const getOpReturnFromBittails = async txid => {
  try {
    const response = await fetch(`${BITAILS_TX_OUTPUTS_API}/${txid}/outputs/0/10`);
    if (response.status !== 200) {
      throw new Error(response.status + ' ' + response.statusText);
    }
    const res = await response.json();
    const target = res.find(i => i.satoshis === 0);
    return target.script;
  } catch (error) {
    console.error('Error fetching source transaction:', error);
    throw error;
  }
};

const getOpReturnFromWhatsOnChain = async txid => {
  try {
    const response = await fetch(`${WHATS_ON_CHAIN_TX_API}/${txid}`);
    if (!response.ok) {
      throw new Error(`WhatsOnChain API error: ${response.status}`);
    }
    const tx = await response.json();
    const opReturns = tx.vout.filter(
      output => output.value === 0 && output.scriptPubKey?.type === 'nulldata'
    );
    return '00' + opReturns[0].scriptPubKey.hex;
  } catch (error) {
    console.error('WhatsOnChain API error:', error);
    throw error;
  }
};

async function getBalance(address, network = 'main') {
  const provider = getRecommendedProvider();
  if (!provider) {
    throw new Error(`No healthy service provider available for balance check for address: ${address}`);
  }

  const apiEndpoints = {
    whatsOnChain: {
      url: `${WHATS_ON_CHAIN_ADDRESS_BALANCE_API}/${network}/address/${address}/balance`,
      transform: data => ({ confirmed: data.confirmed, unconfirmed: data.unconfirmed }),
    },
    bitails: {
      url: `${BITAILS_ADDRESS_BALANCE_API}/${address}/balance`, // 假设 Bitails 有单独的 balance API
      transform: data => ({ confirmed: data.balance, unconfirmed: 0 }), // 假设 Bitails 返回的字段不同
    },
  };

  const currentApi = apiEndpoints[provider.name] || Object.values(apiEndpoints)[0];

  const startTime = Date.now();
  try {
    const response = await fetch(currentApi.url);
    const endTime = Date.now();
    const latency = endTime - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.warn(`API ${provider.name} (${currentApi.url}) failed: ${response.status} ${response.statusText}. Data: ${JSON.stringify(errorData)}. Updating health.`);
      updateProviderHealth(provider.name, false, latency); // 失败，更新健康度
      throw new Error(`Failed to fetch balance from ${provider.name}: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const result = currentApi.transform(data);

    if (typeof result !== 'object' || result === null || typeof result.confirmed !== 'number' || typeof result.unconfirmed !== 'number') {
        throw new Error('Received unexpected data format from API');
    }

    updateProviderHealth(provider.name, true, latency); // 成功，更新健康度
    const total = result.confirmed + result.unconfirmed;
    return { ...result, total };

  } catch (error) {
    const endTime = Date.now();
    const latency = endTime - startTime;
    console.error(`Error fetching balance from ${provider.name} (${apiEndpoints[provider.name]?.url || 'N/A'}):`, error);
    updateProviderHealth(provider.name, false, latency); // 失败，更新健康度
    throw new Error(`Failed to fetch balance: ${error.message}`);
  }
}

const getOpReturn = async txid => {
  try {
    return await getOpReturnFromBittails(txid);
  } catch {
    console.warn('Falling back to WhatsOnChain API');
    return await getOpReturnFromWhatsOnChain(txid);
  }
};

const getOpReturnFromTaal = async txid => {
  try {
    const response = await fetch(`${TAAL_API_BASE}/tx/${txid}`, {
      headers: {
        Authorization: 'YOUR_TAAL_API_KEY',
      },
    });
    if (!response.ok) {
      throw new Error(`TAAL API error: ${response.status}`);
    }
    const tx = await response.json();
    const opReturns = tx.outputs.filter(
      output => output.satoshis === 0 && output.script.startsWith('006a')
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
    const opReturns = tx.outputs.filter(
      output => output.value === 0 && output.script.startsWith('006a')
    );
    return opReturns;
  } catch (error) {
    console.error('GorillaPool API error:', error);
    throw error;
  }
};

const getSourceTransaction3 = async txid => {
  try {
    const response = await fetch(`${TAAL_API_BASE}/tx/${txid}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_AUTH_TOKEN}`,
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const txHex = data.hex;
    return txHex;
  } catch (error) {
    console.error('Error fetching source transaction from Taal:', error);
    throw error;
  }
};

const getTransactionStatus = async txid => {
  try {
    const response = await fetch(`${ARC_API_BASE}/tx/${txid}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_AUTH_TOKEN}`,
      },
    });
    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch (parseError) {}
      throw new Error(`HTTP error! status: ${response.status} ${response.statusText}. Body: ${errorBody}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching transaction status from Taal ARC:', error);
    return null;
  }
};

const getSourceTransaction2 = async txid => {
  try {
    const response = await fetch(`${BEEF_NETWORK_API}/${txid}`);
    const json = await response.json();
    return json.beef;
  } catch (error) {
    console.error('Error fetching source transaction:', error);
    throw error;
  }
};

const getSourceAddressFromTx = async txid => {
  try {
    const response = await fetch(`${WHATS_ON_CHAIN_TX_API}/hash/${txid}`);
    if (!response.ok) {
      throw new Error('Failed to fetch transaction details');
    }
    const txData = await response.json();
    return txData;
  } catch (error) {
    console.error('Error getting source address:', error);
    throw error;
  }
};

/**
 * 批量获取交易详情。
 * @param {Array<string>} txids - 交易 ID 数组。
 * @returns {Promise<Array>} 交易详情数组。
 * @throws {Error} 如果请求失败。
 */
async function fetchTransactionDetailsBatch(txids) {
  if (!Array.isArray(txids) || txids.length === 0) {
    return [];
  }

  try {
    const results = await Promise.all(
      txids.map(async (txid) => {
        const response = await fetch(`${WHATS_ON_CHAIN_TX_BATCH_API}/${txid}`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.warn(
            `Failed to fetch transaction details for ${txid}: ${response.status} ${response.statusText} ` +
              JSON.stringify(errorData)
          );
          return null; // 返回 null 或抛出错误，取决于错误处理策略
        }
        return response.json();
      })
    );
    // 过滤掉失败的请求（如果返回 null）
    return results.filter(result => result !== null);
  } catch (error) {
    console.error('Error fetching transaction details in batch:', error);
    throw error;
  }
}

const getUTXOs = async (address, network = 'main') => {
  const provider = getRecommendedProvider();
  if (!provider) {
    throw new Error(`No healthy service provider available for UTXO check for address: ${address}`);
  }

  const utxoApiEndpoints = {
    whatsOnChain: {
      url: `${WHATS_ON_CHAIN_ADDRESS_BALANCE_API}/${network}/address/${address}/unspent`,
      transform: data =>
        data.map(utxo => ({
          txid: utxo.tx_hash,
          vout: utxo.tx_pos,
          satoshis: utxo.value,
        })),
    },
    bitails: {
      url: `${BITAILS_ADDRESS_BALANCE_API}/${address}/unspent`,
      transform: data =>
        data.unspent.map(utxo => ({
          txid: utxo.txid,
          vout: utxo.vout,
          satoshis: utxo.satoshis,
        })),
    },
  };

  const currentUtxoApi = utxoApiEndpoints[provider.name] || Object.values(utxoApiEndpoints)[0];

  const startTime = Date.now();
  try {
    const response = await fetch(currentUtxoApi.url);
    const endTime = Date.now();
    const latency = endTime - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.warn(`API ${provider.name} (${currentUtxoApi.url}) failed: ${response.status} ${response.statusText}. Data: ${JSON.stringify(errorData)}. Updating health.`);
      updateProviderHealth(provider.name, false, latency); // 失败，更新健康度
      throw new Error(`Failed to fetch UTXOs from ${provider.name}: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const utxos = currentUtxoApi.transform(data);

    if (!Array.isArray(utxos)) {
      throw new Error('Received unexpected data format from API: UTXOs should be an array');
    }

    updateProviderHealth(provider.name, true, latency); // 成功，更新健康度
    return utxos;

  } catch (error) {
    const endTime = Date.now();
    const latency = endTime - startTime;
    console.error(`Error fetching UTXOs from ${provider.name} (${utxoApiEndpoints[provider.name]?.url || 'N/A'}):`, error);
    updateProviderHealth(provider.name, false, latency); // 失败，更新健康度
    throw new Error(`Failed to fetch UTXOs: ${error.message}`);
  }
};

async function getAddressDetail(addr) {
  const api = `${WHATS_ON_CHAIN_ADDRESS_BALANCE_API}/main/address/${addr}/balance`;

  try {
    const response = await fetch(api);
    if (!response.ok) {
      throw new Error(`API 请求失败: ${api}`);
    }
    const result = await response.json();
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
    return err.message;
  }
}

const fetchMinerFee = async () => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 86400;
    const response = await fetch(`${WHATS_ON_CHAIN_MINER_FEES_API}?from=${oneDayAgo}&to=${now}`);
    const data = await response.json();
    const minFee = Math.min(...data.map(item => item.min_fee_rate));
    return Math.max(minFee, 1.0011);
  } catch (error) {
    console.error('Failed to fetch miner fees:', error);
    return 1.0011;
  }
};

/**
 * 尝试从 WhatsOnChain 和 Bitails 获取地址的交易历史。
 * @param {string} address - 要查询的地址。
 * @returns {Promise<Array>} 格式化的交易记录数组。
 * @throws {Error} 如果所有来源都失败。
 */
async function fetchAddressTransactions(address) {
  const provider = getRecommendedProvider();
  if (!provider) {
    throw new Error(
      `No healthy service provider available for address transaction history check for address: ${address}`
    );
  }

  const historyApiEndpoints = {
    whatsOnChain: {
      url: WHATS_ON_CHAIN_ADDRESS_HISTORY_API,
      method: 'POST',
      body: JSON.stringify({ addresses: [address] }),
      headers: { 'Content-Type': 'application/json' },
      transform: data => {
        const addressData = data[0] || {};
        const confirmed =
          addressData.confirmed.result?.map(tx => ({
            tx_hash: tx.tx_hash,
            height: tx.height,
          })) || [];
        const unconfirmed =
          addressData.unconfirmed.result?.map(tx => ({
            tx_hash: tx.tx_hash,
            height: 0, // 未确认交易的高度设为 0
          })) || [];

        // 按区块高度对已确认交易进行降序排序
        confirmed.sort((a, b) => b.height - a.height);

        // 合并交易，未确认的在前
        return [...unconfirmed, ...confirmed];
      },
    },
    // bitails: {
    //   // Bitails 的地址交易历史 API 路径可能需要根据实际情况调整
    //   // 假设 Bitails 有一个 /address/{address}/transactions 的接口
    //   url: `${BITAILS_ADDRESS_BALANCE_API}/${address}/transactions`,
    //   transform: data => data.transactions.map(tx => ({
    //     txid: tx.txid,
    //     height: tx.block_height,
    //     time: tx.time,
    //     // Bitails 可能会提供更详细的输入/输出信息，方便判断收入/支出
    //     inputs: tx.inputs,
    //     outputs: tx.outputs,
    //   })),
    // },
  };

  const currentApi = historyApiEndpoints[provider.name] || Object.values(historyApiEndpoints)[0];

  const startTime = Date.now();
  try {
    const fetchOptions = {
      method: currentApi.method || 'GET',
      headers: currentApi.headers,
      body: currentApi.body,
    };
    const response = await fetch(currentApi.url, fetchOptions);
    const endTime = Date.now();
    const latency = endTime - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.warn(
        `API ${provider.name} (${currentApi.url}) failed: ${response.status} ${
          response.statusText
        }. Data: ${JSON.stringify(errorData)}. Updating health.`
      );
      updateProviderHealth(provider.name, false, latency); // 失败，更新健康度
      throw new Error(
        `Failed to fetch address transactions from ${provider.name}: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    const transactions = currentApi.transform(data);

    if (!Array.isArray(transactions)) {
      throw new Error('Received unexpected data format from API: Transactions should be an array');
    }

    updateProviderHealth(provider.name, true, latency); // 成功，更新健康度
    return transactions;
  } catch (error) {
    const endTime = Date.now();
    const latency = endTime - startTime;
    console.error(
      `Error fetching address transactions from ${provider.name} (${
        historyApiEndpoints[provider.name]?.url || 'N/A'
      }):`,
      error
    );
    updateProviderHealth(provider.name, false, latency); // 失败，更新健康度
    throw new Error(`Failed to fetch address transactions: ${error.message}`);
  }
}


export {
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
  fetchTransactionDetailsBatch, // 导出批量获取交易详情的函数
  getExchangeRate,
};
