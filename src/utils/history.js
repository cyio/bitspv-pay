import { P2PKH, PublicKey } from '@bsv/sdk';
import { getSourceAddressFromTx, fetchAddressTransactions } from './api';

function convertSatoshisToBSV(satoshis) {
  const bsv = satoshis / 100000000;
  return bsv.toFixed(8);
}

function getPublicKeyFromScriptSig(scriptSigHex) {
  try {
    let pos = 0;
    if (pos < scriptSigHex.length) {
      const sigLength = parseInt(scriptSigHex.substr(pos, 2), 16);
      pos += 2 + (sigLength * 2);
    }
    if (pos < scriptSigHex.length) {
      const pubKeyLength = parseInt(scriptSigHex.substr(pos, 2), 16);
      pos += 2;
      if (pubKeyLength === 33 && pos + (pubKeyLength * 2) <= scriptSigHex.length) {
        const publicKeyHex = scriptSigHex.substr(pos, pubKeyLength * 2);
        if (publicKeyHex.startsWith('02') || publicKeyHex.startsWith('03')) {
          return publicKeyHex;
        }
      }
    }
    throw new Error('Could not extract public key from scriptSig');
  } catch (error) {
    console.error('Error extracting public key from scriptSig:', error.message);
    return null;
  }
}

/**
 * 格式化单个交易对象，判断交易类型、金额和关联地址。
 * @param {Object} tx - 完整的交易对象。
 * @param {string} currentPublicKey - 当前钱包的公钥，用于判断交易类型。
 * @returns {Object} 格式化后的交易记录。
 */
function formatSingleTransaction(tx, currentPublicKey, currentWalletAddress) {
  let type = 'unknown';
  let amount = 0;
  let relatedAddress = '';
  let op_return = '';

  const formattedTime = tx.time ? new Date(tx.time * 1000).toLocaleString() : 'Unknown';

  if (tx.vout) {
    const opReturnOutput = tx.vout.find(
      output => output.scriptPubKey && output.scriptPubKey.type === 'nulldata'
    );
    if (opReturnOutput && opReturnOutput.scriptPubKey && opReturnOutput.scriptPubKey.asm) {
      op_return = opReturnOutput.scriptPubKey.asm.replace('OP_RETURN ', '');
    }
  }

  if (tx.vout && tx.vin) {
    const receivingOutputs = tx.vout.filter(
      output =>
        output.scriptPubKey &&
        output.scriptPubKey.addresses &&
        output.scriptPubKey.addresses.includes(currentWalletAddress)
    );

    const isExpense = receivingOutputs.length === 0 && tx.vin.length > 0 && !tx.vin[0].coinbase;

    if (receivingOutputs.length > 0) {
      type = 'income';
      amount = receivingOutputs.reduce((sum, output) => sum + output.value, 0);

      let senderPublicKeyFromVin = '未知来源';
      if (tx.vin && tx.vin.length > 0) {
        senderPublicKeyFromVin = getPublicKeyFromScriptSig(tx.vin[0].scriptSig.hex);
      }
      relatedAddress = senderPublicKeyFromVin;

      if (receivingOutputs.length > 0 && senderPublicKeyFromVin === currentPublicKey) {
        type = 'expense';
        const sentToOthersOutputs = tx.vout.filter(
          output =>
            output.scriptPubKey &&
            output.scriptPubKey.addresses &&
            !output.scriptPubKey.addresses.includes(currentWalletAddress)
        );
        amount = sentToOthersOutputs.reduce((sum, output) => sum + output.value, 0);

        if (sentToOthersOutputs.length > 0) {
          relatedAddress = sentToOthersOutputs[0].scriptPubKey.addresses[0];
        } else {
          relatedAddress = 'N/A (内部转账)';
        }
      }
    } else if (isExpense) {
      type = 'expense';
      if (tx.vout.length > 0 && tx.vout[0].scriptPubKey && tx.vout[0].scriptPubKey.addresses) {
        amount = tx.vout[0].value;
        relatedAddress = tx.vout[0].scriptPubKey.addresses[0];
      } else {
        amount = 0;
        relatedAddress = '未知接收方';
      }
    } else {
      type = 'data/internal';
      amount = 0;
      relatedAddress = 'N/A';
    }
  }

  return {
    txid: tx.txid,
    type: type,
    amount: typeof amount === 'number' ? convertSatoshisToBSV(amount * 100000000) : amount,
    time: formattedTime,
    status: tx.blockheight > 0 ? 'confirmed' : 'unconfirmed',
    relatedAddress: relatedAddress,
    op_return: op_return,
  };
}

