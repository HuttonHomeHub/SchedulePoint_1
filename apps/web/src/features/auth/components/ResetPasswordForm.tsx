import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';

import { useResetPassword } from '../api/use-session';
import { resetPasswordSchema, type ResetPasswordValues } from '../schemas/auth-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button, buttonVariants } from '@/components/ui/button';
import { FormErrorSummary, TextField } from '@/components/ui/form';

/**
 * Set a new password from an emailed token (ADR-0074 M4).
 *
 * **The token is a prop held in component state, never re-read from the URL.** The screen strips it
 * from the address bar on arrival, so by the time this renders the URL no longer carries it — which
 * is the point: a live token must not survive in history or leak through a later referrer.
 *
 * **Success is a link to sign in, not a navigation into the app.** The reset endpoint issues no
 * session (`password.mjs`), so pushing `/` would land in the `_authed` guard and bounce — the exact
 * dead end ADR-0074 M2 exists to remove, and it would be self-inflicted here. It is also the honest
 * shape: proving you can read a mailbox is not the same as being signed in.
 */
export function ResetPasswordForm({ token }: { token: string }): React.ReactElement {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordValues>({ resolver: zodResolver(resetPasswordSchema) });
  const reset = useResetPassword();
  const announce = useAnnounce();

  const onSubmit = handleSubmit((values) => {
    reset.mutate(
      { token, newPassword: values.newPassword },
      {
        onSuccess: () => {
          announce('Password changed. You can sign in now.');
        },
      },
    );
  });

  if (reset.isSuccess) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm font-medium">
          Password changed. Every other session has been signed out.
        </p>
        <Link to="/sign-in" className={buttonVariants()}>
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      <FormErrorSummary errors={errors} />
      {reset.isError ? (
        <p role="alert" className="text-destructive-text text-sm">
          {reset.error.message}
        </p>
      ) : null}
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
      <Button
        type="submit"
        aria-disabled={reset.isPending}
        aria-busy={reset.isPending}
        onClick={(event) => {
          if (reset.isPending) event.preventDefault();
        }}
      >
        {reset.isPending ? 'Setting your password…' : 'Set new password'}
      </Button>
    </form>
  );
}
