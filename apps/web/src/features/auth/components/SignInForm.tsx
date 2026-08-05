import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { EMAIL_NOT_VERIFIED, useSignIn } from '../api/use-session';
import { signInSchema, type SignInValues } from '../schemas/auth-schemas';

import { ResendVerificationButton } from './ResendVerificationButton';

import { Button } from '@/components/ui/button';
import { FormErrorSummary, TextField } from '@/components/ui/form';

/** Email + password sign-in form. Calls `onSuccess` once a session is established. */
export function SignInForm({ onSuccess }: { onSuccess: () => void }): React.ReactElement {
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<SignInValues>({ resolver: zodResolver(signInSchema) });
  const signIn = useSignIn();

  const onSubmit = handleSubmit((values) => {
    signIn.mutate(values, { onSuccess });
  });

  // The server's own word for "this account exists but its address is unverified" (403). Matched on
  // the machine-readable code, never the message string — the branch it guards is the difference
  // between "check your password" and "here is how to fix this", which must not rest on prose.
  const unverified = signIn.isError && signIn.error.code === EMAIL_NOT_VERIFIED;

  if (unverified) {
    return (
      <div className="flex flex-col gap-4">
        <div role="alert" className="flex flex-col gap-1">
          <p className="text-sm font-medium">Confirm your email address first</p>
          <p className="text-muted-foreground text-sm">
            Your account exists, but we still need you to open the link we emailed you. Sending a
            new one replaces any earlier link.
          </p>
        </div>
        <ResendVerificationButton email={getValues('email')} />
      </div>
    );
  }

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      <FormErrorSummary errors={errors} />
      {signIn.isError ? (
        <p role="alert" className="text-destructive-text text-sm">
          {signIn.error.message}
        </p>
      ) : null}
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
          twice per submit. `handleSubmit` already ignores a second call while one is in flight,
          and the guard below makes that explicit (TECH_DEBT #17a). */}
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
