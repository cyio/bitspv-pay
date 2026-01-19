import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import jsQR from 'jsqr';

const QRScanner = ({ onScanResult, children }) => {
  const { t } = useTranslation();
  const [showPreview, setShowPreview] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);

  const stopScanning = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowPreview(false);
  };

  const scan = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      onScanResult({ error: t('bsvPayment.qrErrorNotSupported') });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      setShowPreview(true);
    } catch (error) {
      onScanResult({
        error: `${t('bsvPayment.qrErrorCameraAccessFailed')}: ${error.message}`
      });
    }
  };

  useEffect(() => {
    if (showPreview && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(err=>{
        console.error('video play error', err)
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      scanIntervalRef.current = setInterval(() => {
        if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

          try {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);

            if (code) {
              stopScanning();
              onScanResult({ data: code.data });
            }
          } catch (error) {
            // Ignore jsQR decoding errors
          }
        }
      }, 500);
    }

    return () => {
      // Cleanup on unmount or if showPreview changes
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, [showPreview, onScanResult, t]);

  return (
    <>
      {children({ scan })}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-80">
          <button
            onClick={stopScanning}
            className="z-50 absolute top-4 right-4 text-white text-xl bg-black bg-opacity-50 rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-70"
          >
            ×
          </button>
          <video ref={videoRef} className="w-full h-full object-cover" playsInline></video>
        </div>
      )}
    </>
  );
};

export default QRScanner;
