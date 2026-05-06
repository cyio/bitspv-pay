import { Transaction, PrivateKey, Script, P2PKH, LivePolicy } from '@bsv/sdk';
import { MOCK_DRY_RUN_WIF } from './constants';
import { PaymailClient } from '@bsv/paymail/client';
import { getGoogleReachable } from './network';
import { broadcastTransaction } from './api';

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

        tx.addOutput({
            lockingScript: new P2PKH().lock(address),
            change: true,
        });

        let satsIn = 0;
        let fee = 0;
        const feeModel = new LivePolicy();
        const P2PKH_INPUT_SIZE = 148;
        const minimumFeeForOneInput = Math.ceil(feeModel.value * (P2PKH_INPUT_SIZE / 1000));

        if (!utxos || utxos.length === 0) {
            fee = (await feeModel.computeFee(tx)) + minimumFeeForOneInput;
        }

        // 所有 UTXO 属于同一地址，locking script 统一重建，无需网络获取 source TX
        const lockingScript = new P2PKH().lock(address);

        for (const utxo of utxos || []) {
            const stubTx = new Transaction();
            stubTx.outputs = Array(utxo.vout + 1).fill(null);
            stubTx.outputs[utxo.vout] = { satoshis: Number(utxo.satoshis), lockingScript };

            tx.addInput({
                sourceTXID: utxo.txid,
                sourceTransaction: stubTx,
                sourceOutputIndex: utxo.vout,
                unlockingScriptTemplate: new P2PKH().unlock(privateKey),
            });
            satsIn += Number(utxo.satoshis);
            fee = Math.max(await feeModel.computeFee(tx), minimumFeeForOneInput);
            if (satsIn >= satsOut + fee) break;
        }
        
        const requiredFee = fee;
        const totalRequired = satsOut + requiredFee;

        if (satsIn < totalRequired) {
            const err = `Insufficient funds. Needed ${totalRequired}, found ${satsIn}.`;
            if (addLog && !dryRun) addLog(err, 'warn');
            return {
                error: 'insufficient-funds',
                totalRequired,
                requiredFee,
                available: satsIn,
            };
        }

        if (dryRun) {
            return { error: 0, requiredFee, totalRequired };
        }
        
        if (addLog) addLog(`Transaction constructed. Fee: ${requiredFee} sats. Signing...`, 'info');
        await tx.fee(requiredFee);
        await tx.sign();

        const txHex = tx.toHex();
        if (addLog) addLog('Broadcasting transaction...', 'info');
        const broadcastResult = await tx.broadcast();

        if (broadcastResult.status === 'success' && broadcastResult.txid) {
            if (addLog) addLog(`Transaction broadcast successful! TXID: ${broadcastResult.txid}`, 'success');
            if (paymailRefs.length > 0) {
                for (const ref of paymailRefs) {
                    try {
                        if (addLog) addLog(`Notifying Paymail P2P server: ${ref.paymail}...`, 'info');
                        const walletName = 'BitSPV.com';
                        const metadata = {
                            sender: `${walletName} - ${address.substring(0, 4)}...${address.substring(address.length - 4)}`,
                            note: `P2P tx from ${walletName}`
                        };
                        await client.sendTransactionP2P(ref.paymail, txHex, ref.reference, metadata);
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
 * 热端：构建未签名交易，返回可序列化的 PSBT payload。
 * 不需要私钥，不需要联网（无 source TX 获取）。
 * fee 用 P2PKH 固定尺寸手动估算。
 */
export const buildUnsignedTx = (utxos, request, { address, addLog }) => {
    if (!request || !Array.isArray(request) || request.length === 0) {
        return { error: 'invalid-request', message: 'Payment details are missing or invalid.' };
    }

    try {
        const feeModel = new LivePolicy();
        // P2PKH 固定尺寸：input 148B, output 34B, overhead 10B
        const INPUT_SIZE = 148;
        const OUTPUT_SIZE = 34;
        const OVERHEAD = 10;

        const satsOut = request.reduce((s, r) => s + r.satoshis, 0);
        const numOutputs = request.length + 1; // +1 找零

        const selectedUtxos = [];
        let satsIn = 0;

        for (const utxo of utxos || []) {
            selectedUtxos.push({ txid: utxo.txid, vout: utxo.vout, satoshis: Number(utxo.satoshis) });
            satsIn += Number(utxo.satoshis);

            const txBytes = selectedUtxos.length * INPUT_SIZE + numOutputs * OUTPUT_SIZE + OVERHEAD;
            const fee = Math.max(Math.ceil(feeModel.value * txBytes / 1000), 1);

            if (satsIn >= satsOut + fee) {
                if (addLog) addLog(`PSBT built: ${selectedUtxos.length} inputs, fee ${fee} sats`, 'info');
                return {
                    error: 0,
                    psbtPayload: { address, request, utxos: selectedUtxos, fee, createdAt: Date.now() },
                };
            }
        }

        const txBytes = selectedUtxos.length * INPUT_SIZE + numOutputs * OUTPUT_SIZE + OVERHEAD;
        const fee = Math.max(Math.ceil(feeModel.value * txBytes / 1000), 1);
        return { error: 'insufficient-funds', message: `Insufficient funds. Needed ${satsOut + fee}, found ${satsIn}.`, totalRequired: satsOut + fee };
    } catch (err) {
        return { error: 'build-error', message: err.message };
    }
};

/**
 * 冷端：对 PSBT payload 进行签名，返回已签名的 tx hex。
 * 纯离线，不需要网络。
 *
 * 用 stub sourceTransaction（只含目标 output），sourceTXID 手动设为真实 txid。
 * 依据：SDK 签名时只读 sourceTransaction.outputs[vout].{satoshis, lockingScript}，
 * 与 sourceTransaction 本身的 hash 无关（txid 从 sourceTXID 字段单独读取）。
 */
export const signPsbt = async (psbtPayload, privateKey) => {
    try {
        const { address, request, utxos, fee } = psbtPayload;
        const tx = new Transaction();

        for (const req of request) {
            if (req.address) {
                tx.addOutput({ satoshis: req.satoshis, lockingScript: new P2PKH().lock(req.address) });
            } else if (req.script) {
                tx.addOutput({ satoshis: req.satoshis, lockingScript: Script.fromHex(req.script) });
            } else if ((req.data || []).length > 0) {
                const asm = `OP_0 OP_RETURN ${req.data.join(' ')}`;
                tx.addOutput({ satoshis: req.satoshis, lockingScript: Script.fromASM(asm) });
            }
        }

        tx.addOutput({ lockingScript: new P2PKH().lock(address), change: true });

        // 所有 UTXO 都属于同一地址，locking script 统一重建
        const lockingScript = new P2PKH().lock(address);

        for (const utxo of utxos) {
            // 构造 stub：outputs 数组长度恰好为 vout+1，前面填 null，目标位置放真实 output
            const stubTx = new Transaction();
            stubTx.outputs = Array(utxo.vout + 1).fill(null);
            stubTx.outputs[utxo.vout] = { satoshis: utxo.satoshis, lockingScript };

            tx.addInput({
                sourceTXID: utxo.txid,       // 真实 txid，用于 sighash outpoint
                sourceTransaction: stubTx,    // 仅供 SDK 读取 satoshis/lockingScript
                sourceOutputIndex: utxo.vout,
                unlockingScriptTemplate: new P2PKH().unlock(privateKey),
            });
        }

        await tx.fee(fee);
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
export const broadcastSignedTx = async (txHex, { address, paymailRefs = [], addLog } = {}) => {
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
                    const walletName = 'BitSPV.com';
                    for (const ref of paymailRefs) {
                        try {
                            const metadata = {
                                sender: `${walletName} - ${address.substring(0, 4)}...${address.substring(address.length - 4)}`,
                                note: `P2P tx from ${walletName}`,
                            };
                            await client.sendTransactionP2P(ref.paymail, txHex, ref.reference, metadata);
                            if (addLog) addLog(`Paymail P2P notification sent for ${ref.paymail}.`, 'success');
                        } catch (e) {
                            // P2P 通知失败不影响交易本身，仅记录日志
                            if (addLog) addLog(`Paymail P2P notification failed for ${ref.paymail} (non-fatal): ${e.message}`, 'warn');
                            console.warn(`Failed to send P2P transaction to ${ref.paymail}:`, e);
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