/**
 * 获取指定地址的交易历史，并进行格式化。
 * @param {string} address - 要查询的地址。
 * @param {string} currentPublicKey - 当前钱包的公钥，用于判断交易类型（收入/支出）。
 * @returns {Promise<Array>} 格式化的交易记录数组。
 */
async function getTransactionsByAddress(address, currentPublicKey) {
  try {
    const rawTransactions = await fetchAddressTransactions(address);
    const formattedTransactions = [];

    let currentWalletAddress = null;
    try {
      currentWalletAddress = P2PKH.fromPublicKey(PublicKey.fromString(currentPublicKey)).toAddress().toString();
    } catch (e) {
      console.error('Invalid currentPublicKey provided to getTransactionsByAddress:', e);
      return [];
    }

    for (const tx of rawTransactions) {
      let type = 'unknown';
      let amount = tx.value;
      let relatedAddress = '';

      if (tx.value > 0) {
        type = 'income';
        try {
          const txDetail = await getSourceAddressFromTx(tx.txid);
          if (txDetail && txDetail.vin && txDetail.vin.length > 0) {
            const senderPublicKey = getPublicKeyFromScriptSig(txDetail.vin[0].scriptSig.hex);
            if (senderPublicKey === currentPublicKey) {
              type = 'data/internal';
              relatedAddress = 'N/A (内部转账)';
            } else {
              relatedAddress = txDetail.vin[0].addr || '未知来源';
            }
          }
        } catch (detailError) {
          console.warn(`无法获取交易 ${tx.txid} 的详细信息以确定来源地址:`, detailError);
          relatedAddress = '未知来源';
        }
      } else if (tx.value < 0) {
        type = 'expense';
        amount = Math.abs(tx.value);
        try {
          const txDetail = await getSourceAddressFromTx(tx.txid);
          if (txDetail && txDetail.vout && txDetail.vout.length > 0) {
            const recipientOutput = txDetail.vout.find(
              output =>
                output.scriptPubKey &&
                output.scriptPubKey.addresses &&
                output.scriptPubKey.addresses[0] !== currentWalletAddress
            );
            if (recipientOutput) {
              relatedAddress = recipientOutput.scriptPubKey.addresses[0] || '未知接收方';
            } else {
              relatedAddress = '未知接收方';
            }
          }
        } catch (detailError) {
          console.warn(`无法获取交易 ${tx.txid} 的详细信息以确定接收方地址:`, detailError);
          relatedAddress = '未知接收方';
        }
      } else {
        type = 'data/internal';
        amount = 0;
        relatedAddress = 'N/A';
      }

      formattedTransactions.push({
        txid: tx.txid,
        type: type,
        amount: convertSatoshisToBSV(amount),
        time: new Date(tx.time * 1000).toLocaleString(),
        status: tx.height > 0 ? 'confirmed' : 'unconfirmed',
        relatedAddress: relatedAddress,
        op_return: tx.op_return,
      });
    }
    return formattedTransactions;
  } catch (error) {
    console.error('Error in getTransactionsByAddress:', error);
    throw error;
  }
}

export {
  getTransactionsByAddress,
  formatSingleTransaction,
};
