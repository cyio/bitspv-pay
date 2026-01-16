import { P2PKH, PublicKey } from '@bsv/sdk';

function getPublicKeyFromScriptSig(scriptSigHex) {
  // This is a simplified parser. For robust production use, a full-fledged script parser is recommended.
  try {
    // A typical P2PKH scriptSig has: [sig length] [sig] [pubkey length] [pubkey]
    // We are interested in the last part, the public key.
    // A compressed public key is 33 bytes (66 hex chars), starting with 0x02 or 0x03.
    // An uncompressed public key is 65 bytes (130 hex chars), starting with 0x04.

    // Let's find the last potential pubkey in the script.
    // Check for uncompressed key first
    if (scriptSigHex.length >= 130) {
      const potentialPubKey = scriptSigHex.slice(-130);
      if (potentialPubKey.startsWith('04')) {
        // Simple validation, not exhaustive
        PublicKey.fromString(potentialPubKey);
        return potentialPubKey;
      }
    }
    // Check for compressed key
    if (scriptSigHex.length >= 66) {
      const potentialPubKey = scriptSigHex.slice(-66);
      if (potentialPubKey.startsWith('02') || potentialPubKey.startsWith('03')) {
        // Simple validation, not exhaustive
        PublicKey.fromString(potentialPubKey);
        return potentialPubKey;
      }
    }
    
    // Fallback for scripts that might be structured differently, trying to parse TLV
    let pos = 0;
    let lastPart = '';
    while(pos < scriptSigHex.length) {
        const len = parseInt(scriptSigHex.substr(pos, 2), 16);
        pos += 2;
        if (isNaN(len) || pos + len * 2 > scriptSigHex.length) break;
        lastPart = scriptSigHex.substr(pos, len * 2);
        pos += len * 2;
    }
    if (lastPart) {
        try {
            PublicKey.fromString(lastPart);
            return lastPart;
        } catch(e) {
            // not a valid pubkey
        }
    }


    throw new Error('Could not reliably extract public key from scriptSig');
  } catch (error) {
    // console.error('Error extracting public key from scriptSig:', error.message);
    return null;
  }
}

/**
 * Formats a single detailed transaction object.
 * @param {Object} tx - The detailed transaction object from the API.
 * @param {string} currentPubKeyHex - The hex string of the current wallet's public key.
 * @param {string} currentWalletAddress - The address string of the current wallet.
 * @returns {Object} A formatted transaction record.
 */
export function formatSingleTransaction(tx, currentPubKeyHex, currentWalletAddress) {
  if (!tx || typeof tx !== 'object') {
    return null;
  }

  const { vin, vout, txid, time, blockheight } = tx;

  let totalValueIn = 0;
  let totalValueOut = 0;
  let ourValueIn = 0;
  let ourValueOut = 0;
  let isSpending = false;

  for (const input of vin) {
    const inputValue = Math.round(input.value * 100000000);
    totalValueIn += inputValue;
    const inputPubKey = getPublicKeyFromScriptSig(input.scriptSig?.hex);
    if (inputPubKey && inputPubKey === currentPubKeyHex) {
      isSpending = true;
      ourValueIn += inputValue;
    }
  }

  for (const output of vout) {
    const outputValue = Math.round(output.value * 100000000);
    totalValueOut += outputValue;
    if (output.scriptPubKey?.addresses?.includes(currentWalletAddress)) {
      ourValueOut += outputValue;
    }
  }

  let type, amountSatoshis;

  if (isSpending) {
    // We are spending. The amount is the value we sent to others.
    // This is our total input value minus what we received back as change.
    const change = ourValueOut;
    amountSatoshis = ourValueIn - change;
    // But if we sent to ourselves, it's an income of 0 (or just the fee)
    // Let's refine: Amount is what was sent to addresses other than our own.
    let sentToOthers = 0;
    for (const output of vout) {
        if (!output.scriptPubKey?.addresses?.includes(currentWalletAddress)) {
            sentToOthers += Math.round(output.value * 100000000);
        }
    }
    amountSatoshis = sentToOthers > 0 ? sentToOthers : ourValueIn - ourValueOut;
    type = 'expense';
    
  } else {
    // We are receiving. The amount is what we received.
    amountSatoshis = ourValueOut;
    type = 'income';
  }

  // If after all calculations, the amount is 0, it might be an internal transfer or data tx
  if (amountSatoshis === 0 && ourValueOut > 0 && isSpending) {
    type = 'data/internal'; // E.g., sending to self
  } else if (amountSatoshis === 0 && !isSpending && ourValueOut > 0) {
    type = 'income'; // It's a valid income even if the final amount is 0 after some logic
  } else if (amountSatoshis < 0) {
    // This can happen due to fees. For expenses, we show the amount sent, not including fees.
    // For now, let's show the absolute value.
     amountSatoshis = Math.abs(amountSatoshis);
  }


  return {
    txid: txid,
    type: type,
    amount: amountSatoshis / 100000000,
    time: time,
    status: blockheight > 0 ? 'confirmed' : 'unconfirmed',
    relatedAddress: 'N/A', // Simplified for now
    op_return:
      vout.find(o => o.scriptPubKey.asm.startsWith('OP_0 OP_RETURN'))?.scriptPubKey.hex || '',
  };
}
