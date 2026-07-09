import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { useSignIn } from '../api/use-session';
import { signInSchema, type SignInValues } from '../schemas/auth-schemas';

import { Button } from '@/components/ui/button';
import { FormErrorSummary, TextField } from '@/components/ui/form';

/** Email + password sign-in form. Calls `onSuccess` once a session is established. */
export function SignInForm({ onSuccess }: { onSuccess: () => void }): React.ReactElement {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInValues>({ resolver: zodResolver(signInSchema) });
  const signIn = useSignIn();

  const onSubmit = handleSubmit((values) => {
    signIn.mutate(values, { onSuccess });
  });

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
      <Button type="submit" disabled={signIn.isPending} aria-busy={signIn.isPending}>
        {signIn.isPending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
