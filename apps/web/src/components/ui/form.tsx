import { forwardRef, useId } from 'react';
import type { FieldErrors } from 'react-hook-form';

import { Input, type InputProps } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea, type TextareaProps } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * Merge the field's own error/hint description id with any caller-supplied `aria-describedby` (rather
 * than letting one clobber the other). Space-separated per WAI-ARIA — a caller can point the control at
 * an extra description (e.g. a live character count) without silencing the validation error, and vice
 * versa. Order puts the field's own error/hint first so it's announced before caller-supplied context.
 */
function mergeDescribedBy(own: string | undefined, caller: string | undefined): string | undefined {
  return [own, caller].filter(Boolean).join(' ') || undefined;
}

export interface TextFieldProps extends InputProps {
  label: string;
  /** Validation message for this field, if any (from React Hook Form). */
  error?: string | undefined;
  /** Optional helper text rendered under the control when there is no error. */
  hint?: string | undefined;
}

/**
 * Accessible labelled text field: binds the label to the control, exposes
 * validation state via `aria-invalid`, and links the error/hint text with
 * `aria-describedby` so screen readers announce it. Forwards its ref so React
 * Hook Form's `register()` can be spread directly onto it.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, id, className, 'aria-describedby': ariaDescribedBy, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const describedBy = mergeDescribedBy(
    error ? errorId : hint ? hintId : undefined,
    ariaDescribedBy,
  );

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={className}
        {...props}
      />
      {error ? (
        <p id={errorId} className="text-destructive-text text-sm">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export interface CheckboxFieldProps extends Omit<InputProps, 'type'> {
  label: string;
  /** Validation message for this field, if any (from React Hook Form). */
  error?: string | undefined;
  /** Optional helper text rendered under the control when there is no error. */
  hint?: string | undefined;
}

/**
 * Accessible labelled checkbox — the boolean sibling of {@link TextField}. The `&lt;label&gt;` wraps the
 * native `&lt;input type="checkbox"&gt;` and its text (so the accessible name never depends on `aria-label`),
 * clears the WCAG 2.2 SC 2.5.8 ≥24px hit target (`min-h-6` + `py-1`), and links any error/hint via
 * `aria-describedby`. Forwards its ref so `register()` can be spread directly onto it. Centralises the
 * checkbox chrome so it isn't hand-rolled per feature (DESIGN_SYSTEM.md — no one-off styling).
 */
export const CheckboxField = forwardRef<HTMLInputElement, CheckboxFieldProps>(
  function CheckboxField(
    { label, error, hint, id, className, 'aria-describedby': ariaDescribedBy, ...props },
    ref,
  ) {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    const errorId = `${fieldId}-error`;
    const hintId = `${fieldId}-hint`;
    const describedBy = mergeDescribedBy(
      error ? errorId : hint ? hintId : undefined,
      ariaDescribedBy,
    );

    return (
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={fieldId}
          className="flex min-h-6 items-center gap-2 py-1 text-sm font-medium"
        >
          <input
            ref={ref}
            id={fieldId}
            type="checkbox"
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn('accent-primary size-4', className)}
            {...props}
          />
          {label}
        </label>
        {error ? (
          <p id={errorId} className="text-destructive-text text-sm">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-muted-foreground text-sm">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);

export interface TextareaFieldProps extends TextareaProps {
  label: string;
  /** Validation message for this field, if any (from React Hook Form). */
  error?: string | undefined;
  /** Optional helper text rendered under the control when there is no error. */
  hint?: string | undefined;
}

/**
 * Accessible labelled multi-line field — the {@link TextField} equivalent for a
 * {@link Textarea}: binds the label, exposes `aria-invalid`, and links the
 * error/hint via `aria-describedby`. Forwards its ref for `register()`.
 */
export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  function TextareaField(
    { label, error, hint, id, className, 'aria-describedby': ariaDescribedBy, ...props },
    ref,
  ) {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    const errorId = `${fieldId}-error`;
    const hintId = `${fieldId}-hint`;
    const describedBy = mergeDescribedBy(
      error ? errorId : hint ? hintId : undefined,
      ariaDescribedBy,
    );

    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldId}>{label}</Label>
        <Textarea
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={className}
          {...props}
        />
        {error ? (
          <p id={errorId} className="text-destructive-text text-sm">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-muted-foreground text-sm">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);

/**
 * Summarises form-level and field errors at the top of a form, announced via
 * `role="alert"`. Complements per-field messages (React Hook Form focuses the
 * first invalid field on submit).
 */
export function FormErrorSummary({
  errors,
  className,
}: {
  errors: FieldErrors;
  className?: string;
}): React.ReactElement | null {
  const messages = Object.values(errors)
    .map((error) => (typeof error?.message === 'string' ? error.message : null))
    .filter((message): message is string => Boolean(message));

  if (messages.length === 0) return null;

  return (
    <div
      role="alert"
      className={cn(
        'border-destructive-text bg-destructive-text/5 text-destructive-text rounded-md border p-3 text-sm',
        className,
      )}
    >
      <ul className="list-inside list-disc space-y-0.5">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}
