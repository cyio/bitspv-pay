import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { copyText } from '../utils/clipboard';

/**
 * 收款是钱包的主操作之一，不该只藏在地址栏的 26px 小图标后面。
 * 这里给二维码一个足够大的白底画布，并把地址文本单独做成可复制项。
 */
export default function ReceiveModal({ open, onClose, address, qrcode }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const handleCopy = async () => {
    const ok = await copyText(address);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('bsvPayment.receive.title')}</DialogTitle>
          <DialogDescription>{t('bsvPayment.receive.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          {qrcode ? (
            <img
              src={qrcode}
              alt={t('bsvPayment.qrCode')}
              className="h-60 w-60 rounded-[var(--radius)] border border-border bg-white p-2"
            />
          ) : (
            <div className="flex h-60 w-60 items-center justify-center rounded-[var(--radius)] border border-border bg-muted text-xs text-muted-foreground">
              {t('bsvPayment.qrLoading')}
            </div>
          )}

          <div className="w-full rounded-[var(--radius)] bg-muted p-3">
            <p className="text-[11px] leading-4 text-muted-foreground">
              {t('bsvPayment.receive.addressLabel')}
            </p>
            <p className="select-all break-all font-mono text-sm">{address}</p>
          </div>
        </div>

        <DialogFooter>
          <Button className="w-full" onClick={handleCopy}>
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                {t('bsvPayment.receive.copied')}
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                {t('bsvPayment.receive.copyAddress')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
