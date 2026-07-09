import { forwardRef, useId } from 'react';
import type { FieldErrors } from 'react-hook-form';

import { Input, type InputProps } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

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
  { label, error, hint, id, className, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

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
