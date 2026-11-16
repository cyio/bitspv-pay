/**
 * AirGapFlow.jsx
 *
 * 两种使用场景：
 *   mode="sender"  — 热端：输入收款方+金额 → 构建 SigningRequest → 展示 QR① → 扫 QR② → 广播
 *   mode="signer"  — 冷端：扫 QR① → 确认 → PIN 签名 → 展示 QR②
 */

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import QRScanner from './QRScanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SimpleSelect, SimpleSelectItem } from '@/components/ui/SimpleSelect';
import {
  isValidAddress,
  isValidPaymail,
  convertSatoshisToBSV,
  convertSatoshisToFiat,
  convertFiatToSatoshis,
} from '../utils/bsv';
import { Transaction, P2PKH, Utils } from '@bsv/sdk';
import { buildUnsignedTx, signTransaction, broadcastSignedTx } from '../utils/transaction';
import { serializeSigningRequest, serializeSignedTx, deserializeSigningRequest, deserializeSignedTx, detectQrType } from '../utils/signing-request';
import { PaymailClient } from '@bsv/paymail/client';
import { getGoogleReachable } from '../utils/network';
import { getUTXOs } from '../utils/api';
import { getTxExplorerUrl } from '../utils/apiProviderHealth';
import { useLog } from '../contexts/LogContext';

// ─── 图标 ─────────────────────────────────────────────────────────────────────
const ScanIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

// ─── 通用子组件 ───────────────────────────────────────────────────────────────
/**
 * 从 P2PKH 锁定脚本反解出地址。
 * 冷端必须看到「付给谁」，只写一个 'P2PKH Address' 等于没有核验依据。
 * 脚本形态：76 a9 14 <20 字节 hash160> 88 ac
 */
const addressFromP2PKHScript = lockingScript => {
  try {
    const hex = lockingScript.toHex();
    if (!hex.startsWith('76a914') || !hex.endsWith('88ac') || hex.length !== 50) return null;
    const hash160 = hex.slice(6, 46).match(/../g).map(byte => parseInt(byte, 16));
    return Utils.toBase58Check(hash160, [0]);
  } catch {
    return null;
  }
};

