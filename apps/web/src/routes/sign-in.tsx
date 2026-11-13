import { Link, useRouter, useSearch } from '@tanstack/react-router';

import { AuthShell } from '@/components/layout/auth-shell';
import { Alert } from '@/components/ui/alert';
import { textLinkVariants } from '@/components/ui/text-link';
import { SignInForm } from '@/features/auth';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useNoindex } from '@/hooks/use-noindex';
import { sameOriginRedirect } from '@/lib/router/search-string';

/**
 * Public sign-in screen. Returns to the `redirect` target (or home) on success.
 */
export function SignInScreen(): React.ReactElement {
  useNoindex();
  useDocumentTitle('Sign in');
  const router = useRouter();
  const search = useSearch({ strict: false });

  return (
    <AuthShell title="Sign in" description="Welcome back to SchedulePoint.">
      {search.signedOut ? (
        <Alert purpose="event" tone="info">
          You have been signed out.
        </Alert>
      ) : null}
      <SignInForm
        onSuccess={() => router.history.push(sameOriginRedirect(search.redirect) ?? '/')}
      />
      <p className="text-muted-foreground text-sm">
        <Link to="/forgot-password" className={textLinkVariants()}>
          Forgot your password?
        </Link>
      </p>
      <p className="text-muted-foreground text-sm">
        No account?{' '}
        <Link to="/sign-up" className={textLinkVariants()}>
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
