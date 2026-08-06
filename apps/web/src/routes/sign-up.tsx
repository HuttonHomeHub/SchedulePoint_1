import { Link, useRouter } from '@tanstack/react-router';

import { AuthShell } from '@/components/layout/auth-shell';
import { textLinkVariants } from '@/components/ui/text-link';
import { SignUpForm } from '@/features/auth';
import { useNoindex } from '@/hooks/use-noindex';

/**
 * Public sign-up screen (open self-service).
 *
 * **Branches on whether a session came back, not on the absence of an error** (ADR-0074 M2-T4).
 * With `AUTH_REQUIRE_EMAIL_VERIFICATION` on, the account is created and no session is issued
 * (`sign-up.mjs:252-254`), so pushing `/` sent the new member into the `_authed` guard, which found
 * `null` and bounced them to `/sign-in` **with nothing said about why**. There is no build-time flag
 * that could have gated this: the switch is an API env var, read long after the bundle was built.
 *
 * With enforcement on, a **duplicate** address also lands here with a generic success — deliberately,
 * so the endpoint is not an account-enumeration oracle. "Check your email" is therefore the correct
 * copy for that case too, and there is no "already in use" message to add.
 */
export function SignUpScreen(): React.ReactElement {
  useNoindex();
  const router = useRouter();

  return (
    <AuthShell title="Create an account" description="Start planning with SchedulePoint.">
      <SignUpForm
        onSuccess={(outcome, email) => {
          router.history.push(
            outcome.signedIn ? '/' : `/verify-email?email=${encodeURIComponent(email)}`,
          );
        }}
      />
      <p className="text-muted-foreground text-sm">
        Already have an account?{' '}
        <Link to="/sign-in" className={textLinkVariants()}>
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