const StepIndicator = ({ current, total, labels }) => (
  <div className="mb-4 flex items-start justify-center gap-1 overflow-x-auto px-1">
    {labels.slice(0, total).map((label, i) => (
      <React.Fragment key={i}>
        <div className="flex shrink-0 flex-col items-center">
          <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold
            ${i + 1 === current ? 'bg-primary text-primary-foreground' :
              i + 1 < current ? 'border border-[var(--seal-border)] bg-[var(--seal-soft)] text-[var(--seal-text)]' :
              'bg-muted text-muted-foreground'}`}>
            {i + 1 < current ? '✓' : i + 1}
          </div>
          <span className="mt-0.5 max-w-[64px] text-center text-[10px] leading-tight text-muted-foreground">
            {label}
          </span>
        </div>
        {i < total - 1 && (
          <div className={`mt-3.5 h-px w-4 shrink-0 sm:w-6 ${i + 1 < current ? 'bg-[var(--seal-border)]' : 'bg-border'}`} />
        )}
      </React.Fragment>
    ))}
  </div>
);

const QrDisplay = ({ dataUrl, size = 220, loadingText = '…', alt = 'QR Code' }) => (
  dataUrl
    ? <img src={dataUrl} alt={alt} className="mx-auto my-3 rounded-[var(--radius)] border border-border bg-white p-2" style={{ width: size, height: size }} />
    : <div className="mx-auto my-3 flex items-center justify-center rounded-[var(--radius)] bg-muted text-xs text-muted-foreground"
        style={{ width: size, height: size }}>{loadingText}</div>
);

const StatusLine = ({ status, message, tone = 'error' }) => {
  if (!status && !message) return null;
  const cls = status === 'error' ? 'text-[var(--danger)]' :
              status === 'success' ? 'text-[var(--seal-text)]' :
              tone === 'error' ? 'text-[var(--danger)]' : 'text-primary';
  return (
    <p role={status === 'error' ? 'alert' : 'status'} className={`mt-2 break-words text-sm ${cls}`}>
      {message}
    </p>
  );
};

// ─── 热端：Sender ─────────────────────────────────────────────────────────────
// step: 'form' → 'building' → 'show-signing-request' → 'scan-signed' → 'broadcasting' → 'done'

export function AirGapSender({ address, rate, utxos: cachedUtxos = [], onDone, onCancel, className = "mt-4 px-2 py-4 bg-muted rounded-[var(--radius)]" }) {
  const { t } = useTranslation();
  const { addLog } = useLog();

  const [step, setStep] = useState('form');
  const [target, setTarget] = useState('');
  const [inputAmount, setInputAmount] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('BSV');
  const [formError, setFormError] = useState('');
  const [signingRequestQrUrl, setSigningRequestQrUrl] = useState('');
  const [signingRequest, setSigningRequest] = useState(null);
  const [status, setStatus] = useState(null);   // 'error' | 'success'
  const [statusMsg, setStatusMsg] = useState('');
  const [txid, setTxid] = useState('');
  const [paymailWarning, setPaymailWarning] = useState('');

  const STEPS = t('bsvPayment.airGap.sender.steps', { returnObjects: true });

  const transferAmountSatoshis = (() => {
    const n = Number(inputAmount);
    if (!inputAmount || isNaN(n)) return null;
    if (selectedUnit === 'BSV') return Math.round(n * 1e8);
    if (selectedUnit === 'sats') return Math.round(n);
    if (selectedUnit === 'USD' && rate) return convertFiatToSatoshis(n, rate);
    return null;
  })();

  const handleBuild = useCallback(async () => {
    setFormError('');
    if (!isValidAddress(target) && !isValidPaymail(target)) {
      setFormError(t('bsvPayment.airGap.sender.invalidRecipient'));
      return;
    }
    const amount = transferAmountSatoshis;
    if (!amount || amount <= 0) {
      setFormError(t('bsvPayment.airGap.sender.invalidAmount'));
      return;
    }

    setStep('building');
    setStatus(null);
    setStatusMsg('');

    try {
      // 解析 Paymail（需联网，热端负责）
      let resolvedRequest;
      if (isValidPaymail(target)) {
        let client;
        if (getGoogleReachable() === false) {
          client = new PaymailClient(undefined, { dohServerBaseUrl: 'https://223.5.5.5/resolve' });
        } else {
          client = new PaymailClient();
        }
        const p2p = await client.getP2pPaymentDestination(target, amount);
        if (!p2p || !p2p.outputs?.length) {
          setStatus('error'); setStatusMsg(t('bsvPayment.airGap.sender.paymailResolveFailed', { target }));
          setStep('form'); return;
        }
        resolvedRequest = p2p.outputs.map(o => ({ script: o.script, satoshis: o.satoshis }));
        // 保留 paymail ref 供广播后通知
        resolvedRequest._paymailRef = { paymail: target, reference: p2p.reference };
      } else {
        resolvedRequest = [{ address: target, satoshis: amount }];
      }

      // 获取 UTXO（使用缓存或重新查询）
      let utxos = cachedUtxos.length > 0 ? cachedUtxos : await getUTXOs(address);

      const result = await buildUnsignedTx(utxos, resolvedRequest, { address, addLog });
      if (result.error !== 0) {
        setStatus('error'); setStatusMsg(result.message);
        setStep('form'); return;
      }

      // 附加 paymailRef 以便广播时通知
      const payload = result.signingRequest;
      if (resolvedRequest._paymailRef) {
        payload.paymailRefs = [resolvedRequest._paymailRef];
      }

      setSigningRequest(payload);

      // 生成 QR
      const qrStr = serializeSigningRequest(payload);
      addLog(`Signing request QR string length: ${qrStr.length} chars`, 'info');
      const url = await QRCode.toDataURL(qrStr, { errorCorrectionLevel: 'L', width: 560 });
      setSigningRequestQrUrl(url);
      setStep('show-signing-request');
    } catch (err) {
      setStatus('error'); setStatusMsg(err.message);
      setStep('form');
    }
  }, [address, target, transferAmountSatoshis, cachedUtxos, addLog]);

  const handleSignedScan = useCallback(async (result) => {
    if (result.error) { setStatus('error'); setStatusMsg(result.error); return; }
    const type = detectQrType(result.data);
    if (type !== 'signed') {
      setStatus('error'); setStatusMsg(t('bsvPayment.airGap.sender.unrecognizedQr'));
      return;
    }
    const signedPayload = deserializeSignedTx(result.data);
    if (!signedPayload?.txHex) {
      setStatus('error'); setStatusMsg(t('bsvPayment.airGap.sender.parseSignedFailed'));
      return;
    }

    setStep('broadcasting');
    setStatus(null); setStatusMsg('');

    const broadcastResult = await broadcastSignedTx(signedPayload.txHex, {
      address,
      paymailRefs: signingRequest?.paymailRefs || [],
      addLog,
      onPaymailWarning: (paymail) => setPaymailWarning(t('bsvPayment.airGap.sender.paymailNotifyFailed', { paymail })),
    });

    if (broadcastResult.error === 0) {
      setTxid(broadcastResult.txid);
      setStep('done');
      // 不在此处调用 onDone，等用户点击"完成"按钮后再触发，避免组件提前 unmount
    } else {
      setStatus('error'); setStatusMsg(broadcastResult.message);
      setStep('scan-signed');
    }
  }, [address, signingRequest, addLog, onDone]);

  // ── render ──
  const stepIndex = { form: 1, building: 1, 'show-signing-request': 2, 'scan-signed': 3, broadcasting: 3, done: 4 }[step] || 1;

  return (
    <div className={className}>
      <StepIndicator current={stepIndex} total={4} labels={STEPS} />

      {/* 步骤 1：填写表单 */}
      {(step === 'form' || step === 'building') && (
        <>
          <h2 className="text-base font-semibold mb-3">{t('bsvPayment.airGap.sender.title')}</h2>
          <div className="mb-3">
            <label htmlFor="airgap-target" className="block text-sm font-medium text-foreground mb-1">{t('bsvPayment.airGap.sender.recipientLabel')}</label>
            <div className="flex items-center gap-2">
              <Input
                id="airgap-target"
                inputMode="text"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={target}
                onChange={e => { setTarget(e.target.value); setFormError(''); }}
                placeholder={t('bsvPayment.airGap.sender.recipientPlaceholder')}
                disabled={step === 'building'}
              />
              <QRScanner onScanResult={r => { if (r.data) setTarget(r.data); else if (r.error) setFormError(r.error); }}>
                {({ scan }) => (
                  <Button onClick={scan} size="icon" variant="outline" title={t('bsvPayment.scanButton')} aria-label={t('bsvPayment.scanButton')}>
                    <ScanIcon />
                  </Button>
                )}
              </QRScanner>
            </div>
          </div>
          <div className="mb-3">
            <label htmlFor="airgap-amount" className="block text-sm font-medium text-foreground mb-1">{t('bsvPayment.airGap.sender.amountLabel')}</label>
            <div className="flex items-center gap-2">
              <Input
                id="airgap-amount"
                type="number"
                inputMode="decimal"
                value={inputAmount}
                onChange={e => { setInputAmount(e.target.value); setFormError(''); }}
                placeholder="0"
                step="any"
                disabled={step === 'building'}
              />
              <SimpleSelect
                value={selectedUnit}
                onValueChange={setSelectedUnit}
                className="w-[90px]"
                ariaLabel={t('bsvPayment.transfer.unitLabel')}
              >
                <SimpleSelectItem value="BSV">BSV</SimpleSelectItem>
                <SimpleSelectItem value="sats">sats</SimpleSelectItem>
                {rate && <SimpleSelectItem value="USD">USD</SimpleSelectItem>}
              </SimpleSelect>
            </div>
          </div>
          {formError && <p role="alert" className="mb-2 text-sm text-[var(--danger)]">{formError}</p>}          <StatusLine status={status} message={statusMsg} />
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={onCancel} disabled={step === 'building'}>{t('bsvPayment.airGap.signer.cancel')}</Button>
            <Button onClick={handleBuild} disabled={step === 'building'}>
              {step === 'building' ? t('bsvPayment.airGap.sender.buildingButton') : t('bsvPayment.airGap.sender.buildButton')}
            </Button>
          </div>
        </>
      )}

      {/* 步骤 2：展示签名请求 QR① */}
      {step === 'show-signing-request' && signingRequest && (
        <>
          <h2 className="text-base font-semibold mb-1">{t('bsvPayment.airGap.sender.showPsbtTitle')}</h2>
          <p className="text-xs text-muted-foreground mb-2">
            {t('bsvPayment.airGap.sender.showPsbtDesc')}
          </p>
          <QrDisplay dataUrl={signingRequestQrUrl} size={240} loadingText={t('bsvPayment.qrLoading')} alt={t('bsvPayment.airGap.qrAlt')} />

          <div className="mx-4 mb-4 space-y-2 rounded-[var(--radius)] border border-border bg-card p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t('bsvPayment.airGap.checksumLabel')}</span>
              <span className="font-mono text-lg font-bold tracking-widest text-[var(--warn)]">
                {signingRequest.checksum}
              </span>
            </div>
            <div className="flex justify-between gap-3 font-medium text-muted-foreground">
              <span className="truncate max-w-[150px]">{target}</span>
              <span className="font-mono">
                {convertSatoshisToBSV(transferAmountSatoshis || 0)} BSV
              </span>
            </div>
          </div>
          
          <div className="flex justify-end gap-2 px-4">
            <Button variant="outline" onClick={() => setStep('form')}>{t('bsvPayment.airGap.sender.rewrite')}</Button>
            <Button onClick={() => setStep('scan-signed')}>{t('bsvPayment.airGap.sender.scanSignedButton')}</Button>
          </div>
        </>
      )}

      {/* 步骤 3：扫签名 QR② */}
      {(step === 'scan-signed' || step === 'broadcasting') && (
        <>
          <h2 className="text-base font-semibold mb-1">{t('bsvPayment.airGap.sender.scanSignedTitle')}</h2>
          <p className="text-xs text-muted-foreground mb-3">
            {t('bsvPayment.airGap.sender.scanSignedDesc')}
          </p>
          <StatusLine status={status} message={statusMsg} />
          {step === 'broadcasting' && (
            <p className="text-sm text-primary mt-2">{t('bsvPayment.airGap.sender.broadcasting')}</p>
          )}
          {step === 'scan-signed' && (
            <QRScanner onScanResult={handleSignedScan}>
              {({ scan }) => (
                <Button className="w-full mt-2" onClick={scan}>
                  <span className="mr-2"><ScanIcon /></span>{t('bsvPayment.airGap.sender.scanSignedButton')}
                </Button>
              )}
            </QRScanner>
          )}
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => setStep('show-signing-request')} disabled={step === 'broadcasting'}>
              {t('bsvPayment.airGap.sender.back')}
            </Button>
          </div>
        </>
      )}

      {/* 步骤 4：完成 */}
      {step === 'done' && (
        <>
          <div className="mb-4 rounded-[var(--radius)] border border-[var(--seal-border)] bg-[var(--seal-soft)] px-3 py-6 text-center">
            <div className="mb-3 text-5xl">✅</div>
            <p className="mb-2 text-lg font-bold text-[var(--seal-text)]">
              {t('bsvPayment.airGap.sender.broadcastSuccess')}
            </p>
            {txid && (
              <div className="mt-2 text-xs text-muted-foreground">
                TXID:
                <a
                  href={getTxExplorerUrl(txid)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 break-all text-primary underline"
                >
                  {txid}
                </a>
              </div>
            )}
            {paymailWarning && (
              <p className="mt-3 px-2 text-xs text-[var(--warn)]">{paymailWarning}</p>
            )}
          </div>
          <Button className="w-full" onClick={() => onDone(txid)}>
            {t('bsvPayment.airGap.sender.done')}
          </Button>
        </>
      )}
    </div>
  );
}

// ─── 冷端：Signer ─────────────────────────────────────────────────────────────
// step: 'scan-signing-request' → 'confirm' → 'signing' → 'show-signed'

export function AirGapSigner({ address, ensurePrivateKeyLoaded, pubKey, onCancel, className = "mt-4 px-2 py-4 bg-muted rounded-[var(--radius)]" }) {
  const { t } = useTranslation();
  const { addLog } = useLog();

  const [step, setStep] = useState('scan-signing-request');
  const [signingRequest, setSigningRequest] = useState(null);
  const [signedQrUrl, setSignedQrUrl] = useState('');
  const [status, setStatus] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');

  const STEPS = t('bsvPayment.airGap.signer.steps', { returnObjects: true });

  const handleSigningRequestScan = useCallback(async (result) => {
    if (result.error) { setStatus('error'); setStatusMsg(result.error); return; }
    const type = detectQrType(result.data);
    if (type !== 'signing-request') {
      setStatus('error'); setStatusMsg(t('bsvPayment.airGap.signer.unrecognizedQr'));
      return;
    }
    const payload = deserializeSigningRequest(result.data);
    if (!payload?.utxos || !payload?.unsignedTxHex) {
      setStatus('error'); setStatusMsg(t('bsvPayment.airGap.signer.parsePsbtFailed'));
      return;
    }

    // 过期检查（超过 2 小时给警告，不阻止）
    const ageMin = (Date.now() - payload.createdAt) / 60000;
    if (ageMin > 120) {
      setStatusMsg(t('bsvPayment.airGap.signer.expiredWarning', { minutes: Math.round(ageMin) }));
      setStatus('error');
    }

    setSigningRequest(payload);
    setStep('confirm');
  }, []);

  const handleSign = useCallback(async () => {
    setStep('signing');
    setStatus(null); setStatusMsg('');

    const keyResult = await ensurePrivateKeyLoaded(pubKey);
    if (!keyResult || !keyResult.loadedPrivKey) {
      setStatus('error');
      setStatusMsg(keyResult?.error === 'unlock-cancelled' ? t('bsvPayment.airGap.signer.cancelled') : t('bsvPayment.airGap.signer.keyLoadFailed'));
      setStep('confirm');
      return;
    }

    const result = await signTransaction(signingRequest, keyResult.loadedPrivKey);
    if (result.error !== 0) {
      setStatus('error'); setStatusMsg(result.message);
      setStep('confirm');
      return;
    }

    // 生成 QR②
    const signedStr = serializeSignedTx({ txHex: result.txHex });
    addLog(`Signed TX QR string length: ${signedStr.length} chars`, 'info');
    const url = await QRCode.toDataURL(signedStr, { errorCorrectionLevel: 'L', width: 560 });
    setSignedQrUrl(url);
    setStep('show-signed');
  }, [signingRequest, ensurePrivateKeyLoaded, pubKey, addLog]);

  const stepIndex = { 'scan-signing-request': 1, confirm: 2, signing: 3, 'show-signed': 4 }[step] || 1;

  // ─── 从 Hex 解析详情 ──────────────────────────────────────────────────────────
  let displayOutputs = [];
  let displayFee = 0;
  let displayTotal = 0;

  if (signingRequest?.unsignedTxHex) {
    try {
      const tx = Transaction.fromHex(signingRequest.unsignedTxHex);
      const changeScript = new P2PKH().lock(address).toHex();

      // 1. 识别非找零输出
      // 策略：如果最后一个输出匹配找零脚本，且输出总数 > 1，则认为最后一个是找零，其余为收款。
      // 这样可以兼容“给自己转账”的情况（收款和找零是同一个地址）。
      const rawOutputs = tx.outputs;
      const hasChange = rawOutputs.length > 1 && rawOutputs[rawOutputs.length - 1].lockingScript.toHex() === changeScript;
      
      const filteredOutputs = hasChange ? rawOutputs.slice(0, -1) : rawOutputs;

      displayOutputs = filteredOutputs.map(o => {
        const asm = o.lockingScript.toASM();
        const p2pkhAddress = addressFromP2PKHScript(o.lockingScript);
        let displayAddr = t('bsvPayment.airGap.signer.customScript');
        if (p2pkhAddress) {
          // 真实收款地址：冷端必须能看到「钱付给谁」，否则签名只是走过场。
          displayAddr = p2pkhAddress;
        } else if (asm.startsWith('OP_0 OP_RETURN')) {
          displayAddr = t('bsvPayment.airGap.signer.opReturnOutput');
        }
        return { satoshis: o.satoshis, address: displayAddr };
      });

      // 2. 计算手续费：总输入 - 总输出
      const totalIn = signingRequest.utxos.reduce((s, u) => s + Number(u.satoshis || 0), 0);
      const totalOutAll = tx.outputs.reduce((s, o) => s + Number(o.satoshis || 0), 0);
      displayFee = totalIn - totalOutAll;
      displayTotal = displayOutputs.reduce((s, o) => s + Number(o.satoshis || 0), 0);
    } catch (e) {
      console.error('Failed to parse tx details from hex:', e);
    }
  }

  return (
    <div className={className}>
      <StepIndicator current={stepIndex} total={4} labels={STEPS} />

      {/* 步骤 1：冷端扫描待签名二维码 */}
      {step === 'scan-signing-request' && (
        <>
          <h2 className="text-base font-semibold mb-1">{t('bsvPayment.airGap.signer.scanPsbtTitle')}</h2>
          <p className="text-xs text-muted-foreground mb-3">
            {t('bsvPayment.airGap.signer.scanPsbtDesc')}
          </p>
          <StatusLine status={status} message={statusMsg} />
          <QRScanner onScanResult={handleSigningRequestScan}>
            {({ scan }) => (
              <Button className="w-full mt-2" onClick={scan}>
                <span className="mr-2"><ScanIcon /></span>{t('bsvPayment.airGap.signer.scanButton')}
              </Button>
            )}
          </QRScanner>
          <div className="flex justify-end mt-3">
            <Button variant="outline" onClick={onCancel}>{t('bsvPayment.airGap.signer.cancel')}</Button>
          </div>
        </>
      )}

      {/* 步骤 2：冷端确认 */}
      {step === 'confirm' && signingRequest && (
        <>
          <h2 className="text-base font-semibold mb-2">{t('bsvPayment.airGap.signer.confirmTitle')}</h2>
          <div className="space-y-2 rounded-[var(--radius)] border border-border bg-card p-3 text-sm">
            <div className="mb-2 rounded-[var(--radius)] border border-[var(--warn-border)] bg-[var(--warn-soft)] p-2 text-center text-lg font-bold text-[var(--warn)]">
              {t('bsvPayment.airGap.checksumLabel')}: {signingRequest.checksum}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('bsvPayment.airGap.signer.checksumHint')}
            </p>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">{t('bsvPayment.airGap.signer.totalLabel')}</span>
              <span className="font-mono">{convertSatoshisToBSV(displayTotal)} BSV</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">{t('bsvPayment.airGap.signer.feeLabel')}</span>
              <span className="font-mono">{displayFee} sats</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">{t('bsvPayment.airGap.signer.outputCountLabel')}</span>
              <span className="font-mono">{displayOutputs.length}</span>
            </div>
            <div className="border-t border-border pt-2">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {t('bsvPayment.airGap.signer.recipientsLabel')}
              </p>
              <ul className="space-y-1">
                {displayOutputs.map((output, index) => (
                  <li key={index} className="flex justify-between gap-3">
                    <span className="break-all font-mono text-xs">{output.address}</span>
                    <span className="shrink-0 font-mono text-xs">
                      {convertSatoshisToBSV(Number(output.satoshis || 0))} BSV
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <StatusLine status={status} message={statusMsg} />
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => setStep('scan-signing-request')}>{t('bsvPayment.airGap.signer.rescan')}</Button>
            <Button onClick={handleSign}>{t('bsvPayment.airGap.signer.confirmButton')}</Button>
          </div>
        </>
      )}

      {/* 步骤 3：签名中 */}
      {step === 'signing' && (
        <div className="text-center py-6">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{t('bsvPayment.airGap.signer.signingHint')}</p>
        </div>
      )}

      {/* 步骤 4：展示已签名 QR② */}
      {step === 'show-signed' && (
        <>
          <h2 className="text-base font-semibold mb-1">{t('bsvPayment.airGap.signer.showSignedTitle')}</h2>
          <p className="text-xs text-muted-foreground mb-2">
            {t('bsvPayment.airGap.signer.showSignedDesc')}
          </p>
          <QrDisplay dataUrl={signedQrUrl} size={240} loadingText={t('bsvPayment.qrLoading')} alt={t('bsvPayment.airGap.signedQrAlt')} />
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => { setStep('scan-signing-request'); setSigningRequest(null); setSignedQrUrl(''); }}>
              {t('bsvPayment.airGap.signer.resign')}
            </Button>
            <Button onClick={onCancel}>{t('bsvPayment.airGap.signer.done')}</Button>
          </div>
        </>
      )}
    </div>
  );
}
