import { Transaction, PrivateKey, Script, P2PKH, LivePolicy, SatoshisPerKilobyte, Hash } from '@bsv/sdk';
import { MOCK_DRY_RUN_WIF } from './constants';
import { PaymailClient } from '@bsv/paymail/client';
import { getGoogleReachable } from './network';
import { broadcastTransaction, getSourceTransaction, fetchMinerFee } from './api';

const sourceTxCache = new Map();

export const processRefund = async (utxos, request, { privateKey, dryRun = false, t, pubKey, address, setStatus, setStatusMessage, addLog }) => {
    if (!request || !Array.isArray(request) || request.length === 0) {
        const msg = 'Payment details are missing or invalid.';
        console.error('Invalid payment request provided to processRefund:', request);
        if (addLog) addLog(msg, 'error');
        return { error: 'invalid-request', message: msg };
    }

    try {
        if (dryRun && !privateKey) {
            privateKey = PrivateKey.fromWif(MOCK_DRY_RUN_WIF);
        }

        if (!privateKey) {
            const errorMsg = t('bsvPayment.statusMessages.errors.privateKeyNotFound');
            if (addLog) addLog(errorMsg, 'error');
            if (!dryRun) {
                setStatus('error');
                setStatusMessage(errorMsg);
            }
            return { error: 'private-key-not-loaded', message: errorMsg, continuePolling: false };
        }

        // Now that we have the private key, we can set the status to 'processing'.
        if (!dryRun) {
            setStatus('processing');
            setStatusMessage(t('bsvPayment.statusMessages.processStatus.processing'));
            if (addLog) addLog('Starting transaction construction...', 'info');
        }

        let client;
        if (getGoogleReachable() === false) {
            const dnsOptions = {
                dohServerBaseUrl: 'https://223.5.5.5/resolve'
            };
            client = new PaymailClient(undefined, dnsOptions);
        } else {
            client = new PaymailClient();
        }
        const tx = new Transaction();
        let satsOut = 0;
        const paymailRefs = [];

        for (const req of request) {
            satsOut += req.satoshis;

            if (req.address) {
                const outScript = new P2PKH().lock(req.address);
                tx.addOutput({ satoshis: req.satoshis, lockingScript: outScript });
            } else if (req.paymail) {
                try {
                    if (addLog) addLog(`Resolving Paymail: ${req.paymail}...`, 'info');
                    const p2pDestination = await client.getP2pPaymentDestination(req.paymail, req.satoshis);
                    if (p2pDestination && p2pDestination.outputs && p2pDestination.outputs.length > 0) {
                        if (addLog) addLog(`Paymail ${req.paymail} resolved successfully.`, 'success');
                        paymailRefs.push({ paymail: req.paymail, reference: p2pDestination.reference });
                        for (const output of p2pDestination.outputs) {
                            tx.addOutput({
                                satoshis: output.satoshis,
                                lockingScript: Script.fromHex(output.script),
                            });
                        }
                    } else {
                        const err = `Failed to resolve paymail ${req.paymail}`;
                        if (addLog) addLog(err, 'error');
                        return { error: 'paymail-resolve-failed', message: err };
                    }
                } catch (e) {
                    const err = `Error during paymail resolution for ${req.paymail}: ${e.message}`;
                    if (addLog) addLog(err, 'error');
                    return { error: 'paymail-resolve-error', message: err };
                }
            } else if (req.script) {
                const outScript = Script.fromHex(req.script);
                tx.addOutput({ satoshis: req.satoshis, lockingScript: outScript });
            } else if ((req.data || []).length > 0) {
                const asm = `OP_0 OP_RETURN ${req.data?.join(' ')}`;
                const outScript = Script.fromASM(asm);
                tx.addOutput({ satoshis: req.satoshis, lockingScript: outScript });
            } else {
                return { error: 'invalid-request', message: 'Invalid output format.' };
            }
        }

        let satsIn = 0;
        let fee = 0;
        const feeModel = new LivePolicy();
        // const feeModel = new SatoshisPerKilobyte(await fetchMinerFee());
        const P2PKH_INPUT_SIZE = 148;
        const minimumFeeForOneInput = Math.ceil(feeModel.value * (P2PKH_INPUT_SIZE / 1000));

        for (const utxo of utxos || []) {
            let sourceTxHex = sourceTxCache.get(utxo.txid);
            if (!sourceTxHex) {
                sourceTxHex = await getSourceTransaction(utxo.txid);
                if (sourceTxHex) {
                    sourceTxCache.set(utxo.txid, sourceTxHex);
                } else {
                    const err = `Could not find source transaction ${utxo.txid}`;
                    if (addLog) addLog(err, 'error');
                    return { error: 'source-tx-not-found', message: err };
                }
            }
            const sourceTransaction = Transaction.fromHex(sourceTxHex);
            tx.addInput({
                sourceTXID: utxo.txid,
                sourceTransaction,
                sourceOutputIndex: utxo.vout,
                unlockingScriptTemplate: new P2PKH().unlock(privateKey),
            });
            satsIn += Number(utxo.satoshis);

            // Re-calculate fee. We calculate it WITHOUT change output first.
            fee = Math.max(await feeModel.computeFee(tx), minimumFeeForOneInput);

            if (satsIn >= satsOut + fee) {
                // Check if we need a change output
                const changeAmountBeforeOutput = satsIn - (satsOut + fee);

                // Only attempt to add change if we have more than a tiny bit of dust
                if (changeAmountBeforeOutput > 0) {
                    tx.addOutput({ lockingScript: new P2PKH().lock(address), change: true });
                    const feeWithChange = Math.max(await feeModel.computeFee(tx), minimumFeeForOneInput);

                    if (satsIn >= satsOut + feeWithChange && (satsIn - (satsOut + feeWithChange)) > 0) {
                        fee = feeWithChange;
                    } else {
                        tx.outputs.pop();
                    }
                }
                break;
            }
        }

        const requiredFee = fee;
        const totalRequired = satsOut + requiredFee;

        if (satsIn < totalRequired) {
            const err = `Insufficient funds. Needed ${totalRequired}, found ${satsIn}. (satsOut: ${satsOut}, fee: ${fee}, outputs: ${tx.outputs.length})`;
            console.log(`[DEBUG] processRefund Insufficient Funds:`, {
                satsIn,
                satsOut,
                fee,
                requiredFee,
                totalRequired,
                outputCount: tx.outputs.length,
                outputs: tx.outputs.map(o => ({ satoshis: o.satoshis, change: o.change }))
            });
            if (addLog && !dryRun) addLog(err, 'warn');
            return {
                error: 'insufficient-funds',
                message: `Insufficient funds. Needed ${totalRequired}, found ${satsIn}.`,
                totalRequired: totalRequired,
                continuePolling: false
            };
        }

        await tx.fee(fee);

        if (dryRun) {
            return { error: 0, fee, requiredFee: fee, satsOut, total: satsOut + fee };
        }

        await tx.sign();

        if (addLog) addLog('Broadcasting transaction...', 'info');
        const broadcastResult = await tx.broadcast();

        if (broadcastResult.status === 'success' && broadcastResult.txid) {
            if (addLog) addLog(`Transaction broadcast successful! TXID: ${broadcastResult.txid}`, 'success');
            if (paymailRefs.length > 0) {
                for (const ref of paymailRefs) {
                    try {
                        if (addLog) addLog(`Notifying Paymail P2P server: ${ref.paymail}...`, 'info');
                        const walletName = 'pay.BitSPV.com';
                        const metadata = {
                            sender: `${walletName} - ${address.substring(0, 4)}...${address.substring(address.length - 4)}`,
                            note: `P2P tx from ${walletName}`
                        };
                        await client.sendTransactionP2P(ref.paymail, tx.toHex(), ref.reference, metadata);
                        if (addLog) addLog(`Paymail P2P notification sent for ${ref.paymail}.`, 'success');
                    } catch (p2pError) {
                        console.error(`Failed to send P2P transaction to ${ref.paymail}:`, p2pError);
                    }
                }
            }
            setStatus('completed');
            setStatusMessage(t('bsvPayment.statusMessages.processStatus.success'));
            return { error: 0, txid: broadcastResult.txid };
        } else {
            if (broadcastResult.competingTxs && broadcastResult.competingTxs.length > 0) {
                const errorMessage = t('bsvPayment.statusMessages.errors.networkCongestion');
                throw new Error(errorMessage);
            }
            const errorMessage = broadcastResult.error || broadcastResult.message || broadcastResult.status || 'Unknown broadcast error';
            throw new Error(`Broadcast failed: ${errorMessage}`);
        }
    } catch (error) {
        console.error('Failed to process transaction:', error);
        const errorMessage = error.message || String(error);
        if (!dryRun) {
            setStatus('error');
            setStatusMessage(errorMessage);
        }
        return { error: 'processing-error', message: errorMessage, continuePolling: false };
    }
};

