/**
 * AirGapFlow.jsx
 *
 * 两种使用场景：
 *   mode="sender"  — 热端：输入收款方+金额 → 构建 PSBT → 展示 QR① → 扫 QR② → 广播
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
import { buildUnsignedTx, signPsbt, broadcastSignedTx } from '../utils/transaction';
import { serializePsbt, serializeSignedTx, deserializePsbt, deserializeSignedTx, detectQrType } from '../utils/psbt';
import { PaymailClient } from '@bsv/paymail/client';
import { getGoogleReachable } from '../utils/network';
import { getUTXOs } from '../utils/api';
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
const StepIndicator = ({ current, total, labels }) => (
  <div className="flex items-center justify-center gap-1 mb-4">
    {labels.map((label, i) => (
      <React.Fragment key={i}>
        <div className={`flex flex-col items-center ${i < total ? '' : 'hidden'}`}>
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
            ${i + 1 === current ? 'bg-blue-600 text-white' :
              i + 1 < current ? 'bg-green-500 text-white' :
              'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'}`}>
            {i + 1 < current ? '✓' : i + 1}
          </div>
          <span className="text-[10px] mt-0.5 text-gray-500 dark:text-gray-400 max-w-[52px] text-center leading-tight">
            {label}
          </span>
        </div>
        {i < total - 1 && (
          <div className={`h-px w-6 mb-4 ${i + 1 < current ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-600'}`} />
        )}
      </React.Fragment>
    ))}
  </div>
);

const QrDisplay = ({ dataUrl, size = 220, loadingText = '…' }) => (
  dataUrl
    ? <img src={dataUrl} alt="QR Code" className="mx-auto my-3 rounded" style={{ width: size, height: size }} />
    : <div className="mx-auto my-3 bg-gray-200 dark:bg-gray-600 rounded flex items-center justify-center text-xs text-gray-500"
        style={{ width: size, height: size }}>{loadingText}</div>
);

const StatusLine = ({ status, message }) => {
  if (!status && !message) return null;
  const cls = status === 'error' ? 'text-red-500' :
              status === 'success' ? 'text-green-600 dark:text-green-400' :
              'text-blue-600 dark:text-blue-300';
  return <p className={`text-sm mt-2 break-words ${cls}`}>{message}</p>;
};

// ─── 热端：Sender ─────────────────────────────────────────────────────────────
// step: 'form' → 'building' → 'show-psbt' → 'scan-signed' → 'broadcasting' → 'done'

export function AirGapSender({ address, rate, utxos: cachedUtxos = [], onDone, onCancel }) {
  const { t } = useTranslation();
  const { addLog } = useLog();

  const [step, setStep] = useState('form');
  const [target, setTarget] = useState('');
  const [inputAmount, setInputAmount] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('BSV');
  const [formError, setFormError] = useState('');
  const [psbtQrUrl, setPsbtQrUrl] = useState('');
  const [psbtPayload, setPsbtPayload] = useState(null);
  const [status, setStatus] = useState(null);   // 'error' | 'success'
  const [statusMsg, setStatusMsg] = useState('');
  const [txid, setTxid] = useState('');

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

      const result = buildUnsignedTx(utxos, resolvedRequest, { address, addLog });
      if (result.error !== 0) {
        setStatus('error'); setStatusMsg(result.message);
        setStep('form'); return;
      }

      // 附加 paymailRef 以便广播时通知
      const payload = result.psbtPayload;
      if (resolvedRequest._paymailRef) {
        payload.paymailRefs = [resolvedRequest._paymailRef];
      }

      setPsbtPayload(payload);

      // 生成 QR
      const qrStr = serializePsbt(payload);
      addLog(`PSBT QR string length: ${qrStr.length} chars`, 'info');
      const url = await QRCode.toDataURL(qrStr, { errorCorrectionLevel: 'L', width: 280 });
      setPsbtQrUrl(url);
      setStep('show-psbt');
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
      paymailRefs: psbtPayload?.paymailRefs || signedPayload.paymailRefs || [],
      addLog,
    });

    if (broadcastResult.error === 0) {
      setTxid(broadcastResult.txid);
      setStep('done');
      if (onDone) onDone(broadcastResult.txid);
    } else {
      setStatus('error'); setStatusMsg(broadcastResult.message);
      setStep('scan-signed');
    }
  }, [address, psbtPayload, addLog, onDone]);

  // ── render ──
  const stepIndex = { form: 1, building: 1, 'show-psbt': 2, 'scan-signed': 3, broadcasting: 3, done: 4 }[step] || 1;

  return (
    <div className="mt-4 px-2 py-4 bg-gray-100 dark:bg-gray-700 rounded">
      <StepIndicator current={stepIndex} total={4} labels={STEPS} />

      {/* 步骤 1：填写表单 */}
      {(step === 'form' || step === 'building') && (
        <>
          <h2 className="text-base font-semibold mb-3">{t('bsvPayment.airGap.sender.title')}</h2>
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('bsvPayment.airGap.sender.recipientLabel')}</label>
            <div className="flex items-center gap-2">
              <Input
                value={target}
                onChange={e => { setTarget(e.target.value); setFormError(''); }}
                placeholder={t('bsvPayment.airGap.sender.recipientPlaceholder')}
                disabled={step === 'building'}
              />
              <QRScanner onScanResult={r => { if (r.data) setTarget(r.data); }}>
                {({ scan }) => (
                  <Button onClick={scan} size="icon" variant="outline" title={t('bsvPayment.scanButton')}>
                    <ScanIcon />
                  </Button>
                )}
              </QRScanner>
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('bsvPayment.airGap.sender.amountLabel')}</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={inputAmount}
                onChange={e => { setInputAmount(e.target.value); setFormError(''); }}
                placeholder="0"
                step="any"
                disabled={step === 'building'}
              />
              <SimpleSelect value={selectedUnit} onValueChange={setSelectedUnit} className="w-[90px]">
                <SimpleSelectItem value="BSV">BSV</SimpleSelectItem>
                <SimpleSelectItem value="sats">sats</SimpleSelectItem>
                {rate && <SimpleSelectItem value="USD">USD</SimpleSelectItem>}
              </SimpleSelect>
            </div>
          </div>
          {formError && <p className="text-sm text-red-500 mb-2">{formError}</p>}
          <StatusLine status={status} message={statusMsg} />
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={onCancel} disabled={step === 'building'}>{t('bsvPayment.airGap.signer.cancel')}</Button>
            <Button onClick={handleBuild} disabled={step === 'building'}>
              {step === 'building' ? t('bsvPayment.airGap.sender.buildingButton') : t('bsvPayment.airGap.sender.buildButton')}
            </Button>
          </div>
        </>
      )}

      {/* 步骤 2：展示 PSBT QR① */}
      {step === 'show-psbt' && (
        <>
          <h2 className="text-base font-semibold mb-1">{t('bsvPayment.airGap.sender.showPsbtTitle')}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            {t('bsvPayment.airGap.sender.showPsbtDesc')}
          </p>
          <QrDisplay dataUrl={psbtQrUrl} size={240} loadingText={t('bsvPayment.qrLoading')} />
          <div className="text-xs text-center text-gray-500 dark:text-gray-400 mb-3">
            {t('bsvPayment.airGap.sender.sendLabel')} {convertSatoshisToBSV(psbtPayload?.request?.reduce((s, r) => s + (r.satoshis || 0), 0) ?? 0)} |
            {t('bsvPayment.airGap.sender.feeShortLabel')} {psbtPayload?.fee} sats
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setStep('form')}>{t('bsvPayment.airGap.sender.rewrite')}</Button>
            <Button onClick={() => setStep('scan-signed')}>{t('bsvPayment.airGap.sender.scanBack')}</Button>
          </div>
        </>
      )}

      {/* 步骤 3：扫签名 QR② */}
      {(step === 'scan-signed' || step === 'broadcasting') && (
        <>
          <h2 className="text-base font-semibold mb-1">{t('bsvPayment.airGap.sender.scanSignedTitle')}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            {t('bsvPayment.airGap.sender.scanSignedDesc')}
          </p>
          <StatusLine status={status} message={statusMsg} />
          {step === 'broadcasting' && (
            <p className="text-sm text-blue-600 dark:text-blue-300 mt-2">{t('bsvPayment.airGap.sender.broadcasting')}</p>
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
            <Button variant="outline" onClick={() => setStep('show-psbt')} disabled={step === 'broadcasting'}>
              {t('bsvPayment.airGap.sender.back')}
            </Button>
          </div>
        </>
      )}

      {/* 步骤 4：完成 */}
      {step === 'done' && (
        <>
          <div className="text-center py-4">
            <div className="text-4xl mb-3">✅</div>
            <p className="font-semibold text-green-600 dark:text-green-400">{t('bsvPayment.airGap.sender.broadcastSuccess')}</p>
            {txid && (
              <a
                href={`https://whatsonchain.com/tx/${txid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 underline break-all mt-1 block"
              >
                {txid}
              </a>
            )}
          </div>
          <Button className="w-full" onClick={onCancel}>{t('bsvPayment.airGap.sender.done')}</Button>
        </>
      )}
    </div>
  );
}

// ─── 冷端：Signer ─────────────────────────────────────────────────────────────
// step: 'scan-psbt' → 'confirm' → 'signing' → 'show-signed'

export function AirGapSigner({ ensurePrivateKeyLoaded, pubKey, onCancel }) {
  const { t } = useTranslation();
  const { addLog } = useLog();

  const [step, setStep] = useState('scan-psbt');
  const [psbtPayload, setPsbtPayload] = useState(null);
  const [signedQrUrl, setSignedQrUrl] = useState('');
  const [status, setStatus] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');

  const STEPS = t('bsvPayment.airGap.signer.steps', { returnObjects: true });

  const handlePsbtScan = useCallback(async (result) => {
    if (result.error) { setStatus('error'); setStatusMsg(result.error); return; }
    const type = detectQrType(result.data);
    if (type !== 'psbt') {
      setStatus('error'); setStatusMsg(t('bsvPayment.airGap.signer.unrecognizedQr'));
      return;
    }
    const payload = deserializePsbt(result.data);
    if (!payload?.utxos || !payload?.request) {
      setStatus('error'); setStatusMsg(t('bsvPayment.airGap.signer.parsePsbtFailed'));
      return;
    }

    // 过期检查（超过 2 小时给警告，不阻止）
    const ageMin = (Date.now() - payload.createdAt) / 60000;
    if (ageMin > 120) {
      setStatusMsg(t('bsvPayment.airGap.signer.expiredWarning', { minutes: Math.round(ageMin) }));
      setStatus('error');
    }

    setPsbtPayload(payload);
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

    const result = await signPsbt(psbtPayload, keyResult.loadedPrivKey);
    if (result.error !== 0) {
      setStatus('error'); setStatusMsg(result.message);
      setStep('confirm');
      return;
    }

    // 生成 QR②
    const signedStr = serializeSignedTx({
      txHex: result.txHex,
      paymailRefs: psbtPayload.paymailRefs,
    });
    addLog(`Signed TX QR string length: ${signedStr.length} chars`, 'info');
    const url = await QRCode.toDataURL(signedStr, { errorCorrectionLevel: 'L', width: 280 });
    setSignedQrUrl(url);
    setStep('show-signed');
  }, [psbtPayload, ensurePrivateKeyLoaded, pubKey, addLog]);

  const stepIndex = { 'scan-psbt': 1, confirm: 2, signing: 3, 'show-signed': 4 }[step] || 1;

  // 计算总输出（不含找零）
  const totalOut = psbtPayload?.request?.reduce((s, r) => s + (r.satoshis || 0), 0) || 0;

  return (
    <div className="mt-4 px-2 py-4 bg-gray-100 dark:bg-gray-700 rounded">
      <StepIndicator current={stepIndex} total={4} labels={STEPS} />

      {/* 步骤 1：扫 PSBT QR① */}
      {step === 'scan-psbt' && (
        <>
          <h2 className="text-base font-semibold mb-1">{t('bsvPayment.airGap.signer.scanPsbtTitle')}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            {t('bsvPayment.airGap.signer.scanPsbtDesc')}
          </p>
          <StatusLine status={status} message={statusMsg} />
          <QRScanner onScanResult={handlePsbtScan}>
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

      {/* 步骤 2：确认 */}
      {step === 'confirm' && psbtPayload && (
        <>
          <h2 className="text-base font-semibold mb-2">{t('bsvPayment.airGap.signer.confirmTitle')}</h2>
          <div className="bg-white dark:bg-gray-800 rounded p-3 text-sm space-y-2">
            {psbtPayload.request.map((req, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400 truncate max-w-[180px]">
                  {req.address || req.script?.slice(0, 12) + '…' || 'OP_RETURN'}
                </span>
                <span className="font-mono">{convertSatoshisToBSV(req.satoshis)} BSV</span>
              </div>
            ))}
            <hr className="border-gray-200 dark:border-gray-600" />
            <div className="flex justify-between text-gray-500 dark:text-gray-400">
              <span>{t('bsvPayment.airGap.signer.feeLabel')}</span>
              <span className="font-mono">{psbtPayload.fee} sats</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>{t('bsvPayment.airGap.signer.totalLabel')}</span>
              <span className="font-mono">{convertSatoshisToBSV(totalOut + psbtPayload.fee)} BSV</span>
            </div>
          </div>
          <StatusLine status={status} message={statusMsg} />
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => setStep('scan-psbt')}>{t('bsvPayment.airGap.signer.rescan')}</Button>
            <Button onClick={handleSign}>{t('bsvPayment.airGap.signer.confirmButton')}</Button>
          </div>
        </>
      )}

      {/* 步骤 3：签名中 */}
      {step === 'signing' && (
        <div className="text-center py-6">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('bsvPayment.airGap.signer.signingHint')}</p>
        </div>
      )}

      {/* 步骤 4：展示已签名 QR② */}
      {step === 'show-signed' && (
        <>
          <h2 className="text-base font-semibold mb-1">{t('bsvPayment.airGap.signer.showSignedTitle')}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            {t('bsvPayment.airGap.signer.showSignedDesc')}
          </p>
          <QrDisplay dataUrl={signedQrUrl} size={240} loadingText={t('bsvPayment.qrLoading')} />
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => { setStep('scan-psbt'); setPsbtPayload(null); setSignedQrUrl(''); }}>
              {t('bsvPayment.airGap.signer.resign')}
            </Button>
            <Button onClick={onCancel}>{t('bsvPayment.airGap.signer.done')}</Button>
          </div>
        </>
      )}
    </div>
  );
}
