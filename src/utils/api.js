// Constants
const WHATS_ON_CHAIN_API = 'https://api.whatsonchain.com/v1/bsv/main/tx/raw';
const BITAILS_BROADCAST_API = 'https://api.bitails.io/tx/broadcast';
const BITAILS_DOWNLOAD_TX_API = 'https://api.bitails.io/download/tx';
const WHATS_ON_CHAIN_TX_API = 'https://api.whatsonchain.com/v1/bsv/main/tx';
const BITAILS_TX_OUTPUTS_API = 'https://api.bitails.io/tx';
const WHATS_ON_CHAIN_ADDRESS_BALANCE_API = 'https://api.whatsonchain.com/v1/bsv/';
const BITAILS_ADDRESS_BALANCE_API = 'https://api.bitails.io/address';
const TAAL_API_BASE = import.meta.env.PROD ? 'https://api.taal.com/v1' : '/api-taal';
const ARC_API_BASE = import.meta.env.PROD ? 'https://arc.taal.com/v1' : '/api-arc';
const BEEF_NETWORK_API = 'https://beef.xn--nda.network';
const WHATS_ON_CHAIN_MINER_FEES_API = 'https://api.whatsonchain.com/v1/bsv/main/miner/fees';


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
  const apiEndpoints = [
    {
      url: `${BITAILS_DOWNLOAD_TX_API}/${txid}/hex`,
      transform: data => data,
    },
    {
      url: `${WHATS_ON_CHAIN_TX_API}/${txid}/hex`,
      transform: data => data,
    },
  ];

  try {
    // 尝试从第一个API获取，如果失败则尝试第二个
    let response = await fetch(apiEndpoints[0].url);
    if (!response.ok) {
      const errorData = await response.text().catch(() => `Failed to fetch from ${apiEndpoints[0].url}`);
      console.warn(`API ${apiEndpoints[0].url} failed: ${response.status} ${response.statusText}. Data: ${errorData}. Falling back to next API.`);
      
      response = await fetch(apiEndpoints[1].url);
      if (!response.ok) {
        const errorData2 = await response.text().catch(() => `Failed to fetch from ${apiEndpoints[1].url}`);
        throw new Error(
          `API ${apiEndpoints[1].url} failed: ${response.status} ${response.statusText}. Data: ${errorData2}`
        );
      }
    }
    const data = await response.text();
    const txHex = apiEndpoints[0].transform(data); // Use transform from the first endpoint as a default
    
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
  const apiEndpoint = {
    url: `${WHATS_ON_CHAIN_ADDRESS_BALANCE_API}/${network}/address/${address}/balance`,
    transform: data => ({ confirmed: data.confirmed, unconfirmed: data.unconfirmed }),
  };

  try {
    const response = await fetch(apiEndpoint.url);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `API ${apiEndpoint.url} failed: ${response.status} ${response.statusText} ` + JSON.stringify(errorData)
      );
    }
    const data = await response.json();
    const result = apiEndpoint.transform(data);
    
    if (typeof result !== 'object' || result === null || typeof result.confirmed !== 'number' || typeof result.unconfirmed !== 'number') {
        throw new Error('Received unexpected data format from API');
    }
    const total = result.confirmed + result.unconfirmed;
    return { ...result, total };
  } catch (error) {
    console.error(`Error fetching balance for ${address}:`, error);
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

const getUTXOs = async (address, pubKey) => {
  const apiEndpoints = [
    {
      url: `${WHATS_ON_CHAIN_ADDRESS_BALANCE_API}/main/address/${address}/unspent`,
      transform: data =>
        data.map(utxo => ({
          txid: utxo.tx_hash,
          vout: utxo.tx_pos,
          satoshis: utxo.value,
        })),
    },
    {
      url: `${BITAILS_ADDRESS_BALANCE_API}/${address}/unspent`,
      transform: data =>
        data.unspent.map(utxo => ({
          txid: utxo.txid,
          vout: utxo.vout,
          satoshis: utxo.satoshis,
        })),
    },
  ];

  try {
    // 尝试从第一个API获取，如果失败则尝试第二个
    let response = await fetch(apiEndpoints[0].url);
    if (!response.ok) {
      console.warn(`API ${apiEndpoints[0].url} failed. Falling back to next API.`);
      response = await fetch(apiEndpoints[1].url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    }
    const data = await response.json();
    const utxos = apiEndpoints[0].transform(data); // Use transform from the first endpoint as a default
    return utxos;
  } catch (error) {
    console.error('Failed to get UTXOs from any API:', error);
    return [];
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
};
