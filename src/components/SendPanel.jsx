import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Check, Copy } from 'lucide-react';
import { useDialog } from '../contexts/DialogContext';
import QRScanner from './QRScanner';
import { SimpleSelect, SimpleSelectItem } from '@/components/ui/SimpleSelect';
import { isValidAddress, isValidPaymail, convertSatoshisToBSV, convertSatoshisToFiat } from '../utils/bsv';
import { copyText } from '../utils/clipboard';
import { useLockBodyScroll } from './Portal';
import { getTxExplorerUrl } from '../utils/apiProviderHealth';

const ScanIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
    />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

/**
 * 独立的发送面板。
 *
 * 移动端约束：
 * - 满屏 dvh + 自身滚动，键盘弹起时内容照常滚动；
 * - 主按钮留在表单文档流里，不 fixed 在底部，避免被键盘遮住；
 * - 不用 transform 做位移动画，只淡入，避免破坏滚动与定位；
 * - 输入框带 enterkeyhint，回车能在地址/金额之间移动并提交。
 */
export default function SendPanel({
  onClose,
  rate,
  maxTransferAmountValue,
  onRequestCalculateMaxTransfer,
  onRequestEstimateTransfer,
  onTransferFunds,
  transferStatus,
  transferMessage,
  onClearTransferStatus,
}) {
  const { t, i18n } = useTranslation();
  const { showDialog } = useDialog();
  const addressRef = useRef(null);
  const amountRef = useRef(null);
  const requestSeqRef = useRef(0);
  // 父组件重渲染时回调身份可能变化，effect 只依赖真正的输入，避免重复请求。
  const estimateRef = useRef(onRequestEstimateTransfer);
  estimateRef.current = onRequestEstimateTransfer;
  const translateRef = useRef(t);
  translateRef.current = t;

  const [target, setTarget] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('BSV');
  const [formError, setFormError] = useState('');
  const [estimate, setEstimate] = useState(null);
  const [estimateError, setEstimateError] = useState('');
  const [isEstimating, setIsEstimating] = useState(false);
  const [isCalculatingMax, setIsCalculatingMax] = useState(false);
  const [maxApplied, setMaxApplied] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [isTxidCopied, setIsTxidCopied] = useState(false);
  const titleId = React.useId();

  useLockBodyScroll(true);

  useEffect(() => {
    const frame = requestAnimationFrame(() => addressRef.current?.focus());
    // 上次成功留下的全局状态不该在新一次打开时变成红色错误行。
    onClearTransferStatus?.();
    const onKeyDown = event => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []); // 只在挂载时执行一次

  const isTargetValid = !target ? null : isValidAddress(target) || isValidPaymail(target);
  const amountSatoshis = useMemo(() => {
    if (amount === '') return null;
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0) return null;
    if (unit === 'BSV') return Math.round(value * 1e8);
    if (unit === 'sats') return Math.round(value);
    if (unit === 'USD') return rate ? Math.round(value / rate * 1e8) : null;
    return null;
  }, [amount, unit, rate]);

  const setSatoshis = useCallback(
    sats => {
      if (sats === null) return setAmount('');
      if (unit === 'BSV') setAmount(convertSatoshisToBSV(sats));
      else if (unit === 'sats') setAmount(String(sats));
      else if (unit === 'USD') setAmount(rate ? convertSatoshisToFiat(sats, rate) : '');
    },
    [unit, rate]
  );

  // 手续费只取决于输入/输出结构，金额变化不重新发请求。
  // 输入防抖 400ms，并用序号丢弃过期结果。
  useEffect(() => {
    setEstimate(null);
    setEstimateError('');
    if (isTargetValid !== true || !amountSatoshis || amountSatoshis <= 0) {
      setIsEstimating(false);
      return undefined;
    }
    const seq = ++requestSeqRef.current;
    const timer = setTimeout(async () => {
      setIsEstimating(true);
      try {
        const result = await estimateRef.current(target, amountSatoshis);
        if (seq !== requestSeqRef.current) return;
        if (result && result.error === 0) {
          setEstimate(result);
          setEstimateError('');
        } else {
          setEstimateError(result?.message || translateRef.current('bsvPayment.transfer.feeUnavailable'));
        }
      } catch {
        if (seq === requestSeqRef.current) {
          setEstimateError(translateRef.current('bsvPayment.transfer.feeUnavailable'));
        }
      } finally {
        if (seq === requestSeqRef.current) setIsEstimating(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [target, amountSatoshis, isTargetValid]);

  const handleMax = async () => {
    setIsCalculatingMax(true);
    setFormError('');
    try {
      const result = await onRequestCalculateMaxTransfer(target);
      const max = result?.maxAmount ?? maxTransferAmountValue;
      if (max === null || max === undefined || max <= 0) {
        setFormError(result?.message || t('bsvPayment.transfer.errors.maxUnavailable'));
        return;
      }
      setMaxApplied(true);
      setSatoshis(max);
    } finally {
      setIsCalculatingMax(false);
    }
  };

  const handleSubmit = async event => {
    event.preventDefault();
    setFormError('');
    if (isTargetValid !== true) {
      setFormError(t('bsvPayment.statusMessages.errors.invalidTargetAddress'));
      addressRef.current?.focus();
      return;
    }
    if (!amountSatoshis || amountSatoshis <= 0) {
      setFormError(t('bsvPayment.transfer.errors.invalidAmount'));
      amountRef.current?.focus();
      return;
    }
    if (maxApplied && maxTransferAmountValue !== null && amountSatoshis > maxTransferAmountValue) {
      setFormError(t('bsvPayment.transfer.errors.amountExceedsMax'));
      return;
    }

    const fee = estimate?.fee ?? 0;
    const total = estimate?.total ?? amountSatoshis + fee;
    const confirmed = await showDialog({
      title: t('bsvPayment.transfer.confirmTitle'),
      message: (
        <div className="space-y-2 text-sm">
          <div className="flex items-start justify-between gap-4">
            <span className="text-muted-foreground">{t('bsvPayment.transfer.confirmRecipient')}</span>
            <span className="break-all text-right font-mono">{target}</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-muted-foreground">{t('bsvPayment.transfer.confirmAmount')}</span>
            <span className="text-right">
              {convertSatoshisToBSV(amountSatoshis)} BSV ({amountSatoshis} sats)
              {rate ? ` · $${convertSatoshisToFiat(amountSatoshis, rate)}` : ''}
            </span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-muted-foreground">{t('bsvPayment.transfer.confirmFee')}</span>
            <span className="text-right">{fee} sats</span>
          </div>
          <div className="flex items-start justify-between gap-4 border-t border-border pt-2 font-medium">
            <span>{t('bsvPayment.transfer.confirmTotal')}</span>
            <span className="text-right">
              {convertSatoshisToBSV(total)} BSV ({total} sats)
              {rate ? ` · $${convertSatoshisToFiat(total, rate)}` : ''}
            </span>
          </div>
          <p className="pt-1 text-xs text-[var(--danger)]">{t('bsvPayment.transfer.irreversible')}</p>
        </div>
      ),
      confirmText: t('bsvPayment.transfer.confirmAction'),
      cancelText: t('bsvPayment.cancelButton'),
    });
    if (!confirmed) return;

    try {
      const result = await onTransferFunds(target, amountSatoshis);
      if (result?.success) {
        setReceipt({
          txid: result.txid || '',
          target,
          amount: amountSatoshis,
          fee: estimate?.fee ?? 0,
          total: estimate?.total ?? amountSatoshis + (estimate?.fee ?? 0),
          at: Date.now(),
        });
        setIsTxidCopied(false);
        setTarget('');
        setAmount('');
        setMaxApplied(false);
      }
    } catch (error) {
      if (!error?.cancelled) {
        setFormError(error?.message || t('bsvPayment.transfer.errors.transferFailed'));
      }
    }
  };

  // 成功消息是带链接的对象，交给回执视图；这里只保留真正的错误文本。
  const statusText = formError || (typeof transferMessage === 'string' ? transferMessage : '');

  const handleCopyTxid = async () => {
    if (!receipt?.txid) return;
    const ok = await copyText(receipt.txid);
    if (ok) {
      setIsTxidCopied(true);
      setTimeout(() => setIsTxidCopied(false), 2000);
    }
  };

  const handleSendAnother = () => {
    setReceipt(null);
    setFormError('');
    setEstimate(null);
    setEstimateError('');
    requestAnimationFrame(() => addressRef.current?.focus());
  };

  const isProcessing = transferStatus === 'processing' || transferStatus === 'preparing';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="animate-in fade-in-0 fixed inset-0 z-40 overflow-y-auto bg-background duration-150"
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col border-border bg-card sm:border-x">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-3">
          <h2 id={titleId} className="text-base font-semibold text-foreground">
            {t('bsvPayment.transfer.transferTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('modal.closeButton')}
            className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {receipt ? (
          <div className="flex-1 px-5 py-6" role="status">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--seal-border)] bg-[var(--seal-soft)] text-[var(--seal-text)]">
                <Check className="h-6 w-6" />
              </div>
              <p className="mt-3 text-lg font-semibold text-[var(--seal-text)]">
                {t('bsvPayment.transfer.broadcastPending')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('bsvPayment.transfer.broadcastPendingHint')}
              </p>
            </div>

            <dl className="mt-6 space-y-2 rounded-[var(--radius)] bg-muted p-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('bsvPayment.transfer.confirmAmount')}</dt>
                <dd className="text-right font-mono">
                  {convertSatoshisToBSV(receipt.amount)} BSV ({receipt.amount} sats)
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('bsvPayment.transfer.confirmRecipient')}</dt>
                <dd className="min-w-0 break-all text-right font-mono text-xs">{receipt.target}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('bsvPayment.transfer.confirmFee')}</dt>
                <dd className="text-right font-mono">{receipt.fee} sats</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-border pt-2 font-medium">
                <dt>{t('bsvPayment.transfer.confirmTotal')}</dt>
                <dd className="text-right font-mono">{convertSatoshisToBSV(receipt.total)} BSV</dd>
              </div>
              <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                <dt>{t('bsvPayment.transfer.sentAt')}</dt>
                <dd>
                  {new Date(receipt.at).toLocaleString(
                    String(i18n.language || '').startsWith('zh') ? 'zh-CN' : 'en-US'
                  )}
                </dd>
              </div>
            </dl>

            {receipt.txid && (
              <div className="mt-4 rounded-[var(--radius)] border border-border p-3">
                <p className="text-xs text-muted-foreground">{t('transactionHistory.txid')}</p>
                <div className="mt-1 flex items-start gap-2">
                  <p className="min-w-0 flex-1 break-all font-mono text-xs">{receipt.txid}</p>
                  <button
                    type="button"
                    onClick={handleCopyTxid}
                    aria-label={isTxidCopied ? t('transactionHistory.copied') : t('transactionHistory.copy')}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {isTxidCopied ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <a
                  href={getTxExplorerUrl(receipt.txid)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs text-primary underline"
                >
                  {t('bsvPayment.viewOnExplorer')} ↗
                </a>
              </div>
            )}

            <div className="mb-[max(1rem,env(safe-area-inset-bottom))] mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-[var(--radius)] bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t('bsvPayment.transfer.done')}
              </button>
              <button
                type="button"
                onClick={handleSendAnother}
                className="w-full rounded-[var(--radius)] border border-border px-4 py-2.5 font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t('bsvPayment.transfer.sendAnother')}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 px-5 py-5">
            <div className="mb-5">
              <label htmlFor="send-target" className="mb-1 block text-sm font-medium text-foreground">
                {t('bsvPayment.transfer.targetAddressLabel')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  ref={addressRef}
                  id="send-target"
                  type="text"
                  value={target}
                  onChange={event => {
                    setTarget(event.target.value.trim());
                    setFormError('');
                    if (transferStatus) onClearTransferStatus();
                  }}
                  placeholder={t('bsvPayment.transfer.targetAddressPlaceholder')}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="text"
                  enterKeyHint="next"
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      amountRef.current?.focus();
                    }
                  }}
                  aria-invalid={isTargetValid === false}
                  aria-describedby={isTargetValid === false ? 'send-target-error' : undefined}
                  className="h-11 min-w-0 flex-1 rounded-[var(--radius)] border border-input bg-transparent px-3 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
                />
                <QRScanner
                  onScanResult={result => {
                    if (result.data) {
                      setTarget(result.data);
                      setFormError('');
                    } else if (result.error) {
                      setFormError(result.error);
                    }
                  }}
                >
                  {({ scan }) => (
                    <button
                      type="button"
                      onClick={scan}
                      aria-label={t('bsvPayment.scanButton')}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] border border-input bg-background text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ScanIcon />
                    </button>
                  )}
                </QRScanner>
              </div>
              {target && isTargetValid === false && (
                <p id="send-target-error" role="alert" className="mt-1 text-xs text-[var(--danger)]">
                  {t('bsvPayment.statusMessages.errors.invalidTargetAddress')}
                </p>
              )}
              {isTargetValid === true && (
                <p className="mt-1 text-xs text-[var(--seal-text)]">
                  ✓ {isValidPaymail(target) ? t('bsvPayment.transfer.paymailDetected') : t('bsvPayment.transfer.addressDetected')}
                </p>
              )}
            </div>

            <div className="mb-4">
              <label htmlFor="send-amount" className="mb-1 block text-sm font-medium text-foreground">
                {t('bsvPayment.transfer.transferAmountLabel')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  ref={amountRef}
                  id="send-amount"
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="done"
                  value={amount}
                  onChange={event => {
                    setAmount(event.target.value.replace(/[^0-9.]/g, ''));
                    setFormError('');
                    if (transferStatus) onClearTransferStatus();
                  }}
                  placeholder="0"
                  autoComplete="off"
                  className="h-11 min-w-0 flex-1 rounded-[var(--radius)] border border-input bg-transparent px-3 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
                />
                <button
                  type="button"
                  onClick={handleMax}
                  disabled={isCalculatingMax}
                  aria-label={`${t('bsvPayment.transfer.maxLabel')}: ${t('bsvPayment.transfer.maxAvailable')}`}
                  className="h-11 shrink-0 rounded-[var(--radius)] border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {isCalculatingMax ? t('bsvPayment.transfer.calculating') : t('bsvPayment.transfer.maxLabel')}
                </button>
                <SimpleSelect
                  value={unit}
                  onValueChange={setUnit}
                  className="w-[86px] shrink-0"
                  ariaLabel={t('bsvPayment.transfer.unitLabel')}
                >
                  <SimpleSelectItem value="BSV">BSV</SimpleSelectItem>
                  <SimpleSelectItem value="sats">sats</SimpleSelectItem>
                  {rate && <SimpleSelectItem value="USD">USD</SimpleSelectItem>}
                </SimpleSelect>
              </div>

              <div className="mt-2 min-h-[40px] rounded-[var(--radius)] bg-muted px-3 py-2 text-xs text-muted-foreground" aria-live="polite">
                {isEstimating ? (
                  <span>{t('bsvPayment.transfer.estimating')}</span>
                ) : estimate ? (
                  <div className="space-y-0.5">
                    <div className="flex justify-between gap-3">
                      <span>{t('bsvPayment.transfer.confirmFee')}</span>
                      <span className="font-mono">{estimate.fee} sats</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>{t('bsvPayment.transfer.confirmTotal')}</span>
                      <span className="font-mono">
                        {convertSatoshisToBSV(estimate.total)} BSV
                        {rate ? ` · $${convertSatoshisToFiat(estimate.total, rate)}` : ''}
                      </span>
                    </div>
                  </div>
                ) : estimateError ? (
                  <span className="text-[var(--warn)]">{estimateError}</span>
                ) : (
                  <span>{t('bsvPayment.transfer.feeHint')}</span>
                )}
              </div>
            </div>

            {statusText && (
              <p
                role={formError ? 'alert' : 'status'}
                aria-live="polite"
                className="mb-3 break-words text-sm text-[var(--danger)]"
              >
                {statusText}
              </p>
            )}

            <p className="mb-4 text-xs text-muted-foreground">{t('bsvPayment.transfer.irreversible')}</p>

            <button
              type="submit"
              disabled={isProcessing || isEstimating}
              className="mb-[max(1rem,env(safe-area-inset-bottom))] w-full rounded-[var(--radius)] bg-primary px-4 py-3 font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {isProcessing ? t('bsvPayment.processingButton') : t('bsvPayment.transfer.sendAction')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
