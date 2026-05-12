import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import jsQR from 'jsqr';

// BarcodeDetector 可用性检测（Chrome Android 83+，Chrome Desktop 83+）
const hasNativeDetector = () =>
  typeof window !== 'undefined' &&
  'BarcodeDetector' in window;

const QRScanner = ({ onScanResult, children }) => {
  const { t } = useTranslation();
  const [showPreview, setShowPreview] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  // 控制扫描循环生命周期，避免组件卸载后回调
  const activeRef = useRef(false);

  const stopScanning = () => {
    activeRef.current = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowPreview(false);
    setShowFallback(false);
  };

  const scan = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setShowFallback(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      setShowPreview(true);
    } catch (error) {
      // file:// 协议下 Android Chrome 会抛 NotAllowedError，降级为拍照识别
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setShowFallback(true);
      } else {
        onScanResult({
          error: `${t('bsvPayment.qrErrorCameraAccessFailed')}: ${error.message}`,
        });
      }
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reset = () => {
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      setShowFallback(false);
    };

    try {
      if (hasNativeDetector()) {
        // BarcodeDetector: createImageBitmap(Blob) bypasses canvas entirely,
        // no taint issue on file:// protocol.
        const bitmap = await createImageBitmap(file);
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const codes = await detector.detect(bitmap);
        bitmap.close();
        reset();
        if (codes.length > 0) {
          onScanResult({ data: codes[0].rawValue });
        } else {
          onScanResult({ error: t('bsvPayment.qrErrorDecodeFailedFromPhoto') });
        }
        return;
      }
    } catch {
      // BarcodeDetector failed, fall through to jsQR
    }

    // jsQR fallback: use FileReader (data URL) — not createObjectURL, which
    // produces blob:null on file:// and taints the canvas.
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 2000;
        let dw = img.width, dh = img.height;
        if (dw > MAX || dh > MAX) {
          const scale = MAX / Math.max(dw, dh);
          dw = Math.round(dw * scale);
          dh = Math.round(dh * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = dw;
        canvas.height = dh;
        const ctx = canvas.getContext('2d');
        ctx.filter = 'contrast(1.5) brightness(1.05)';
        ctx.drawImage(img, 0, 0, dw, dh);
        ctx.filter = 'none';
        let imageData;
        try {
          imageData = ctx.getImageData(0, 0, dw, dh);
        } catch {
          reset();
          onScanResult({ error: t('bsvPayment.qrErrorDecodeFailedFromPhoto') });
          return;
        }
        const code = jsQR(imageData.data, dw, dh);
        reset();
        if (code) {
          onScanResult({ data: code.data });
        } else {
          onScanResult({ error: t('bsvPayment.qrErrorDecodeFailedFromPhoto') });
        }
      };
      img.onerror = () => {
        reset();
        onScanResult({ error: t('bsvPayment.qrErrorDecodeFailedFromPhoto') });
      };
      img.src = ev.target.result;
    };
    reader.onerror = () => {
      onScanResult({ error: t('bsvPayment.qrErrorDecodeFailedFromPhoto') });
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!showPreview || !videoRef.current) return;

    const video = videoRef.current;
    video.srcObject = streamRef.current;
    video.play().catch(err => console.error('video play error', err));

    activeRef.current = true;

    if (hasNativeDetector()) {
      // ── 路径 A：BarcodeDetector（原生，快且准）──────────────────────────
      let detector;
      try {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch {
        // 万一构造失败降级（下方 else 分支不会再执行，因此这里直接 return 后
        // 让 useEffect 重新以 jsQR 路径运行——但实际上 hasNativeDetector 已
        // 确认可用，这里只是保险）
        activeRef.current = false;
        return;
      }

      const tick = async () => {
        if (!activeRef.current) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          try {
            const codes = await detector.detect(video);
            if (codes.length > 0) {
              stopScanning();
              onScanResult({ data: codes[0].rawValue });
              return;
            }
          } catch {
            // 单帧失败忽略，继续下一帧
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);

    } else {
      // ── 路径 B：jsQR 降级（中心裁剪 + 对比度预处理）──────────────────
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      let lastScan = 0;

      const tick = () => {
        if (!activeRef.current) return;

        const now = performance.now();
        // jsQR 是同步 CPU 密集任务，限制最高 10fps 避免卡顿
        if (now - lastScan >= 100 && video.readyState === video.HAVE_ENOUGH_DATA) {
          lastScan = now;

          const vw = video.videoWidth;
          const vh = video.videoHeight;

          // 中心裁剪：取短边的 70%（与 UI 引导框比例对应）
          const cropSize = Math.round(Math.min(vw, vh) * 0.7);
          const cropX = Math.round((vw - cropSize) / 2);
          const cropY = Math.round((vh - cropSize) / 2);

          canvas.width = cropSize;
          canvas.height = cropSize;

          // 对比度 + 亮度预处理，提升低光环境识别率
          ctx.filter = 'contrast(1.5) brightness(1.1)';
          ctx.drawImage(video, cropX, cropY, cropSize, cropSize, 0, 0, cropSize, cropSize);
          ctx.filter = 'none';

          try {
            const imageData = ctx.getImageData(0, 0, cropSize, cropSize);
            const code = jsQR(imageData.data, cropSize, cropSize);
            if (code) {
              stopScanning();
              onScanResult({ data: code.data });
              return;
            }
          } catch {
            // 单帧解码失败忽略
          }
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      activeRef.current = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [showPreview]);

  return (
    <>
      {children({ scan })}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      {showFallback && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center px-6">
          <button
            onClick={stopScanning}
            className="absolute top-4 right-4 text-white text-xl bg-black bg-opacity-50 rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-70"
          >
            ×
          </button>
          <p className="text-white text-center text-sm opacity-80 mb-6">
            {t('bsvPayment.qrCameraFallbackHint')}
          </p>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="bg-white text-black font-semibold px-6 py-3 rounded-lg text-base"
            >
              {t('bsvPayment.qrCameraFallbackCamera')}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-white bg-opacity-20 text-white font-semibold px-6 py-3 rounded-lg text-base"
            >
              {t('bsvPayment.qrCameraFallbackGallery')}
            </button>
          </div>
        </div>
      )}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black">
          <button
            onClick={stopScanning}
            className="z-50 absolute top-4 right-4 text-white text-xl bg-black bg-opacity-50 rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-70"
          >
            ×
          </button>
          <video ref={videoRef} className="w-full h-full object-cover" playsInline></video>

          {/* 蒙层 + 引导框（两条路径均显示，给用户对准提示） */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="absolute inset-0 bg-black bg-opacity-50" />
            <div
              className="relative z-10 rounded-lg"
              style={{
                width: '70vmin',
                height: '70vmin',
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
              }}
            >
              {[
                'top-0 left-0 border-t-4 border-l-4 rounded-tl-lg',
                'top-0 right-0 border-t-4 border-r-4 rounded-tr-lg',
                'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg',
                'bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg',
              ].map((cls, i) => (
                <span key={i} className={`absolute w-6 h-6 border-white ${cls}`} />
              ))}
            </div>
            <p className="relative z-10 mt-6 text-white text-sm opacity-80">
              {hasNativeDetector() ? t('bsvPayment.qrScanner.hint') : t('bsvPayment.qrScanner.hintFallback')}
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default QRScanner;