// ─── Air-gap helpers ──────────────────────────────────────────────────────────

/**
 * 热端：构建未签名交易，序列化为 hex 写入 payload。
 * 用 MOCK key + SDK computeFee 准确估算 fee，tx.fee() 后序列化（未签名）。
 * 同时拉取 source TX 获取真实 lockingScript，写入 payload 供冷端签名使用。
 */
export const buildUnsignedTx = async (utxos, request, { address, addLog }) => {
    if (!request || !Array.isArray(request) || request.length === 0) {
        return { error: 'invalid-request', message: 'Payment details are missing or invalid.' };
    }

    try {
        const mockPrivKey = PrivateKey.fromWif(MOCK_DRY_RUN_WIF);
        const feeModel = new SatoshisPerKilobyte(await fetchMinerFee());
        const minimumFee = Math.ceil(feeModel.value * (148 / 1000));

        const tx = new Transaction();
        let satsOut = 0;

        for (const req of request) {
            satsOut += req.satoshis;
            if (req.address) {
                tx.addOutput({ satoshis: req.satoshis, lockingScript: new P2PKH().lock(req.address) });
            } else if (req.script) {
                tx.addOutput({ satoshis: req.satoshis, lockingScript: Script.fromHex(req.script) });
            }
        }
        tx.addOutput({ lockingScript: new P2PKH().lock(address), change: true });

        const selectedUtxos = [];
        let satsIn = 0;

        for (const utxo of utxos || []) {
            let lockingScriptHex = null;
            try {
                let sourceTxHex = sourceTxCache.get(utxo.txid);
                if (!sourceTxHex) {
                    sourceTxHex = await getSourceTransaction(utxo.txid);
                    if (sourceTxHex) sourceTxCache.set(utxo.txid, sourceTxHex);
                }
                if (sourceTxHex) {
                    const sourceTx = Transaction.fromHex(sourceTxHex);
                    lockingScriptHex = sourceTx.outputs[utxo.vout].lockingScript.toHex();
                }
            } catch (e) {
                if (addLog) addLog(`Failed to fetch source TX for ${utxo.txid}: ${e.message}`, 'warn');
            }

            const lockingScript = lockingScriptHex
                ? Script.fromHex(lockingScriptHex)
                : new P2PKH().lock(address);

            const stubTx = new Transaction();
            stubTx.outputs = Array(utxo.vout + 1).fill(null);
            stubTx.outputs[utxo.vout] = { satoshis: Number(utxo.satoshis), lockingScript };

            tx.addInput({
                sourceTXID: utxo.txid,
                sourceTransaction: stubTx,
                sourceOutputIndex: utxo.vout,
                unlockingScriptTemplate: new P2PKH().unlock(mockPrivKey),
            });

            selectedUtxos.push({ txid: utxo.txid, vout: utxo.vout, satoshis: Number(utxo.satoshis), lockingScript: lockingScriptHex });
            satsIn += Number(utxo.satoshis);

            const fee = Math.max(await feeModel.computeFee(tx), minimumFee);
            if (satsIn >= satsOut + fee) {
                await tx.fee(fee);
                // Pre-fill empty unlockingScript to allow serialization without signing
                tx.inputs.forEach(input => {
                    input.unlockingScript = { toUint8Array: () => new Uint8Array(0) };
                });
                const unsignedTxHex = tx.toHex();
                
                // Generate a random 4-char hex checksum for user verification
                const checksum = Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');

                if (addLog) addLog(`Unsigned TX built: ${selectedUtxos.length} inputs, fee ${fee} sats, checksum: ${checksum}`, 'info');
                return {
                    error: 0,
                    signingRequest: {
                        unsignedTxHex,
                        utxos: selectedUtxos.map(u => ({ 
                            txid: u.txid, 
                            vout: u.vout, 
                            satoshis: u.satoshis, 
                            lockingScript: u.lockingScript || new P2PKH().lock(address).toHex() 
                        })),
                        checksum,
                        createdAt: Date.now()
                    },
                };
            }
        }

        const fee = Math.max(await feeModel.computeFee(tx), minimumFee);
        return { error: 'insufficient-funds', message: `Insufficient funds. Needed ${satsOut + fee}, found ${satsIn}.`, totalRequired: satsOut + fee };
    } catch (err) {
        return { error: 'build-error', message: err.message };
    }
};

