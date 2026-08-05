import { Link, useRouter, useSearch } from '@tanstack/react-router';

import { AuthShell } from '@/components/layout/auth-shell';
import { PASSWORD_RESET_ENABLED } from '@/config/env';
import { SignInForm } from '@/features/auth';

/**
 * Public sign-in screen. Returns to the `redirect` target (or home) on success.
 *
 * The "Forgot your password?" link is gated on **the same constant that registers
 * `/forgot-password`** (ADR-0074 M4). That is deliberate and load-bearing: typecheck cannot catch a
 * link to a conditionally-registered route, because `...(FLAG ? [route] : [])` widens to include it
 * in both branches. One constant is the only thing standing between a rollback and a dead link.
 */
export function SignInScreen(): React.ReactElement {
  const router = useRouter();
  const search = useSearch({ strict: false });

  return (
    <AuthShell title="Sign in" description="Welcome back to SchedulePoint.">
      <SignInForm onSuccess={() => router.history.push(search.redirect ?? '/')} />
      {PASSWORD_RESET_ENABLED ? (
        <p className="text-muted-foreground text-sm">
          <Link
            to="/forgot-password"
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            Forgot your password?
          </Link>
        </p>
      ) : null}
      <p className="text-muted-foreground text-sm">
        No account?{' '}
        <Link to="/sign-up" className="text-primary font-medium underline-offset-4 hover:underline">
          Create one
        </Link>
      </p>
    </AuthShell>
  );
}
