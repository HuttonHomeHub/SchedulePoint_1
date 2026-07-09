import { Link, useRouter } from '@tanstack/react-router';

import { AuthShell } from '@/components/layout/auth-shell';
import { SignUpForm } from '@/features/auth';

/** Public sign-up screen (open self-service). Lands on home once signed in. */
export function SignUpScreen(): React.ReactElement {
  const router = useRouter();

  return (
    <AuthShell title="Create your account" description="Start planning with SchedulePoint.">
      <SignUpForm onSuccess={() => router.history.push('/')} />
      <p className="text-muted-foreground text-sm">
        Already have an account?{' '}
        <Link to="/sign-in" className="text-primary font-medium underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
