
import React, { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

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
  
  const renderField = ({ field, fieldState, formState }, input) => (
    <FormItem className="mb-4">
      <FormLabel>{input.label}</FormLabel>
      <FormControl>
        <Input
          type={input.type}
          placeholder={input.placeholder}
          maxLength={input.maxLength}
          {...field}
          autoFocus={input.autoFocus}
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
            if (input.required) {
              rules.required = t('bsvPayment.pinModal.validation.required', { field: input.label });
            }
            if (input.maxLength) {
              rules.maxLength = {
                value: input.maxLength,
                message: t('bsvPayment.pinModal.validation.maxLength', { field: input.label, max: input.maxLength }),
              };
            }
            return (
              <FormField
                key={input.id}
                control={form.control}
                name={input.id}
                rules={rules}
                render={(props) => renderField(props, { ...input, autoFocus: index === 0 })}
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center" onClick={handleOverlayClick}>
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-md mx-auto">
        {mode === 'info' ? <InfoDialogContent /> : <FormDialogContent />}
      </div>
    </div>
  );
};

export default PinDialog;
