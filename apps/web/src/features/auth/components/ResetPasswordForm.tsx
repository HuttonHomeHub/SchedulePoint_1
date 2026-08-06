import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { authErrorMessage, type useResetPassword } from '../api/use-session';
import { resetPasswordSchema, type ResetPasswordValues } from '../schemas/auth-schemas';

import { Button } from '@/components/ui/button';
import { FormProblemCount, TextField } from '@/components/ui/form';
import { ServerError } from '@/components/ui/server-error';
import { useClearOnEdit } from '@/hooks/use-clear-on-edit';

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
 *
 * **The mutation is owned by the route** (ADR-0077 M2-T3). This used to swap its own body for
 * "Password changed" while the route's heading still read **"Choose a new password"** — a heading
 * that outlived the task it named, on the screen that has just told somebody their password is
 * different. The route now renders the terminal state, heading and all; the form keeps its fields.
 */
export function ResetPasswordForm({
  token,
  reset,
}: {
  token: string;
  /** The route's mutation, so the route can render the terminal state with its own heading. */
  reset: ReturnType<typeof useResetPassword>;
}): React.ReactElement {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ResetPasswordValues>({ resolver: zodResolver(resetPasswordSchema) });
  useClearOnEdit(watch, reset);
  const onSubmit = handleSubmit((values) => {
    // Announced once, by the route's terminal `role="status"`. This previously also called
    // `announce()` with a DIFFERENT sentence, so a screen-reader user heard two overlapping and
    // non-matching claims about the same event (ADR-0074 M5-T1).
    reset.mutate({ token, newPassword: values.newPassword });
  });

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      <FormProblemCount errors={errors} />
      <ServerError message={reset.isError ? authErrorMessage(reset.error) : null} />
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