/**
 * 冷端：反序列化未签名 tx，附上 source output 上下文后签名。
 * 纯离线，不需要网络。构建 tx 结构的工作已在热端完成。
 */
export const signTransaction = async (signingRequest, privateKey) => {
    try {
        const { unsignedTxHex, utxos } = signingRequest;
        const tx = Transaction.fromHex(unsignedTxHex);

        for (let i = 0; i < utxos.length; i++) {
            const utxo = utxos[i];
            console.log(`[DEBUG] Signing input ${i}: txid=${utxo.txid}, vout=${utxo.vout}`);
            if (typeof utxo.vout !== 'number' || utxo.vout < 0) {
                throw new Error(`Invalid vout: ${utxo.vout}`);
            }

            const lockingScript = Script.fromHex(utxo.lockingScript);

            const stubTx = new Transaction();
            console.log(`[DEBUG] Creating stubTx outputs for vout ${utxo.vout}`);
            stubTx.outputs = Array(utxo.vout + 1).fill(null);
            stubTx.outputs[utxo.vout] = { satoshis: utxo.satoshis, lockingScript };

            if (!tx.inputs[i]) {
                throw new Error(`Input index ${i} does not exist in tx. Inputs length: ${tx.inputs.length}`);
            }

            tx.inputs[i].sourceTransaction = stubTx;
            tx.inputs[i].unlockingScriptTemplate = new P2PKH().unlock(privateKey);
        }

        await tx.sign();
        return { error: 0, txHex: tx.toHex() };
    } catch (err) {
        return { error: 'sign-error', message: err.message };
    }
};

