
import React, { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { OFFLINE_RELEASE_URL } from '../utils/links';

const FormItem = ({ children, className }) => <div className={className}>{children}</div>;
const FormLabel = ({ children }) => <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{children}</label>;
const FormControl = ({ children }) => <div>{children}</div>;
const FormMessage = ({ children }) => <p className="text-sm text-red-600 mt-1">{children}</p>;
const FormField = ({ control, name, render, rules }) => (
  <Controller
    control={control}
    name={name}
    rules={rules}
    render={({ field, fieldState, formState }) => render({ field, fieldState, formState })}
  />
);
const Input = React.forwardRef(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white ${className}`}
    {...props}
  />
));
const Button = ({ children, variant, ...props }) => {
  const baseClasses = "px-4 py-2 rounded-md font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2";
  const variantClasses = variant === 'outline'
    ? "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
    : "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500";
  return <button className={`${baseClasses} ${variantClasses}`} {...props}>{children}</button>;
}


const PinDialog = ({ pinState, onResolve, onReject }) => {
  const { t } = useTranslation();
  const {
    isOpen,
    title,
    message,
    inputs = [],
    confirmButtonText,
    cancelButtonText,
    showCancelButton,
    hideModalHeaderCloseButton,
    mode,
  } = pinState;
  
  const form = useForm({
    defaultValues: inputs.reduce((acc, input) => ({ ...acc, [input.id]: input.defaultValue || '' }), {}),
  });

  const { reset, formState: { errors } } = form;

  const stringifiedInputs = JSON.stringify(inputs);
  useEffect(() => {
    if (isOpen) {
      const currentInputs = JSON.parse(stringifiedInputs);
      reset(currentInputs.reduce((acc, input) => ({ ...acc, [input.id]: input.defaultValue || '' }), {}));
    }
  }, [isOpen, stringifiedInputs, reset]);

  if (!isOpen) {
    return null;
  }
  
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
        handleClose();
    }
  };

  const handleClose = () => {
    if (showCancelButton || !hideModalHeaderCloseButton) {
      onReject(new Error('Dialog closed by user.'));
    }
  };

  const onSubmit = (values) => {
    onResolve(values);
  };

  // 只读的地址栏不参与聚焦：光标直接落在第一个可编辑的输入框。
  const firstEditableIndex = inputs.findIndex((input) => !input.readOnly);
  
  const renderField = ({ field, fieldState, formState }, input) => (
    <FormItem className="mb-4">
      <FormLabel>{input.label}</FormLabel>
      <FormControl>
        <Input
          {...field}
          // RHF 的 field.name 只是内部注册名；浏览器密码库认的是 DOM 上的
          // name/id/autocomplete，所以这里必须覆盖成标准名字（username / password），
          // 否则一个 origin 下只能存住一条凭据。
          name={input.htmlName || input.id}
          id={input.id}
          type={input.type}
          placeholder={input.placeholder}
          maxLength={input.maxLength}
          autoComplete={input.autoComplete}
          readOnly={input.readOnly}
          tabIndex={input.readOnly ? -1 : undefined}
          aria-readonly={input.readOnly ? 'true' : undefined}
          autoFocus={input.autoFocus}
          className={
            input.readOnly
              ? 'cursor-default opacity-70'
              : undefined
          }
        />
      </FormControl>
      {input.hintMessage && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{input.hintMessage}</p>}
      {formState.errors[input.id] && <FormMessage>{formState.errors[input.id].message}</FormMessage>}
    </FormItem>
  );

  const InfoDialogContent = () => (
    <>
      <div className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
        {message && <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{message}</p>}
      </div>
      <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 sm:px-6 flex justify-end">
        <Button onClick={() => onResolve()}>{confirmButtonText}</Button>
      </div>
    </>
  );

  const FormDialogContent = () => (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <div className="p-6">
        <div className="flex justify-between items-start">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
            {!hideModalHeaderCloseButton && (
            <button type="button" onClick={handleClose} className="text-gray-400 hover:text-gray-500">
                &times;
            </button>
            )}
        </div>
        {message && <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{message}</p>}

        <div className="py-4">
          {inputs.map((input, index) => {
            const rules = {};
            if (input.validate) {
              rules.validate = input.validate;
            }
            if (input.required) {
              rules.required = t('bsvPayment.pinModal.validation.required', { field: input.label });
            }
            if (input.minLength) {
              rules.minLength = {
                value: input.minLength,
                message: t('bsvPayment.pinModal.validation.minLength', { field: input.label, min: input.minLength }),
              };
            }
            if (input.maxLength) {
              rules.maxLength = {
                value: input.maxLength,
                message: t('bsvPayment.pinModal.validation.maxLength', { field: input.label, max: input.maxLength }),
              };
            }
            if (input.pattern) {
              rules.pattern = {
                value: input.pattern,
                message: t('bsvPayment.pinModal.validation.pattern'),
              };
            }
            return (
              <FormField
                key={input.id}
                control={form.control}
                name={input.id}
                rules={rules}
                render={(props) => renderField(props, { ...input, autoFocus: index === firstEditableIndex })}
              />
            );
          })}
        </div>
      </div>
      
      <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 sm:px-6 flex justify-end gap-2">
        {showCancelButton && (
          <Button type="button" variant="outline" onClick={() => onReject(new Error('User cancelled.'))}>
            {cancelButtonText}
          </Button>
        )}
        <Button type="submit">{confirmButtonText}</Button>
      </div>
    </form>
  );

  const SetupDialogContent = () => (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('bsvPayment.walletSetup.title')}</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{t('bsvPayment.walletSetup.prompt')}</p>

      <div className="flex flex-col gap-3">
        <Button onClick={() => onResolve({ action: 'create' })}>
          {t('bsvPayment.walletSetup.createButton')}
        </Button>
        <Button variant="outline" onClick={() => onResolve({ action: 'import' })}>
          {t('bsvPayment.walletSetup.importButton')}
        </Button>
        <Button variant="outline" onClick={() => onResolve({ action: 'watch' })}>
          {t('bsvPayment.walletSetup.watchButton')}
        </Button>
      </div>

      {/* 冷存储是同一把钥匙的第二种用法，但它不属于这个网页：
          只想离线保管的人应该拿到一个文件，而不是被要求先建个热钱包。 */}
      <div className="mt-5 pt-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('bsvPayment.coldStorage.setupTitle')}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {t('bsvPayment.coldStorage.setupHint')}
        </p>
        <a
          href={OFFLINE_RELEASE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          {t('bsvPayment.coldStorage.setupLink')} →
        </a>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center" onClick={handleOverlayClick}>
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-md mx-auto">
        {mode === 'info' ? <InfoDialogContent /> : 
         mode === 'setup' ? <SetupDialogContent /> : 
         <FormDialogContent />}
      </div>
    </div>
  );
};

export default PinDialog;
