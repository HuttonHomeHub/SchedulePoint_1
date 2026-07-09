import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { useSignUp } from '../api/use-session';
import { signUpSchema, type SignUpValues } from '../schemas/auth-schemas';

import { Button } from '@/components/ui/button';
import { FormErrorSummary, TextField } from '@/components/ui/form';

/** Create-account form. Calls `onSuccess` once the account is created and signed in. */
export function SignUpForm({ onSuccess }: { onSuccess: () => void }): React.ReactElement {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpValues>({ resolver: zodResolver(signUpSchema) });
  const signUp = useSignUp();

  const onSubmit = handleSubmit((values) => {
    signUp.mutate(values, { onSuccess });
  });

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      <FormErrorSummary errors={errors} />
      {signUp.isError ? (
        <p role="alert" className="text-destructive-text text-sm">
          {signUp.error.message}
        </p>
      ) : null}
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
      <Button type="submit" disabled={signUp.isPending} aria-busy={signUp.isPending}>
        {signUp.isPending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
