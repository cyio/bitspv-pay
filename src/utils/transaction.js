import { Transaction, PrivateKey, Script, P2PKH, LivePolicy } from '@bsv/sdk';
import { MOCK_DRY_RUN_WIF } from './constants';
import { getSourceTransaction } from './api';
import { PaymailClient } from '@bsv/paymail/client';
import { getGoogleReachable } from './network';

const sourceTxCache = new Map();

export const processRefund = async (utxos, request, { privateKey, dryRun = false, t, pubKey, address, setStatus, setStatusMessage }) => {
    if (!request || !Array.isArray(request) || request.length === 0) {
        console.error('Invalid payment request provided to processRefund:', request);
        return { error: 'invalid-request', message: 'Payment details are missing or invalid.' };
    }

    try {
        if (dryRun && !privateKey) {
            privateKey = PrivateKey.fromWif(MOCK_DRY_RUN_WIF);
        }

        if (!privateKey) {
            const errorMsg = t('bsvPayment.statusMessages.errors.privateKeyNotFound');
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
                    const p2pDestination = await client.getP2pPaymentDestination(req.paymail, req.satoshis);
                    if (p2pDestination && p2pDestination.outputs && p2pDestination.outputs.length > 0) {
                        paymailRefs.push({ paymail: req.paymail, reference: p2pDestination.reference });
                        for (const output of p2pDestination.outputs) {
                            tx.addOutput({
                                satoshis: output.satoshis,
                                lockingScript: Script.fromHex(output.script),
                            });
                        }
                    } else {
                        return { error: 'paymail-resolve-failed', message: `Failed to resolve paymail ${req.paymail}` };
                    }
                } catch (e) {
                    return { error: 'paymail-resolve-error', message: `Error during paymail resolution for ${req.paymail}: ${e.message}` };
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

        for (const utxo of utxos || []) {
            let sourceTxHex = sourceTxCache.get(utxo.txid);
            if (!sourceTxHex) {
                sourceTxHex = await getSourceTransaction(utxo.txid);
                if (sourceTxHex) {
                    sourceTxCache.set(utxo.txid, sourceTxHex);
                } else {
                    return { error: 'source-tx-not-found', message: `Could not find source transaction ${utxo.txid}` };
                }
            }
            const sourceTransaction = Transaction.fromHex(sourceTxHex);
            tx.addInput({
                sourceTransaction,
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
        
        await tx.fee(requiredFee);
        await tx.sign();

        const txHex = tx.toHex();
        const broadcastResult = await tx.broadcast();

        if (broadcastResult.status === 'success' && broadcastResult.txid) {
            if (paymailRefs.length > 0) {
                for (const ref of paymailRefs) {
                    try {
                        const walletName = 'BitSPV.com';
                        const metadata = {
                            sender: `${walletName} - ${address.substring(0, 4)}...${address.substring(address.length - 4)}`,
                            note: `P2P tx from ${walletName}`
                        };
                        await client.sendTransactionP2P(ref.paymail, txHex, ref.reference, metadata);
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
