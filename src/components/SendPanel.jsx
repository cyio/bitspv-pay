import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Check } from 'lucide-react';
import { useDialog } from '../contexts/DialogContext';
import QRScanner from './QRScanner';
import { SimpleSelect, SimpleSelectItem } from '@/components/ui/SimpleSelect';
import { isValidAddress, isValidPaymail, convertSatoshisToBSV, convertSatoshisToFiat } from '../utils/bsv';
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
  const { t } = useTranslation();
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
  const [sentTxid, setSentTxid] = useState('');
  const titleId = React.useId();

  useLockBodyScroll(true);

  useEffect(() => {
    const frame = requestAnimationFrame(() => addressRef.current?.focus());
    const onKeyDown = event => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

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
        setSentTxid(result.txid || '');
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

  const statusText = formError || transferMessage;
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

        {sentTxid ? (
          <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--seal-border)] bg-[var(--seal-soft)] text-[var(--seal-text)]">
              <Check className="h-6 w-6" />
            </div>
            <p className="text-lg font-semibold text-foreground">{t('bsvPayment.statusMessages.transactionSent')}</p>
            {sentTxid && (
              <a
                href={getTxExplorerUrl(sentTxid)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 break-all text-sm text-primary underline"
              >
                {sentTxid}
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="mt-8 w-full rounded-[var(--radius)] bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('bsvPayment.transfer.done')}
            </button>
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
                {typeof statusText === 'object' ? statusText.text : statusText}
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
