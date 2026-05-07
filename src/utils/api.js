// Constants
import { updateProviderHealth, getRecommendedProvider } from './apiProviderHealth';

const WOC_API_BASE = import.meta.env.PROD ? 'https://api.whatsonchain.com' : '/whatsonchain';

const WHATS_ON_CHAIN_API = `${WOC_API_BASE}/v1/bsv/main/tx/raw`;
const BITAILS_BROADCAST_API = 'https://api.bitails.io/tx/broadcast';
const BITAILS_DOWNLOAD_TX_API = 'https://api.bitails.io/download/tx';
const WHATS_ON_CHAIN_TX_API = `${WOC_API_BASE}/v1/bsv/main/tx`;
const WHATS_ON_CHAIN_TX_BATCH_API = `${WOC_API_BASE}/v1/bsv/main/tx/hash`;
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
 * Broadcasts a BSV transaction to the network using the Bitails API.
 * @param {string} txHex - The raw transaction hex string to broadcast.
 * @returns {Promise<Response>} The response from the broadcast API.
 * @throws {Error} If the broadcast fails or if txHex is invalid.
 */
async function broadcastTransactionWithBitails(txHex) {
  if (!txHex || typeof txHex !== 'string') {
    throw new Error('Invalid transaction hex: must be a non-empty string');
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
    // Check for unknown errors
    if (result.error && result.error.code !== 0 && result.error.code !== -27) {
      throw new Error(`Bitails API returned an error: ${JSON.stringify(result.error)}`);
    }
    if (!response.ok) {
      throw new Error(
        `Failed to broadcast transaction: ${response.status} ${response.statusText} ` +
          JSON.stringify(result)
      );
    }

    return result;
  } catch (error) {
    if (error.message.includes('Failed to broadcast transaction')) {
      throw error;
    }
    throw new Error(`Error broadcasting transaction: ${error.message}`);
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
      updateProviderHealth(provider.name, false, latency);
      throw new Error(`Failed to fetch source transaction from ${provider.name}: ${response.status} ${response.statusText}`);
    }

    const data = await response.text();
    const txHex = currentSourceApi.transform(data);
    
    if (typeof txHex !== 'string' || !txHex) {
      throw new Error('Received unexpected data format or empty data from API');
    }

    updateProviderHealth(provider.name, true, latency);
    return txHex;

  } catch (error) {
    const endTime = Date.now();
    const latency = endTime - startTime;
    console.error(`Error fetching source transaction from ${provider.name} (${sourceApiEndpoints[provider.name]?.url || 'N/A'}):`, error);
    updateProviderHealth(provider.name, false, latency);
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
      url: `${BITAILS_ADDRESS_BALANCE_API}/${address}/balance`, // Assuming Bitails has a separate balance API
      transform: data => ({ confirmed: data.balance, unconfirmed: 0 }), // Assuming Bitails returns different fields
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
      const errorDetail = errorData ? (typeof errorData === 'object' ? JSON.stringify(errorData) : errorData) : '';
      console.warn(`API ${provider.name} (${currentApi.url}) failed: ${response.status} ${response.statusText}. Data: ${errorDetail}. Updating health.`);
      updateProviderHealth(provider.name, false, latency);
      throw new Error(`Failed to fetch balance from ${provider.name} [${response.status}] ${currentApi.url}: ${response.statusText} ${errorDetail}`);
    }

    const data = await response.json();
    const result = currentApi.transform(data);

    if (typeof result !== 'object' || result === null || typeof result.confirmed !== 'number' || typeof result.unconfirmed !== 'number') {
        throw new Error('Received unexpected data format from API');
    }

    updateProviderHealth(provider.name, true, latency);
    const total = result.confirmed + result.unconfirmed;
    return { ...result, total };

  } catch (error) {
    const endTime = Date.now();
    const latency = endTime - startTime;
    const url = currentApi?.url || 'N/A';
    console.error(`Error fetching balance from ${provider.name} (${url}):`, error);
    updateProviderHealth(provider.name, false, latency);
    if (error.message.includes(url)) {
      throw error;
    }
    throw new Error(`Failed to fetch balance (${url}): ${error.message}`);
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
        Authorization: `Bearer ${import.meta.env.VITE_TAAL_API_KEY}`,
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
 * Fetches transaction details in batch.
 * @param {Array<string>} txids - Array of transaction IDs.
 * @returns {Promise<Array>} Array of transaction details.
 * @throws {Error} If the request fails.
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
          return null; // Return null or throw an error, depending on the error handling strategy
        }
        return response.json();
      })
    );
    // Filter out failed requests (if they return null)
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
        data
          .map(utxo => ({
            txid: utxo.tx_hash,
            vout: utxo.tx_pos,
            satoshis: utxo.value,
            height: utxo.height,
            _provider: 'whatsOnChain'
          })),
    },
    bitails: {
      url: `${BITAILS_ADDRESS_BALANCE_API}/${address}/unspent`,
      transform: data =>
        data.unspent
          .map(utxo => ({
            txid: utxo.txid,
            vout: utxo.vout,
            satoshis: utxo.satoshis,
            height: utxo.block_height,
            _provider: 'bitails'
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
      const errorDetail = errorData ? (typeof errorData === 'object' ? JSON.stringify(errorData) : errorData) : '';
      console.warn(`API ${provider.name} (${currentUtxoApi.url}) failed: ${response.status} ${response.statusText}. Data: ${errorDetail}. Updating health.`);
      updateProviderHealth(provider.name, false, latency);
      throw new Error(`Failed to fetch UTXOs from ${provider.name} [${response.status}] ${currentUtxoApi.url}: ${response.statusText} ${errorDetail}`);
    }

    const data = await response.json();
    const utxos = currentUtxoApi.transform(data);

    if (!Array.isArray(utxos)) {
      throw new Error('Received unexpected data format from API: UTXOs should be an array');
    }

    updateProviderHealth(provider.name, true, latency);
    return utxos;

  } catch (error) {
    const endTime = Date.now();
    const latency = endTime - startTime;
    const url = currentUtxoApi?.url || 'N/A';
    console.error(`Error fetching UTXOs from ${provider.name} (${url}):`, error);
    updateProviderHealth(provider.name, false, latency);
    if (error.message.includes(url)) {
      throw error;
    }
    throw new Error(`Failed to fetch UTXOs (${url}): ${error.message}`);
  }
};

async function getAddressDetail(addr) {
  const api = `${WHATS_ON_CHAIN_ADDRESS_BALANCE_API}/main/address/${addr}/balance`;

  try {
    const response = await fetch(api);
    if (!response.ok) {
      throw new Error(`API request failed: ${api}`);
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
 * Attempts to fetch the transaction history for an address from available providers.
 * @param {string} address - The address to query.
 * @returns {Promise<Array>} A formatted array of transaction records.
 * @throws {Error} If all sources fail.
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
            height: 0, // Unconfirmed transactions have a height of 0
          })) || [];

        // Sort confirmed transactions by block height in descending order
        confirmed.sort((a, b) => b.height - a.height);

        // Merge transactions, with unconfirmed ones first
        return [...unconfirmed, ...confirmed];
      },
    },
    // TODO: Implement and enable Bitails as a provider for transaction history
    // bitails: {
    //   // The API path for Bitails address transaction history might need adjustment based on the actual endpoint.
    //   // Assuming Bitails has an endpoint like /address/{address}/transactions
    //   url: `${BITAILS_ADDRESS_BALANCE_API}/${address}/transactions`,
    //   transform: data => data.transactions.map(tx => ({
    //     txid: tx.txid,
    //     height: tx.block_height,
    //     time: tx.time,
    //     // Bitails might provide more detailed input/output information, which can be useful for determining income/expense.
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
      const errorDetail = errorData ? (typeof errorData === 'object' ? JSON.stringify(errorData) : errorData) : '';
      console.warn(
        `API ${provider.name} (${currentApi.url}) failed: ${response.status} ${
          response.statusText
        }. Data: ${errorDetail}. Updating health.`
      );
      updateProviderHealth(provider.name, false, latency);
      throw new Error(
        `Failed to fetch address transactions from ${provider.name} [${response.status}] ${currentApi.url}: ${response.statusText} ${errorDetail}`
      );
    }

    const data = await response.json();
    const transactions = currentApi.transform(data);

    if (!Array.isArray(transactions)) {
      throw new Error('Received unexpected data format from API: Transactions should be an array');
    }

    updateProviderHealth(provider.name, true, latency);
    return transactions;
  } catch (error) {
    const endTime = Date.now();
    const latency = endTime - startTime;
    const url = currentApi?.url || 'N/A';
    console.error(
      `Error fetching address transactions from ${provider.name} (${url}):`,
      error
    );
    updateProviderHealth(provider.name, false, latency);
    if (error.message.includes(url)) {
      throw error;
    }
    throw new Error(`Failed to fetch address transactions (${url}): ${error.message}`);
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
  fetchTransactionDetailsBatch,
  getExchangeRate,
};
