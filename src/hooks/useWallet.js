import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { PrivateKey, PublicKey, Transaction, Script } from '@bsv/sdk';
import { PaymailClient } from '@bsv/paymail/client';
import QRCode from 'qrcode';
import { useStorage } from './useStorage';
import { getUTXOs, getBalance } from '../utils/api';
import { isWeChat } from '../utils';
import { encryptData, decryptData } from '../utils/webauthn';
import { usePinManager } from './usePinManager';
import { getTxExplorerUrl } from '../utils/apiProviderHealth';
import { processRefund } from '../utils/transaction';
import { isValidAddress, isValidPaymail } from '../utils/bsv';
import { useLog, LOG_TYPES } from '../contexts/LogContext';

export function useWallet() {
  const { t } = useTranslation();
  const { addLog } = useLog();
  const storage = useStorage();
  const { promptForPin, showInfo, ensurePrivateKeyLoaded, autoBackupPrivateKeyToFile, generateEncryptedBackupData } = usePinManager();

  const [pubKey, setPubKey] = useState(null);
  const [address, setAddress] = useState('');
  const [qrcode, setQrcode] = useState('');
  const [walletName, setWalletName] = useState(storage.getWalletName() || '');
  const [utxos, setUtxos] = useState([]);
  const [walletBalanceState, setWalletBalanceState] = useState({ confirmed: 0, unconfirmed: 0, total: 0 });
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [transferStatus, setTransferStatus] = useState(null);
  const [transferMessage, setTransferMessage] = useState('');
  const [isWatchOnly, setIsWatchOnly] = useState(storage.getIsWatchOnly());

  const isWalletUiVisible = useMemo(() => !!address, [address]);

  const refreshBalance = useCallback(async (currentAddress) => {
    const addr = currentAddress || address;
    if (!addr) return;
    setIsBalanceLoading(true);
    try {
      const result = await getBalance(addr);
      setWalletBalanceState(result);
      addLog(`Balance refreshed: ${result.total / 100000000} BSV (confirmed: ${result.confirmed}, unconfirmed: ${result.unconfirmed})`, LOG_TYPES.SUCCESS);

      // Fetch the UTXOs together with the balance. Callers (payment flow, air-gap
      // sender) need the actual spendable outputs, and a freshly loaded wallet has
      // none cached yet. A UTXO failure must not break the balance refresh itself.
      let currentUtxos = [];
      try {
        currentUtxos = await getUTXOs(addr);
        setUtxos(currentUtxos);
      } catch (utxoError) {
        const utxoErrorMsg = `refresh UTXOs: ${utxoError.message}`;
        console.error(utxoErrorMsg, utxoError);
        addLog(utxoErrorMsg, LOG_TYPES.ERROR);
      }

      return { ...result, utxos: currentUtxos };
    } catch (error) {
      const errorMsg = `refresh balance: ${error.message}`;
      console.error(errorMsg, error);
      addLog(errorMsg, LOG_TYPES.ERROR);
      return null;
    } finally {
      setIsBalanceLoading(false);
    }
  }, [address, addLog]);

  /**
   * 用 PIN 解开 localStorage 里的加密私钥，并把 pub-key / wallet-address 缓存重建回来。
   *
   * 存在的理由：加密私钥是唯一的事实源，公钥/地址只是它的缓存。老版本一旦丢了缓存
   * （换浏览器、清过 storage、手动删过 key），页面就只打印一行 warn 然后返回一个
   * 没有地址的「成功」，UI 便永远停在 Loading wallet...，而钱包其实完全可恢复。
   * 这里只在需要时提示一次 PIN，成功后把缓存写回去。
   */
  const unlockStoredWallet = useCallback(async () => {
    const { ciphertext, iv, salt } = storage.getEncryptedWifData();
    if (!ciphertext || !iv || !salt) {
      return { error: 'wallet-unrecoverable', message: t('bsvPayment.statusMessages.errors.encryptedDataMissing') };
    }

    try {
      const { pin } = await promptForPin('unlock', { walletAddress: storage.getWalletAddress() || '' });
      if (!pin) {
        return { error: 'wallet-needs-recovery', message: t('bsvPayment.statusMessages.errors.walletRecoveryCancelled') };
      }

      const decryptedWif = await decryptData(ciphertext, iv, salt, pin);
      if (!decryptedWif) {
        return { error: 'wallet-needs-recovery', message: t('bsvPayment.statusMessages.errors.decryptionFailedPinIncorrect') };
      }

      const privKey = PrivateKey.fromWif(decryptedWif);
      const recoveredPubKey = privKey.toPublicKey();
      const recoveredAddress = recoveredPubKey.toAddress().toString();

      storage.setPublicKey(recoveredPubKey.toDER('hex'));
      storage.setWalletAddress(recoveredAddress);

      return { error: 0, privKey, pubKey: recoveredPubKey, address: recoveredAddress };
    } catch (error) {
      if (error && error.cancelled) {
        return { error: 'wallet-needs-recovery', message: t('bsvPayment.statusMessages.errors.walletRecoveryCancelled') };
      }
      console.error('unlockStoredWallet failed:', error);
      return {
        error: 'wallet-needs-recovery',
        message: error.message || t('bsvPayment.statusMessages.errors.decryptionFailedGeneric'),
      };
    }
  }, [storage, promptForPin, t]);

  const createWallet = useCallback(async (options = {}) => {
    console.log('begin createWallet');

    try {
      const { ciphertext: encryptedWif } = storage.getEncryptedWifData();
      const oldPlaintextWif = localStorage.getItem('priv-key');
      const pubKeyDerHexFromStorage = localStorage.getItem('pub-key');
      const addressFromStorage = localStorage.getItem('wallet-address');

      let tempPrivKey;
      let currentWif;
      let newWalletName = storage.getWalletName() || '';
      // 已知的钱包地址：缓存命中或从加密私钥恢复出来的地址。
      let resolvedAddress = null;

      // ── Watch-only 分支：只有地址，无私钥 ──
      if (!encryptedWif && !oldPlaintextWif && storage.getIsWatchOnly() && addressFromStorage) {
        console.log('Watch-only wallet loaded from storage.');
        setAddress(addressFromStorage);
        setIsWatchOnly(true);
        setWalletName(storage.getWalletName() || '');
        setQrcode(await QRCode.toDataURL(addressFromStorage));
        await refreshBalance(addressFromStorage);
        return { error: 0, address: addressFromStorage, watchOnly: true };
      }

      if (encryptedWif) {
        console.log('Encrypted WIF found. Wallet uses PIN.');

        let cachedPubKey = null;
        if (pubKeyDerHexFromStorage && addressFromStorage) {
          try {
            const potentialPubKey = PublicKey.fromString(pubKeyDerHexFromStorage);
            if (potentialPubKey instanceof PublicKey && potentialPubKey.toAddress().toString() === addressFromStorage) {
              cachedPubKey = potentialPubKey;
            } else {
              console.warn('Encrypted WIF exists, but public key/address cache is invalid. Clearing cache.');
            }
          } catch (e) {
            console.warn('Error loading PublicKey from storage, clearing cache.', e);
          }
        } else {
           console.warn('Encrypted WIF exists, but no cached public key or address.');
        }

        if (cachedPubKey) {
          setPubKey(cachedPubKey);
          setAddress(addressFromStorage);
          resolvedAddress = addressFromStorage;
          console.log('[wallet] publicKey', cachedPubKey.toDER('hex'));
          addLog(`Public key: ${cachedPubKey.toDER('hex')}`, LOG_TYPES.INFO);
        } else {
          // 私钥还在，丢的只是缓存 → 用 PIN 解锁一次恢复，而不是留下一个打不开的钱包。
          storage.removePublicKey();
          storage.removeWalletAddress();
          const recovery = await unlockStoredWallet();
          if (recovery.error) return recovery;
          setPubKey(recovery.pubKey);
          setAddress(recovery.address);
          resolvedAddress = recovery.address;
          console.log('[wallet] publicKey (recovered)', recovery.pubKey.toDER('hex'));
          addLog(`Address cache rebuilt from encrypted key: ${recovery.address}`, LOG_TYPES.INFO);
        }

        setWalletName(storage.getWalletName() || '');
      } else if (oldPlaintextWif) {
        console.log('Old plaintext WIF found. Starting migration to PIN protection.');
        await showInfo(t('bsvPayment.pinModal.migrationTitle'), t('bsvPayment.pinModal.migrationMessage'));
        
        // 明文 WIF 迁移：地址可以直接派生，密码框就能带上它。
        let migrationAddress = '';
        try {
          migrationAddress = PrivateKey.fromWif(oldPlaintextWif).toPublicKey().toAddress().toString();
        } catch (addressError) {
          console.warn('Could not derive address before migration prompt:', addressError);
        }

        const { pin: walletPin, walletName: fetchedWalletName } = await promptForPin('set', { walletAddress: migrationAddress });
        if (!walletPin) {
          return { error: 'migration-cancelled', message: t('bsvPayment.pinModal.migrationCancelled') };
        }
        newWalletName = fetchedWalletName;

        try {
          const encryptionResult = await encryptData(oldPlaintextWif, walletPin);
          storage.setEncryptedWifData(encryptionResult.ciphertext, encryptionResult.iv, encryptionResult.salt);
          storage.setWalletName(newWalletName);
          
          tempPrivKey = PrivateKey.fromWif(oldPlaintextWif);
          currentWif = oldPlaintextWif;

          localStorage.removeItem('priv-key');
          storage.setIsPinSetupDone(true);
          console.log('Migration to PIN successful. Old plaintext WIF removed.');
        } catch (encError) {
          console.error('Error encrypting old WIF during migration:', encError);
          return { error: 'encryption-failed', message: t('bsvPayment.statusMessages.errors.encryptionFailed') };
        }
      } else {
        console.log('No existing wallet found. Starting setup flow.');
        
        // Step 1: Ask user whether to Create or Import
        let setupAction;
        try {
            const setupResult = await promptForPin('setup'); // Returns { action: 'create' | 'import' }
            setupAction = setupResult.action;
        } catch (e) {
             console.log('Setup cancelled or failed', e);
             return { error: 'setup-cancelled', message: t('bsvPayment.pinModal.setupCancelledMessage') };
        }

        if (setupAction === 'import') {
             console.log('User chose to import wallet.');
             if (options.onImport) {
                 options.onImport();
                 return { error: 'import-requested', message: 'User requested to import wallet.' };
             } else {
                 return { error: 'import-not-available', message: t('bsvPayment.statusMessages.errors.importUiNotAvailable') };
             }
        }

        if (setupAction === 'watch') {
          console.log('User chose watch-only mode.');
          // 弹出输入框让用户输入/扫描地址
          const { pin: watchAddress } = await promptForPin('watch-address').catch(() => ({ pin: null }));
          if (!watchAddress) {
            return { error: 'setup-cancelled', message: t('bsvPayment.pinModal.setupCancelledMessage') };
          }
          storage.setWalletAddress(watchAddress);
          storage.setIsWatchOnly(true);
          setAddress(watchAddress);
          setIsWatchOnly(true);
          setQrcode(await QRCode.toDataURL(watchAddress));
          await refreshBalance(watchAddress);
          return { error: 0, address: watchAddress, watchOnly: true };
        }

        // Step 2: Create new wallet (User chose 'create')
        // 先生成密钥，密码框才能带上地址；浏览器按地址决定记住哪一条密码。
        const generatedPrivKey = PrivateKey.fromRandom();
        const generatedAddress = generatedPrivKey.toPublicKey().toAddress().toString();
        console.log('User chose to create new wallet. Prompting for PIN.');
        const { pin: walletPin, walletName: fetchedWalletName } = await promptForPin('set', { walletAddress: generatedAddress });

        if (!walletPin) {
          return { error: 'setup-cancelled', message: t('bsvPayment.pinModal.setupCancelledMessage') };
        }
        newWalletName = fetchedWalletName;
        tempPrivKey = generatedPrivKey;
        currentWif = tempPrivKey.toWif();
        try {
          const encryptionResult = await encryptData(currentWif, walletPin);
          storage.setEncryptedWifData(encryptionResult.ciphertext, encryptionResult.iv, encryptionResult.salt);
          storage.setWalletName(newWalletName);
          storage.setIsPinSetupDone(true);
          const newAddress = tempPrivKey.toPublicKey().toAddress().toString();
          autoBackupPrivateKeyToFile(currentWif, newAddress, walletPin, newWalletName);
          console.log('New wallet created and WIF encrypted with PIN.');
        } catch (encError) {
          console.error('Error encrypting new WIF:', encError);
          return { error: 'encryption-failed', message: t('bsvPayment.statusMessages.errors.encryptionFailed') };
        }
      }

      let currentAddress = resolvedAddress;
      if (tempPrivKey) {
        const newPubKey = tempPrivKey.toPublicKey();
        const newAddress = newPubKey.toAddress().toString();
        setPubKey(newPubKey);
        setAddress(newAddress);
        setWalletName(newWalletName);
        storage.setPublicKey(newPubKey.toDER('hex'));
        storage.setWalletAddress(newAddress);
        currentAddress = newAddress;
        console.log('[wallet] publicKey', newPubKey.toDER('hex'));
        addLog(`Public key: ${newPubKey.toDER('hex')}`, LOG_TYPES.INFO);
      }

      if (currentAddress) {
        setQrcode(await QRCode.toDataURL(currentAddress));
        await refreshBalance(currentAddress);
      } else {
        console.log("Wallet is PIN protected, QR code will be shown after unlock.");
      }
      
      return { error: 0, address: currentAddress, message: 'Wallet created/loaded successfully.', walletName: newWalletName || storage.getWalletName() };

    } catch (error) {
      if (error && error.cancelled) {
          // If the rejection came from the promptForPin rejection (which might be due to onImport trigger)
           console.log('Create wallet cancelled (possibly for import).');
           // If we threw { importRequested: true } it would be caught in the inner try/catch block if we had one wrapping promptForPin.
           // However, I put the try/catch around promptForPin specifically.
           // So here we likely just see standard errors.
           return { error: 'setup-cancelled' };
      }
      console.error('Failed to create wallet:', error);
      return { error: 'wallet-creation-failed', message: t('bsvPayment.statusMessages.walletCreateFailed') };
    }
  }, [storage, autoBackupPrivateKeyToFile, showInfo, promptForPin, t, refreshBalance, addLog, unlockStoredWallet]);

  const getWifForBackup = useCallback(async () => {
    const result = await ensurePrivateKeyLoaded(pubKey, address);
    if (result && result.loadedPrivKey && result.pin) {
      return await generateEncryptedBackupData(result.loadedPrivKey.toWif(), address, result.pin, walletName);
    }
    return null;
  }, [ensurePrivateKeyLoaded, pubKey, address, walletName, generateEncryptedBackupData, t]);

  const calculateMaxSpendable = useCallback(async (target = null) => {
    if (!address) return { maxAmount: 0, message: 'Address not available' };
    try {
        let currentUtxos = utxos;
        if (currentUtxos.length === 0) {
            currentUtxos = await getUTXOs(address);
            setUtxos(currentUtxos);
        }

        const currentBalance = currentUtxos.reduce((sum, utxo) => sum + Number(utxo.satoshis), 0);
        addLog(`Calculating Max Spendable for ${address}. Total: ${currentBalance} sats`, LOG_TYPES.INFO);

        if (currentBalance <= 0) {
            return { maxAmount: 0, message: t('bsvPayment.statusMessages.balanceStatus.zeroBalance') };
        }

        // If target is Paymail, we need to resolve it to know the output count
        let outputCount = 1;
        let resolvedOutputs = null;

        if (target && isValidPaymail(target)) {
            try {
                addLog(`Pre-resolving Paymail for fee estimation: ${target}`, LOG_TYPES.INFO);
                const client = new PaymailClient();
                // Use a dummy amount for resolution to get the structure
                const p2p = await client.getP2pPaymentDestination(target, currentBalance);
                if (p2p && p2p.outputs) {
                    outputCount = p2p.outputs.length;
                    resolvedOutputs = p2p.outputs;
                    addLog(`Paymail resolved to ${outputCount} outputs.`, LOG_TYPES.INFO);
                }
            } catch (e) {
                console.warn('Paymail pre-resolution failed, falling back to 1 output:', e);
            }
        }

        const dryRun = async (satoshis) => {
            let testRequest;
            if (resolvedOutputs) {
                // Mimic the Paymail structure
                testRequest = resolvedOutputs.map((o, idx) => ({
                    script: o.script,
                    satoshis: idx === resolvedOutputs.length - 1 ? satoshis : o.satoshis
                }));
            } else {
                testRequest = [{ address: target || address, satoshis }];
            }
            
            return processRefund(currentUtxos, testRequest, {
                dryRun: true, t, pubKey, address,
                setStatus: () => {}, setStatusMessage: () => {}, addLog,
            });
        };

        const round1 = await dryRun(currentBalance);
        const fee1 = round1.error === 'insufficient-funds' ? round1.requiredFee
                   : round1.error === 0                    ? round1.requiredFee
                   : null;

        if (fee1 === null) {
            return { maxAmount: 0, message: `${t('bsvPayment.statusMessages.feeCalculationFailed')}: ${round1.message || round1.error}` };
        }

        const maxAmount = currentBalance - fee1;
        
        // Round 2: Re-calculate with actual max
        const round2 = await dryRun(maxAmount > 0 ? maxAmount : 0);
        const fee2 = round2.error === 'insufficient-funds' ? round2.requiredFee
                   : round2.error === 0                    ? round2.requiredFee
                   : fee1;

        const finalMax = currentBalance - fee2;
        return {
            maxAmount: finalMax > 0 ? finalMax : 0,
            message: finalMax <= 0 ? t('bsvPayment.statusMessages.balanceStatus.insufficientForFee') : ''
        };
    } catch (error) {
        console.error('Error calculating max spendable:', error);
        return {
            maxAmount: 0,
            message: `${t('bsvPayment.statusMessages.feeCalculationFailed')}: ${error.message}`
        };
    }
  }, [address, t, pubKey, utxos]);

  const clearTransferStatus = useCallback(() => {
    setTransferStatus(null);
    setTransferMessage('');
  }, []);

  const sendTransaction = useCallback(async (target, amount) => {
    let paymentTargetObject = {};
    if (isValidPaymail(target)) {
        paymentTargetObject.paymail = target;
    } else if (isValidAddress(target)) {
        paymentTargetObject.address = target;
    } else {
        const errorMessage = t('bsvPayment.statusMessages.errors.invalidReceivedTarget');
        setTransferStatus('error');
        setTransferMessage(errorMessage);
        throw new Error(errorMessage);
    }

    const transferRequest = [{
        ...paymentTargetObject,
        satoshis: amount,
    }];
    console.log(`[DEBUG] sendTransaction initiated:`, { target, amount, transferRequest });
    
    try {
        setTransferStatus('preparing');
        setTransferMessage(t('bsvPayment.transfer.preparing'));

        // Use cached UTXOs if available to speed up transaction preparation
        let currentUtxos = utxos;
        if (currentUtxos.length === 0) {
            currentUtxos = await getUTXOs(address);
            setUtxos(currentUtxos);
        }

        // Parallelize user PIN input and fetching UTXOs (if not already cached)
        const [keyResult] = await Promise.all([
            ensurePrivateKeyLoaded(pubKey, address)
        ]);

        if (!keyResult || !keyResult.loadedPrivKey) {
            if (keyResult && keyResult.error === 'unlock-cancelled') {
                const error = new Error(keyResult.message || 'Operation cancelled by user.');
                error.cancelled = true;
                throw error;
            }
            throw new Error('Failed to load private key. Is PIN correct?');
        }

        const result = await processRefund(currentUtxos, transferRequest, {
            privateKey: keyResult.loadedPrivKey,
            dryRun: false,
            t,
            pubKey,
            address,
            setStatus: setTransferStatus,
            setStatusMessage: setTransferMessage,
            addLog,
        });

        if (result?.error === 0) {
            const successMessage = {
                text: t('bsvPayment.statusMessages.transactionSent'),
                linkUrl: getTxExplorerUrl(result.txid),
                linkText: t('bsvPayment.viewOnExplorer'),
            };
            setTransferMessage(successMessage);
            return { success: true, txid: result.txid };
        } else {
            const error = new Error(result.message || 'Transaction failed');
            error.code = result.error;
            throw error;
        }
    } catch (error) {
        if (!error.cancelled) {
             console.error('sendTransaction error:', error);
             setTransferStatus('error');
             setTransferMessage(error.message || t('bsvPayment.transfer.errors.transferFailed'));
        } else {
            // If user cancelled, clear the status to reset the button state
            clearTransferStatus();
        }
        throw error;
    }
}, [address, pubKey, t, ensurePrivateKeyLoaded, refreshBalance, clearTransferStatus, utxos]);

  const handleDeleteWallet = useCallback((isReload = true) => {
    const addressToDelete = address;
    storage.clearWalletData(addressToDelete);
    setPubKey(null);
    setAddress('');
    setQrcode('');
    setWalletName('');
    setIsWatchOnly(false);
    setUtxos([]);
    if (isReload) window.location.reload();
  }, [address, storage, t]);

  const handleImportData = useCallback(async (dataToImport) => {
    console.log('handleImportData called with:', dataToImport);
    let importDataType = null;
    let importDataContent = null;

    if (typeof dataToImport === 'string') {
      try {
        const parsed = JSON.parse(dataToImport);
        if (parsed && parsed.encryptedWif && parsed.iv && parsed.salt) {
          importDataType = 'encrypted';
          importDataContent = parsed;
        } else {
          throw new Error('Not encrypted JSON format');
        }
      } catch (e) {
        if (isValidAddress(dataToImport) || isValidPaymail(dataToImport)) {
          // This case is not a WIF or JSON, so it's likely an address/paymail.
          // We can't import a wallet from just an address/paymail.
          // Let it fall through to the wifError block.
        }
        try {
          PrivateKey.fromWif(dataToImport);
          importDataType = 'plain';
          importDataContent = { wif: dataToImport };
        } catch (wifError) {
          console.error('Invalid string import data format:', dataToImport);
          await showInfo(t('bsvPayment.statusMessages.errorTitle'), t('bsvPayment.statusMessages.errors.invalidImportData'));
          return { error: 'invalid-import-data' };
        }
      }
    } else {
        console.error('useWallet: Unexpected import data type or value:', dataToImport);
        await showInfo(t('bsvPayment.statusMessages.errorTitle'), t('bsvPayment.statusMessages.errors.invalidImportData'));
        return { error: 'unexpected-data-type' };
    }

    // ── 阶段一：只做验证，绝不碰现有钱包 ──
    // 老实现一进 try 就先 handleDeleteWallet(false)，于是「输错 PIN」「输到一半取消」
    // 「备份里的地址对不上」这些常见失败，都会把一个原本能用的钱包先删掉再返回错误。
    // 现在所有验证结果先落在内存里，全部通过后才写 localStorage。
    let staged = null;

    try {
      if (importDataType === 'plain') {
        const importedWif = importDataContent.wif;
        console.log('Importing plain WIF.');

        // 先派生地址，密码框才能带上它。WIF 无效时留空，后续照常报错。
        let importedAddress = '';
        try {
          importedAddress = PrivateKey.fromWif(importedWif).toPublicKey().toAddress().toString();
        } catch (addressError) {
          console.warn('Could not derive address before import prompt:', addressError);
        }

        const { pin, walletName: newWalletName } = await promptForPin('set', { walletAddress: importedAddress }).catch(() => ({ pin: null }));
        if (!pin) {
          await showInfo(t('bsvPayment.pinModal.importCancelledTitle'), t('bsvPayment.pinModal.importCancelledMessage'));
          return { error: 'import-cancelled' };
        }

        const encryptionResult = await encryptData(importedWif, pin);
        staged = {
          encryptedWif: encryptionResult.ciphertext,
          iv: encryptionResult.iv,
          salt: encryptionResult.salt,
          walletName: newWalletName || '',
          privKey: PrivateKey.fromWif(importedWif),
        };
      } else if (importDataType === 'encrypted') {
        console.log('Importing encrypted data.');
        const { encryptedWif, iv, salt, address: importedAddressFromData, walletName: dataWalletName } = importDataContent;

        const { pin } = await promptForPin('unlock', { walletAddress: importedAddressFromData || '' }).catch(() => ({ pin: null }));
        if (!pin) {
          await showInfo(t('bsvPayment.pinModal.unlockCancelledTitle'), t('bsvPayment.pinModal.unlockCancelledMessage'));
          return { error: 'unlock-cancelled' };
        }

        const importedWif = await decryptData(encryptedWif, iv, salt, pin);
        if (!importedWif) {
          await showInfo(t('bsvPayment.pinModal.decryptionFailedTitle'), t('bsvPayment.statusMessages.errors.decryptionFailedPinIncorrect'));
          return { error: 'decryption-failed' };
        }

        const decryptedPrivKey = PrivateKey.fromWif(importedWif);
        const derivedAddress = decryptedPrivKey.toPublicKey().toAddress().toString();

        if (importedAddressFromData && derivedAddress !== importedAddressFromData) {
          await showInfo(t('bsvPayment.statusMessages.errors.addressMismatchTitle'), t('bsvPayment.statusMessages.errors.addressMismatch'));
          return { error: 'address-mismatch' };
        }

        staged = {
          // 保留备份文件里的原始密文：它已经是用这个 PIN 加密好的，重新加密只会
          // 引入一次不必要的失败点。
          encryptedWif,
          iv,
          salt,
          walletName: dataWalletName || '',
          privKey: decryptedPrivKey,
        };
      }
    } catch (error) {
      console.error('useWallet: Error validating imported data:', error);
      await showInfo(t('bsvPayment.statusMessages.errors.wifImportFailed'), error.message);
      return { error: 'import-processing-failed' };
    }

    if (!staged) {
      return { error: 'invalid-import-data' };
    }

    // ── 阶段二：一次性写入。走到这里所有验证都已通过 ──
    try {
      const finalPubKey = staged.privKey.toPublicKey();
      const finalAddress = finalPubKey.toAddress().toString();
      const previousAddress = address;

      storage.setEncryptedWifData(staged.encryptedWif, staged.iv, staged.salt);
      storage.setWalletName(staged.walletName);
      storage.setIsPinSetupDone(true);
      storage.setPublicKey(finalPubKey.toDER('hex'));
      storage.setWalletAddress(finalAddress);
      storage.setBackupStatus(finalAddress, true);

      // 覆盖旧钱包后要清掉的残留：观察模式标记、旧版明文私钥、旧地址的备份标记。
      storage.removeIsWatchOnly();
      storage.removeOldPlaintextWif();
      if (previousAddress && previousAddress !== finalAddress) {
        storage.removeBackupStatus(previousAddress);
      }

      console.log('Wallet imported, encrypted with PIN, and pubKey/address cached.');

      window.location.reload();
      return { error: 0, message: 'Wallet imported successfully.' };
    } catch (error) {
      console.error('useWallet: Error committing imported data:', error);
      await showInfo(t('bsvPayment.statusMessages.errors.wifImportFailed'), error.message);
      return { error: 'import-processing-failed' };
    }
  }, [address, promptForPin, showInfo, storage, t]);

  return {
    pubKey,
    address,
    walletName,
    qrcode,
    isWalletUiVisible,
    isWatchOnly,
    balance: walletBalanceState.total,
    walletBalance: walletBalanceState,
    isBalanceLoading,
    createWallet,
    getWifForBackup,
    handleDeleteWallet,
    handleImportData,
    ensurePrivateKeyLoaded,
    refreshBalance,
    calculateMaxSpendable,
    sendTransaction,
    transferStatus,
    transferMessage,
    clearTransferStatus,
    utxos,
  };
}
