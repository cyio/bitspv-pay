import React, { useEffect, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import Portal, { useLockBodyScroll } from './Portal';

const FormItem = ({ children, className }) => <div className={className}>{children}</div>;
const FormLabel = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground mb-1">
    {children}
  </label>
);
const FormControl = ({ children }) => <div>{children}</div>;
const FormMessage = ({ children, id }) => (
  <p id={id} className="text-sm text-destructive mt-1">
    {children}
  </p>
);
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
    // 异步校验器：由调用方提供（比如用密码解密私钥）。失败时弹窗不关闭，
    // 错误就地显示，用户可以直接重输；成功时才 resolve 表单值。
    validate: validatePassword,
  } = pinState;

  const [formError, setFormError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  const form = useForm({
    defaultValues: inputs.reduce(
      (acc, input) => ({ ...acc, [input.id]: input.defaultValue || '' }),
      {}
    ),
  });

  const cardRef = useRef(null);
  const titleId = React.useId();
  const descriptionId = React.useId();
  useLockBodyScroll(isOpen);

  // 这是手写的浮层，Radix 的焦点锁帮不上忙：Tab 必须留在弹窗内，
  // 否则键盘用户会跑到被遮罩盖住的主界面上操作。
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = event => {
      if (event.key !== 'Tab' || !cardRef.current) return;
      const focusable = cardRef.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

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
      setFormError('');
      setIsValidating(false);
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

  const focusPasswordField = () => {
    const field = cardRef.current?.querySelector('input:not([readonly])');
    field?.focus();
    field?.select?.();
  };

  const onSubmit = async values => {
    if (isValidating) return;
    setFormError('');
    if (!validatePassword) {
      onResolve(values);
      return;
    }
    setIsValidating(true);
    try {
      const result = await validatePassword(values);
      if (result && result.ok === false) {
        // 关键：不关弹窗、不 reject promise。调用方的 await 会继续等这一次输入。
        setFormError(result.error || t('bsvPayment.pinModal.wrongPassword'));
        focusPasswordField();
        return;
      }
      onResolve({ ...values, ...(result?.data || {}) });
    } catch (error) {
      setFormError(error?.message || t('bsvPayment.pinModal.wrongPassword'));
      focusPasswordField();
    } finally {
      setIsValidating(false);
    }
  };

  // 只读的地址栏不参与聚焦：光标直接落在第一个可编辑的输入框。
  const firstEditableIndex = inputs.findIndex(input => !input.readOnly);

  const renderField = ({ field, fieldState, formState }, input) => {
    const error = formState.errors[input.id];
    const describedBy = [
      input.hintMessage ? `${input.id}-hint` : null,
      error ? `${input.id}-error` : null,
      formError && input.type === 'password' ? 'pin-form-error' : null,
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <FormItem className="mb-4">
        <FormLabel htmlFor={input.id}>{input.label}</FormLabel>
        <FormControl>
          <Input
            {...field}
            // 用户开始改密码时清掉上一次的「密码不正确」，避免误导。
            onChange={event => {
              if (formError) setFormError('');
              field.onChange(event);
            }}
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
            aria-invalid={error || (formError && input.type === 'password') ? 'true' : undefined}
            aria-describedby={describedBy || undefined}
            autoFocus={input.autoFocus}
            className={input.readOnly ? 'cursor-default opacity-70' : undefined}
          />
        </FormControl>
        {input.hintMessage && (
          <p id={`${input.id}-hint`} className="text-xs text-muted-foreground mt-1">
            {input.hintMessage}
          </p>
        )}
        {error && <FormMessage id={`${input.id}-error`}>{error.message}</FormMessage>}
      </FormItem>
    );
  };

  const InfoDialogContent = () => (
    <>
      <div className="p-6">
        <h2 id={titleId} className="text-lg font-semibold text-foreground">{title}</h2>
        {message && (
          <p id={descriptionId} className="mt-2 text-sm text-muted-foreground">
            {message}
          </p>
        )}
      </div>
      <div className="bg-muted px-4 py-3 sm:px-6 flex justify-end">
        <Button onClick={() => onResolve()}>{confirmButtonText}</Button>
      </div>
    </>
  );

  const FormDialogContent = () => (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <div className="p-6">
        <div className="flex justify-between items-start gap-2">
          <h2 id={titleId} className="text-lg font-semibold text-foreground">{title}</h2>
          {!hideModalHeaderCloseButton && (
            <button
              type="button"
              onClick={handleClose}
              aria-label={t('modal.closeButton')}
              className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
        {message && (
          <p id={descriptionId} className="mt-2 text-sm text-muted-foreground">
            {message}
          </p>
        )}

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

        {formError && (
          <p
            id="pin-form-error"
            role="alert"
            className="rounded-[var(--radius)] border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]"
          >
            {formError}
          </p>
        )}
      </div>

      <div className="bg-muted px-4 py-3 sm:px-6 flex justify-end gap-2">
        {showCancelButton && (
          <Button
            type="button"
            variant="outline"
            disabled={isValidating}
            onClick={() => onReject(new Error('User cancelled.'))}
          >
            {cancelButtonText}
          </Button>
        )}
        <Button type="submit" disabled={isValidating}>
          {isValidating ? t('bsvPayment.pinModal.checkingButton') : confirmButtonText}
        </Button>
      </div>
    </form>
  );

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/80 p-4 py-8"
        onClick={handleOverlayClick}
      >
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={message ? descriptionId : undefined}
          className="my-auto w-full max-w-md overflow-y-auto rounded-[var(--radius)] border border-border bg-card shadow-lg max-h-[calc(100dvh-4rem)]"
        >
          {mode === 'info' ? <InfoDialogContent /> : <FormDialogContent />}
        </div>
      </div>
    </Portal>
  );
};

export default PinDialog;
