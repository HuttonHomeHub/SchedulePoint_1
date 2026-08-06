import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import {
  RESET_PASSWORD_DISABLED,
  authErrorMessage,
  type useRequestPasswordReset,
} from '../api/use-session';
import {
  requestPasswordResetSchema,
  type RequestPasswordResetValues,
} from '../schemas/auth-schemas';

import { Button } from '@/components/ui/button';
import { FormProblemCount, TextField } from '@/components/ui/form';
import { ServerError } from '@/components/ui/server-error';
import { useClearOnEdit } from '@/hooks/use-clear-on-edit';

/**
 * Ask for a password-reset link (ADR-0074 M4).
 *
 * **One submitted state, whatever the truth.** The endpoint answers identically for a known and an
 * unknown address and performs a dummy lookup so the timing matches (`password.mjs:62-66`). A UI
 * that branched — a different message, a pre-flight members lookup, anything — would hand back the
 * account-enumeration oracle the library deliberately closed. There is therefore no "we could not
 * find that address" copy to write, and its absence is the feature.
 *
 * **It does not promise delivery either.** On a stock deployment the mail port only logs
 * (`TECH_DEBT` #94), so "we've emailed you" would be false wherever SMTP is unconfigured. "If that
 * address has an account" is true in every configuration.
 *
 * **The mutation is owned by the route, not by this form** (ADR-0077 M2-T3). The submitted state is
 * a *terminal* state of the screen — the heading "Reset your password" is wrong once the link has
 * been asked for — and only the route can change the heading. The form keeps owning its fields;
 * one object moves.
 */
export function RequestPasswordResetForm({
  email,
  request,
}: {
  email?: string | undefined;
  /** The route's mutation, so the route can render the terminal state with its own heading. */
  request: ReturnType<typeof useRequestPasswordReset>;
}): React.ReactElement {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RequestPasswordResetValues>({
    resolver: zodResolver(requestPasswordResetSchema),
    defaultValues: { email: email ?? '' },
  });
  useClearOnEdit(watch, request);
  const onSubmit = handleSubmit((values) => {
    // Announced by the route's terminal `role="status"` block and nowhere else: two live regions
    // carrying the same sentence read it twice (ADR-0074 M5-T1).
    request.mutate(values.email);
  });

  // "Reset isn't available" must never read as "no such account" — it is a server configuration
  // fact about the whole deployment, not a fact about the address just typed.
  const disabled = request.isError && request.error.code === RESET_PASSWORD_DISABLED;

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      <FormProblemCount errors={errors} />
      <ServerError
        message={
          request.isError
            ? disabled
              ? 'Password reset is not available on this installation. Contact your administrator.'
              : authErrorMessage(request.error, 'email')
            : null
        }
      />
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <Button
        type="submit"
        aria-disabled={request.isPending}
        aria-busy={request.isPending}
        onClick={(event) => {
          if (request.isPending) event.preventDefault();
        }}
      >
        {request.isPending ? 'Sending…' : 'Send a reset link'}
      </Button>
    </form>
  );
}
