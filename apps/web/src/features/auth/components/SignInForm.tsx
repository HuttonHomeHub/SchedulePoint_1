import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { EMAIL_NOT_VERIFIED, authErrorMessage, useSignIn } from '../api/use-session';
import { signInSchema, type SignInValues } from '../schemas/auth-schemas';

import { ResendVerificationButton } from './ResendVerificationButton';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormProblemCount, TextField } from '@/components/ui/form';
import { ServerError } from '@/components/ui/server-error';
import { useClearOnEdit } from '@/hooks/use-clear-on-edit';
import { useOutcomeFocus } from '@/hooks/use-outcome-focus';

/** Email + password sign-in form. Calls `onSuccess` once a session is established. */
export function SignInForm({ onSuccess }: { onSuccess: () => void }): React.ReactElement {
  const {
    register,
    handleSubmit,
    getValues,
    watch,
    formState: { errors },
  } = useForm<SignInValues>({ resolver: zodResolver(signInSchema) });
  const signIn = useSignIn();
  useClearOnEdit(watch, signIn);

  const onSubmit = handleSubmit((values) => {
    signIn.mutate(values, { onSuccess });
  });

  // The server's own word for "this account exists but its address is unverified" (403). Matched on
  // the machine-readable code, never the message string — the branch it guards is the difference
  // between "check your password" and "here is how to fix this", which must not rest on prose.
  const unverified = signIn.isError && signIn.error.code === EMAIL_NOT_VERIFIED;
  const unverifiedRef = useOutcomeFocus<HTMLDivElement>(unverified);

  if (unverified) {
    return (
      <div className="flex flex-col gap-4">
        {/* `info`, not `error` (ADR-0077 §9). The credentials were right; what is missing is a step
            the reader can complete, and the two buttons below are how. An error tone would say the
            attempt was wrong, which is the one thing this state establishes it was not. */}
        <Alert tone="info" tabIndex={-1} ref={unverifiedRef}>
          {/* A heading, not a paragraph: this is the replacement content's title, and a reader
              navigating by headings would otherwise not find it. */}
          <h2 className="text-sm font-medium">Confirm your email address first</h2>
          <p className="mt-1 text-sm">
            Your account exists, but we still need you to open the link we emailed you. Sending a
            new one replaces any earlier link.
          </p>
        </Alert>
        <ResendVerificationButton email={getValues('email')} />
        {/* The way back. Without it this state is a dead end on the one screen whose whole purpose
            is removing dead ends — and the commonest reason to be here after a mistyped address is
            wanting to try a different one (ADR-0074 M5-T1, UX review). `reset()` returns the
            mutation to idle, which re-renders the form below with the typed values intact. */}
        <Button variant="ghost" onClick={() => signIn.reset()}>
          Try a different account
        </Button>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      {/* A count, never the messages themselves: each field prints its own below, and stating a
          problem twice at once is the defect ADR-0077 §9 exists to remove. */}
      <FormProblemCount errors={errors} />
      <ServerError message={signIn.isError ? authErrorMessage(signIn.error) : null} />
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      {/* `aria-disabled`, not `disabled`: a native disabled control blurs to `<body>` the moment
          the request starts and flips back when it settles, so a keyboard user loses their place
          twice per submit. **The `onClick` guard is what prevents the double submit** — react-hook-
          form's `handleSubmit` has no re-entrancy guard of its own, which an earlier version of
          this comment asserted it did. Enter inside a field synthesises a click on the default
          submit button, so the guard covers the keyboard path too (verified in Chromium). */}
      <Button
        type="submit"
        aria-disabled={signIn.isPending}
        aria-busy={signIn.isPending}
        onClick={(event) => {
          if (signIn.isPending) event.preventDefault();
        }}
      >
        {signIn.isPending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
