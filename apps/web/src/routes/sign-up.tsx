import { Link, useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { AuthShell } from '@/components/layout/auth-shell';
import { textLinkVariants } from '@/components/ui/text-link';
import { SignUpForm } from '@/features/auth';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useNoindex } from '@/hooks/use-noindex';
import { sameOriginRedirect } from '@/lib/router/search-string';

/**
 * Public sign-up screen (open self-service).
 *
 * **Branches on whether a session came back, not on the absence of an error** (ADR-0074 M2-T4).
 * With `AUTH_REQUIRE_EMAIL_VERIFICATION` on, the account is created and no session is issued
 * (`sign-up.mjs:260-262`), so pushing `/` sent the new member into the `_authed` guard, which found
 * `null` and bounced them to `/sign-in` **with nothing said about why**. There is no build-time flag
 * that could have gated this: the switch is an API env var, read long after the bundle was built.
 *
 * With enforcement on, a **duplicate** address also lands here with a generic success — deliberately,
 * so the endpoint is not an account-enumeration oracle. "Check your email" is therefore the correct
 * copy for that case too, and there is no "already in use" message to add.
 */
export function SignUpScreen(): React.ReactElement {
  useNoindex();
  useDocumentTitle('Create an account');
  const router = useRouter();
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  // **Captured once, validated here, and stripped from the URL** — the accept-invite route's
  // mechanism (TECH_DEBT #102 item 2), because this value is usually an invitation link and its token
  // is a live capability grant that should not sit in the address bar and history. Validated HERE as
  // well as at the route: a non-strict `useSearch` merges the raw query in, so a value the route's
  // validator dropped still reaches this component. A reload after the strip loses the destination,
  // as it loses the token on the invitation page itself.
  const [redirect] = useState(() => sameOriginRedirect(search.redirect));
  useEffect(() => {
    if (redirect === undefined) return;
    void navigate({ to: '/sign-up', search: {}, replace: true });
  }, [redirect, navigate]);

  return (
    <AuthShell title="Create an account" description="Start planning with SchedulePoint.">
      <SignUpForm
        onSuccess={(outcome, email) => {
          router.history.push(
            outcome.signedIn
              ? (redirect ?? '/')
              : `/verify-email?email=${encodeURIComponent(email)}${
                  redirect ? `&redirect=${encodeURIComponent(redirect)}` : ''
                }`,
          );
        }}
      />
      <p className="text-muted-foreground text-sm">
        Already have an account?{' '}
        <Link
          to="/sign-in"
          {...(redirect ? { search: { redirect } } : {})}
          className={textLinkVariants()}
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