/**
 * 热端：广播已签名 tx hex。
 *
 * @param {string}   txHex
 * @param {Object}   opts
 * @param {string}   opts.address       发送方地址（仅用于 Paymail 元数据）
 * @param {Array}    [opts.paymailRefs] Paymail P2P 通知列表 [{ paymail, reference }]
 * @param {Function} [opts.addLog]
 * @returns {Promise<{error: 0, txid: string} | {error: string, message: string}>}
 */
export const broadcastSignedTx = async (txHex, { address, paymailRefs = [], addLog, onPaymailWarning } = {}) => {
    try {
        const tx = Transaction.fromHex(txHex);
        if (addLog) addLog('Broadcasting signed transaction...', 'info');
        const broadcastResult = await tx.broadcast();

        if (broadcastResult.status === 'success' && broadcastResult.txid) {
            if (addLog) addLog(`Broadcast successful! TXID: ${broadcastResult.txid}`, 'success');

            // P2P 通知异步执行，不阻塞返回，不影响 txid 结果
            if (paymailRefs.length > 0) {
                (async () => {
                    let client;
                    if (getGoogleReachable() === false) {
                        client = new PaymailClient(undefined, { dohServerBaseUrl: 'https://223.5.5.5/resolve' });
                    } else {
                        client = new PaymailClient();
                    }
                    const walletName = 'pay.BitSPV.com';
                    for (const ref of paymailRefs) {
                        try {
                            const metadata = {
                                sender: `${walletName} - ${address.substring(0, 4)}...${address.substring(address.length - 4)}`,
                                note: `P2P tx from ${walletName}`,
                            };
                            await client.sendTransactionP2P(ref.paymail, txHex, ref.reference, metadata);
                            if (addLog) addLog(`Paymail P2P notification sent for ${ref.paymail}.`, 'success');
                        } catch (e) {
                            if (addLog) addLog(`Paymail P2P notification failed for ${ref.paymail} (non-fatal): ${e.message}`, 'warn');
                            console.warn(`Failed to send P2P transaction to ${ref.paymail}:`, e);
                            if (onPaymailWarning) onPaymailWarning(ref.paymail);
                        }
                    }
                })();
            }

            return { error: 0, txid: broadcastResult.txid };
        } else {
            const errorMessage = broadcastResult.error || broadcastResult.message || broadcastResult.status || 'Unknown broadcast error';
            return { error: 'broadcast-failed', message: `Broadcast failed: ${errorMessage}` };
        }
    } catch (err) {
        return { error: 'broadcast-error', message: err.message };
    }
};
