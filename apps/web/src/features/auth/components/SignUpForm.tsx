import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { authErrorMessage, useSignUp, type SignUpOutcome } from '../api/use-session';
import { signUpSchema, type SignUpValues } from '../schemas/auth-schemas';

import { Button } from '@/components/ui/button';
import { FormProblemCount, TextField } from '@/components/ui/form';
import { ServerError } from '@/components/ui/server-error';
import { useClearOnEdit } from '@/hooks/use-clear-on-edit';

/**
 * Create-account form.
 *
 * `onSuccess` receives the **outcome** and the address, not `void` (ADR-0074 M2-T4). With
 * `AUTH_REQUIRE_EMAIL_VERIFICATION` on, the server creates the account and issues **no session**,
 * so a caller that assumes it is now signed in navigates into the app and gets bounced straight
 * back out with no explanation. The caller has to be able to tell the two apart.
 */
export function SignUpForm({
  onSuccess,
}: {
  onSuccess: (outcome: SignUpOutcome, email: string) => void;
}): React.ReactElement {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignUpValues>({ resolver: zodResolver(signUpSchema) });
  const signUp = useSignUp();
  useClearOnEdit(watch, signUp);

  const onSubmit = handleSubmit((values) => {
    signUp.mutate(values, {
      onSuccess: (outcome) => {
        onSuccess(outcome, values.email);
      },
    });
  });

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      {/* A count, not the messages. This form is where the product owner reported the defect: a
          password under 12 characters was stated here AND under the Password field (ADR-0077 §9). */}
      <FormProblemCount errors={errors} />
      <ServerError message={signUp.isError ? authErrorMessage(signUp.error) : null} />
      <TextField
        label="Full name"
        autoComplete="name"
        error={errors.name?.message}
        {...register('name')}
      />
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
        autoComplete="new-password"
        hint="At least 12 characters."
        error={errors.password?.message}
        {...register('password')}
      />
      {/* See `SignInForm` — `aria-disabled` + a submit guard, never native `disabled`, so focus
          survives the pending state (TECH_DEBT #17a). */}
      <Button
        type="submit"
        aria-disabled={signUp.isPending}
        aria-busy={signUp.isPending}
        onClick={(event) => {
          if (signUp.isPending) event.preventDefault();
        }}
      >
        {signUp.isPending ? 'Creating your account…' : 'Create an account'}
      </Button>
    </form>
  );
}
