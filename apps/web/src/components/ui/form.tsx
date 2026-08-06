import { forwardRef, useId } from 'react';
import type { FieldErrors } from 'react-hook-form';

import { Alert } from '@/components/ui/alert';
import { alertBoxClassName } from '@/components/ui/alert-box';
import { Input, type InputProps } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, type SelectProps } from '@/components/ui/select';
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

export interface SelectFieldProps extends SelectProps {
  label: string;
  /** Validation message for this field, if any (from React Hook Form or a failed load). */
  error?: string | undefined;
  /** Optional helper text rendered under the control when there is no error. */
  hint?: string | undefined;
  /**
   * Set to `'alert'` when the error can appear **without** the user having just acted — a failed
   * options query, a rejected save. Those need announcing the moment they render. A validation
   * message revealed on submit does not: {@link FormErrorSummary} already announces those, and a
   * second live region would double up. Defaults to no role, matching {@link TextField}.
   */
  errorRole?: 'alert';
}

/*
 * NO `renderControl` ESCAPE HATCH — deliberately.
 *
 * One was added here for the flag-forked pickers (a `Combobox` when
 * `VITE_LIBRARY_SCOPING` is on, a native select when it is off) and removed
 * again the same day: it passed only `{ id, describedBy, invalid }` to the
 * render function, never the `ref` or the rest props. Since the whole point was
 * to host a `register()`-bound control, and `register()` supplies exactly a ref
 * plus `onChange`/`onBlur`/`name`, it could not do the job it existed for — and
 * it shipped with no consumer and no test, so nothing caught that.
 *
 * If a fork genuinely needs this plumbing, design the signature against the
 * first real caller (thread `ref` and the rest props through the render
 * argument) and test it then. An untested escape hatch with no consumer is a
 * trap: the first adopter inherits a breaking change, not a feature.
 */

/**
 * Accessible labelled select — the enumerated sibling of {@link TextField}, with the same contract:
 * binds the label, exposes validation state via `aria-invalid`, and links the error/hint with
 * `aria-describedby` (merging any the caller supplies, so a select can point at a shared explainer
 * paragraph rendered elsewhere on the screen). Forwards its ref so `register()` spreads directly.
 *
 * Extracted because this idiom had been hand-assembled 30+ times across the app, each repeating the
 * id wiring — and drifting: some errors carried `role="alert"` and some didn't, some hints were
 * rendered but never linked, one screen reused a single id on two different paragraphs. Those are
 * exactly the bugs a shared primitive stops recurring (TECH_DEBT #42).
 */
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  {
    label,
    error,
    hint,
    errorRole,
    id,
    className,
    children,
    'aria-describedby': ariaDescribedBy,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  // Both when there is both: a hint stays useful while an error is showing (it says what the
  // control does; the error says why this value won't do), and losing it mid-correction is the
  // moment it is most wanted. Hint first — context before the complaint.
  const own = [hint ? hintId : undefined, error ? errorId : undefined].filter(Boolean).join(' ');
  const describedBy = mergeDescribedBy(own || undefined, ariaDescribedBy);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId}>{label}</Label>
      <Select
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={className}
        {...props}
      >
        {children}
      </Select>
      {hint ? (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          {...(errorRole ? { role: errorRole } : {})}
          className="text-destructive-text text-sm"
        >
          {error}
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
  /**
   * `'compact'` tightens the label for inline/toolbar use (a view-options row, not a form).
   * It trims the surrounding gap and label weight — it does **not** shrink the hit target,
   * which stays at the WCAG 2.2 SC 2.5.8 ≥24px floor. Density is spacing, never accessibility.
   */
  density?: 'default' | 'compact';
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
    {
      label,
      error,
      hint,
      id,
      className,
      density = 'default',
      'aria-describedby': ariaDescribedBy,
      ...props
    },
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
      <div className={cn('flex flex-col', density === 'compact' ? 'gap-0.5' : 'gap-1.5')}>
        <label
          htmlFor={fieldId}
          className={cn(
            'flex min-h-6 items-center gap-2 py-1 text-sm',
            density === 'compact' ? 'font-normal' : 'font-medium',
          )}
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
 *
 * The treatment comes from {@link alertBoxClassName}, shared with `ServerError` — the two carried
 * byte-identical copies of it until ADR-0077 M6-T2.
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
    <div role="alert" className={cn(alertBoxClassName, className)}>
      <ul className="list-inside list-disc space-y-0.5">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * How many fields are wrong — and deliberately **not what is wrong with them** (ADR-0077 §9).
 *
 * The alternative to {@link FormErrorSummary} on a form whose fields already show their own errors.
 * That component lists every message, and every `TextField` prints the same sentence under its own
 * control, so each problem was stated **twice at once** on all five auth forms. The product owner
 * saw it on sign-up ("password insufficient is displayed in two places") and it was systemic:
 * `SignInForm.tsx:60` vs `:62-75`, `SignUpForm.tsx:41` vs `:43-63`, `ResetPasswordForm.tsx:50` vs
 * `:52-66`, `RequestPasswordResetForm.tsx:64` vs `:74-80`, `ChangePasswordForm.tsx:65` vs `:72-93`.
 * The rule that replaces it: **a field's problem belongs to the field; the alert belongs to the
 * form** — which is also how the previous Flask app split `.error-message` from `.alert`.
 *
 * **It renders nothing below two problems, and that threshold is the whole design.** React Hook
 * Form's `shouldFocusError` defaults to `true` and every field here forwards its ref to the real
 * `<input>`, so a failed submit already moves focus to the first invalid control — which is exactly
 * the case WCAG 4.1.3 exempts, because the message arrives by focus rather than needing a status
 * announcement. For the SECOND and later invalid fields nothing informs a screen-reader user that
 * more problems exist without tabbing forward to find each one, and that is a real 4.1.3 regression
 * if the summary is simply deleted. So the summary is not deleted; it stops restating. One problem:
 * silence, because focus has already done the job. Two or more: a count, which duplicates no
 * sentence and says the one thing the inline messages cannot say from where the reader is standing.
 */
export function FormProblemCount({
  errors,
  className,
}: {
  errors: FieldErrors;
  className?: string;
}): React.ReactElement | null {
  // Counts entries that carry a message, matching what the fields themselves will render — a
  // `refine()` error attached to a path with no control would otherwise inflate the count past the
  // number of highlighted fields, which is worse than saying nothing.
  const count = Object.values(errors).filter(
    (error) => typeof error?.message === 'string' && error.message !== '',
  ).length;

  if (count < 2) return null;

  return (
    <Alert tone="error" className={className}>
      {count} problems — check the highlighted fields below.
    </Alert>
  );
}
