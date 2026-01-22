import React, { useState, useCallback, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogContext } from '../contexts/DialogContext';
import { PinPromptContext } from '../contexts/PinPromptContext';
import PinDialog from './PinDialog';

const Button = ({ children, variant, ...props }) => {
  const baseClasses = "px-4 py-2 rounded-md font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2";
  const variantClasses = variant === 'outline'
    ? "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
    : "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500";
  return <button className={`${baseClasses} ${variantClasses}`} {...props}>{children}</button>;
}

function CustomAlertDialog({ open, onOpenChange, title, message, children }) {
  if (!open) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
        onOpenChange(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center" onClick={handleOverlayClick}>
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-md mx-auto">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-400 max-h-[70vh] overflow-y-auto">
            {message}
          </div>

        </div>
        <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse space-x-reverse space-x-2">
          {children}
        </div>
      </div>
    </div>
  );
}


export function DialogProvider({ children }) {
  const { t } = useTranslation();
  const [dialogState, setDialogState] = useState({ isOpen: false });
  const [pinState, setPinState] = useState({ isOpen: false });
  const [pinPromise, setPinPromise] = useState(null);

  const promptForPin = useCallback((mode = 'enter', options = {}) => {
    return new Promise((resolve, reject) => {
      const {
        title = mode === 'enter' ? t('bsvPayment.pinModal.enterPinTitle') : t('bsvPayment.pinModal.createPinTitle'),
        message = mode === 'enter' ? t('bsvPayment.pinModal.enterPinMessage') : t('bsvPayment.pinModal.createPinMessage'),
        confirmButtonText = mode === 'enter' ? t('bsvPayment.pinModal.unlockButton') : t('bsvPayment.pinModal.createButton'),
        cancelButtonText = t('bsvPayment.pinModal.cancelButton'),
        showCancelButton = true,
        hideModalHeaderCloseButton = false,
        inputs = [],
      } = options;

      setPinState({
        isOpen: true,
        mode,
        title,
        message,
        confirmButtonText,
        cancelButtonText,
        showCancelButton,
        hideModalHeaderCloseButton,
        inputs,
      });
      setPinPromise({ resolve, reject });
    });
  }, [t]);

  const showInfo = useCallback((title, message, confirmButtonText = t('bsvPayment.statusMessages.confirmButton')) => {
    return new Promise((resolve) => {
      setPinState({
        isOpen: true,
        mode: 'info',
        title,
        message,
        confirmButtonText,
        onResolve: () => {
          setPinState({ isOpen: false });
          resolve();
        },
      });
    });
  }, [t]);

  const clearPinError = useCallback(() => {
    setPinState(prevState => ({ ...prevState, pinErrorMessage: '' }));
  }, []);

  const handlePinResolve = (value) => {
    if (pinPromise) {
      pinPromise.resolve(value);
    }
    setPinState({ isOpen: false });
    setPinPromise(null);
  };

  const handlePinReject = (error) => {
    if (pinPromise) {
      pinPromise.reject(error);
    }
    setPinState({ isOpen: false });
    setPinPromise(null);
  };

  const showDialog = useCallback((options) => {
    return new Promise((resolve) => {
      const {
        title,
        message: rawMessage,
        confirmText = t('bsvPayment.statusMessages.confirmButton'),
        cancelText = t('bsvPayment.statusMessages.cancelButton'),
        showCancel = true,
      } = options;
      
      const message =
        typeof rawMessage === 'string' || React.isValidElement(rawMessage)
          ? rawMessage
          : rawMessage && (
              <div>
                <p>{rawMessage.text}</p>
                {rawMessage.linkUrl && (
                  <a
                    href={rawMessage.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline mt-2 block"
                  >
                    {rawMessage.linkText || 'View on Explorer'}
                  </a>
                )}
              </div>
            );

      setDialogState({
        isOpen: true,
        title,
        message,
        confirmText,
        cancelText,
        showCancel,
        onConfirm: () => {
          setDialogState({ isOpen: false });
          resolve(true);
        },
        onCancel: () => {
          setDialogState({ isOpen: false });
          resolve(false);
        },
      });
    });
  }, [t]);

  const dialogContextValue = {
    showDialog,
  };

  const pinPromptContextValue = {
    promptForPin,
    showInfo,
    clearPinError,
  };

  const handleOpenChange = (open) => {
    if (!open) {
      dialogState.onCancel?.();
    }
  }

  return (
    <DialogContext.Provider value={dialogContextValue}>
      <PinPromptContext.Provider value={pinPromptContextValue}>
        {children}
        <PinDialog
          pinState={pinState}
          onResolve={handlePinResolve}
          onReject={handlePinReject}
        />
        <CustomAlertDialog
          open={dialogState.isOpen}
          onOpenChange={handleOpenChange}
          title={dialogState.title}
          message={dialogState.message}
        >
          {dialogState.showCancel && <Button variant="outline" onClick={dialogState.onCancel}>{dialogState.cancelText}</Button>}
          <Button onClick={dialogState.onConfirm}>{dialogState.confirmText}</Button>
        </CustomAlertDialog>
      </PinPromptContext.Provider>
    </DialogContext.Provider>
  );
}

export const useDialog = () => useContext(DialogContext);
