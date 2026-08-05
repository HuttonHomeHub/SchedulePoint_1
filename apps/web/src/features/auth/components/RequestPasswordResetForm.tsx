import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { RESET_PASSWORD_DISABLED, useRequestPasswordReset } from '../api/use-session';
import {
  requestPasswordResetSchema,
  type RequestPasswordResetValues,
} from '../schemas/auth-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { FormErrorSummary, TextField } from '@/components/ui/form';

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
 */
export function RequestPasswordResetForm({
  email,
}: {
  email?: string | undefined;
}): React.ReactElement {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RequestPasswordResetValues>({
    resolver: zodResolver(requestPasswordResetSchema),
    defaultValues: { email: email ?? '' },
  });
  const request = useRequestPasswordReset();
  const announce = useAnnounce();

  const onSubmit = handleSubmit((values) => {
    request.mutate(values.email, {
      onSuccess: () => {
        announce('If that address has an account, a reset link is on its way.');
      },
    });
  });

  if (request.isSuccess) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Check your email</p>
        <p className="text-muted-foreground text-sm">
          If that address has an account, a reset link is on its way. The link works once and
          expires in an hour.
        </p>
      </div>
    );
  }

  // "Reset isn't available" must never read as "no such account" — it is a server configuration
  // fact about the whole deployment, not a fact about the address just typed.
  const disabled = request.isError && request.error.code === RESET_PASSWORD_DISABLED;

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      <FormErrorSummary errors={errors} />
      {request.isError ? (
        <p role="alert" className="text-destructive-text text-sm">
          {disabled
            ? 'Password reset is not available on this installation. Contact your administrator.'
            : request.error.message}
        </p>
      ) : null}
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
