import React, { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { OFFLINE_RELEASE_URL } from '../utils/links';

const FormItem = ({ children, className }) => <div className={className}>{children}</div>;
const FormLabel = ({ children }) => (
  <label className="block text-sm font-medium text-foreground mb-1">{children}</label>
);
const FormControl = ({ children }) => <div>{children}</div>;
const FormMessage = ({ children }) => <p className="text-sm text-destructive mt-1">{children}</p>;
const FormField = ({ control, name, render, rules }) => (
  <Controller
    control={control}
    name={name}
    rules={rules}
    render={({ field, fieldState, formState }) => render({ field, fieldState, formState })}
  />
);
const Input = React.forwardRef(({ className = '', ...props }, ref) => (
  <input
    ref={ref}
    className={`flex h-9 w-full rounded-[var(--radius)] border border-input bg-transparent px-3 py-1 text-base transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm ${className}`}
    {...props}
  />
));
const Button = ({ children, variant, ...props }) => {
  const baseClasses =
    'inline-flex items-center justify-center rounded-[var(--radius)] px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';
  const variantClasses =
    variant === 'outline'
      ? 'border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground'
      : 'bg-primary text-primary-foreground hover:bg-primary/90';
  return (
    <button className={`${baseClasses} ${variantClasses}`} {...props}>
      {children}
    </button>
  );
};

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
    defaultValues: inputs.reduce(
      (acc, input) => ({ ...acc, [input.id]: input.defaultValue || '' }),
      {}
    ),
  });

  const {
    reset,
    formState: { errors },
  } = form;

  const stringifiedInputs = JSON.stringify(inputs);
  useEffect(() => {
    if (isOpen) {
      const currentInputs = JSON.parse(stringifiedInputs);
      reset(
        currentInputs.reduce((acc, input) => ({ ...acc, [input.id]: input.defaultValue || '' }), {})
      );
    }
  }, [isOpen, stringifiedInputs, reset]);

  // Esc 与 X / 点遮罩走同一条关闭路径。注意「设密码」那一步是锁住的
  // （hideModalHeaderCloseButton 且无取消按钮），那时按键应当无效。
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = event => {
      if (event.key !== 'Escape') return;
      if (showCancelButton || !hideModalHeaderCloseButton) {
        onReject(new Error('Dialog closed by user.'));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, showCancelButton, hideModalHeaderCloseButton, onReject]);

  if (!isOpen) {
    return null;
  }

  const handleOverlayClick = e => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  // 只要这个弹窗允许被关掉（有取消按钮，或没被锁住头部关闭），
  // 遮罩点击 / Esc / X 都走同一条路径。
  const canClose = !hideModalHeaderCloseButton || showCancelButton;
  const handleClose = () => {
    if (canClose) {
      onReject(new Error('Dialog closed by user.'));
    }
  };

  const onSubmit = values => {
    onResolve(values);
  };

  // 只读的地址栏不参与聚焦：光标直接落在第一个可编辑的输入框。
  const firstEditableIndex = inputs.findIndex(input => !input.readOnly);

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
          className={input.readOnly ? 'cursor-default opacity-70' : undefined}
        />
      </FormControl>
      {input.hintMessage && (
        <p className="text-xs text-muted-foreground mt-1">{input.hintMessage}</p>
      )}
      {formState.errors[input.id] && (
        <FormMessage>{formState.errors[input.id].message}</FormMessage>
      )}
    </FormItem>
  );

  const InfoDialogContent = () => (
    <>
      <div className="p-6">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {message && <p className="mt-2 text-sm text-muted-foreground">{message}</p>}
      </div>
      <div className="bg-muted px-4 py-3 sm:px-6 flex justify-end">
        <Button onClick={() => onResolve()}>{confirmButtonText}</Button>
      </div>
    </>
  );

  const FormDialogContent = () => (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <div className="p-6">
        <div className="flex justify-between items-start">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {!hideModalHeaderCloseButton && (
            <button
              type="button"
              onClick={handleClose}
              className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
        {message && <p className="mt-2 text-sm text-muted-foreground">{message}</p>}

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
                message: t('bsvPayment.pinModal.validation.minLength', {
                  field: input.label,
                  min: input.minLength,
                }),
              };
            }
            if (input.maxLength) {
              rules.maxLength = {
                value: input.maxLength,
                message: t('bsvPayment.pinModal.validation.maxLength', {
                  field: input.label,
                  max: input.maxLength,
                }),
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
                render={props =>
                  renderField(props, { ...input, autoFocus: index === firstEditableIndex })
                }
              />
            );
          })}
        </div>
      </div>

      <div className="bg-muted px-4 py-3 sm:px-6 flex justify-end gap-2">
        {showCancelButton && (
          <Button
            type="button"
            variant="outline"
            onClick={() => onReject(new Error('User cancelled.'))}
          >
            {cancelButtonText}
          </Button>
        )}
        <Button type="submit">{confirmButtonText}</Button>
      </div>
    </form>
  );

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"
      onClick={handleOverlayClick}
    >
      <div className="bg-card rounded-[var(--radius)] border border-border w-full max-w-md mx-auto">
        {mode === 'info' ? <InfoDialogContent /> : <FormDialogContent />}
      </div>
    </div>
  );
};

export default PinDialog;
