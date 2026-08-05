import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { INVALID_PASSWORD, useChangePassword } from '../api/use-session';
import { changePasswordSchema, type ChangePasswordValues } from '../schemas/auth-schemas';

import { Button } from '@/components/ui/button';
import { FormErrorSummary, TextField } from '@/components/ui/form';

/**
 * Change your own password from `/account` (ADR-0074 M3).
 *
 * Two decisions worth keeping:
 *
 * **A wrong current password lands on the current-password field, not in a form banner.** Three
 * inputs are on screen and only one of them is wrong; a banner above all three makes the reader
 * work out which — the ADR-0060 M6 finding, one control along.
 *
 * **Other sessions are always signed out, with no checkbox, and the form says so before submit.**
 * The reason someone changes a password is usually that they think somebody else may know it, so a
 * checkbox defaulted either way asks a session-management question at the worst possible moment
 * (spec CQ-2). Saying it up front is the honest half of that trade.
 */
export function ChangePasswordForm(): React.ReactElement {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<ChangePasswordValues>({ resolver: zodResolver(changePasswordSchema) });
  const changePassword = useChangePassword();

  const onSubmit = handleSubmit((values) => {
    changePassword.mutate(
      { currentPassword: values.currentPassword, newPassword: values.newPassword },
      {
        // No `announce()` beside the `role="status"` below: both are live regions, so pairing them
        // reads the same sentence twice (ADR-0074 M5-T1). The form is not replaced here, so the
        // submit button keeps focus and there is nothing to move.
        onSuccess: () => {
          reset();
        },
        onError: (error) => {
          if (error.code === INVALID_PASSWORD) {
            setError('currentPassword', { message: 'That is not your current password' });
            setFocus('currentPassword');
          }
        },
      },
    );
  });

  // A server failure that is not the wrong-password case has no field to attach to — a rate limit,
  // a network drop — so it keeps the form-level alert. The narrowing is what makes that honest.
  const formLevelError =
    changePassword.isError && changePassword.error.code !== INVALID_PASSWORD
      ? changePassword.error.message
      : undefined;

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      <FormErrorSummary errors={errors} />
      {formLevelError === undefined ? null : (
        <p role="alert" className="text-destructive-text text-sm">
          {formLevelError}
        </p>
      )}
      {changePassword.isSuccess ? (
        <p role="status" className="text-sm font-medium">
          Password changed. Your other sessions have been signed out.
        </p>
      ) : null}
      <TextField
        label="Current password"
        type="password"
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        {...register('currentPassword')}
      />
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 12 characters."
        error={errors.newPassword?.message}
        {...register('newPassword')}
      />
      <TextField
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />
      <p className="text-muted-foreground text-sm">
        Changing your password signs you out everywhere else. You will stay signed in here.
      </p>
      {/* `aria-disabled` + a submit guard, never native `disabled` — this control flips twice per
          save and a native one would throw focus to `<body>` and back (docs/DESIGN_SYSTEM.md). */}
      <Button
        type="submit"
        aria-disabled={changePassword.isPending}
        aria-busy={changePassword.isPending}
        onClick={(event) => {
          if (changePassword.isPending) event.preventDefault();
        }}
      >
        {changePassword.isPending ? 'Changing password…' : 'Change password'}
      </Button>
    </form>
  );
}
