import { Link, useRouter, useSearch } from '@tanstack/react-router';

import { AuthShell } from '@/components/layout/auth-shell';
import { SignInForm } from '@/features/auth';

/** Public sign-in screen. Returns to the `redirect` target (or home) on success. */
export function SignInScreen(): React.ReactElement {
  const router = useRouter();
  const search = useSearch({ strict: false });

  return (
    <AuthShell title="Sign in" description="Welcome back to SchedulePoint.">
      <SignInForm onSuccess={() => router.history.push(search.redirect ?? '/')} />
      <p className="text-muted-foreground text-sm">
        No account?{' '}
        <Link to="/sign-up" className="text-primary font-medium underline-offset-4 hover:underline">
          Create one
        </Link>
      </p>
    </AuthShell>
  );
}
