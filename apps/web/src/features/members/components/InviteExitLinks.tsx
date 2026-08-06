import { Link } from '@tanstack/react-router';

import { buttonVariants } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { useSession } from '@/features/auth';

/**
 * The way out of an invitation that cannot be accepted (ADR-0077 M1-T2).
 *
 * Four states — no token, invitation not found, invitation no longer valid, and the route's own
 * missing-token branch — rendered a title, a sentence and **nothing operable**. These screens are
 * reached from an email, so the browser's Back button goes to the mail client; there was no way
 * into SchedulePoint at all.
 *
 * **Session-aware, which is a deliberate departure from the plan's "always offer Sign in and Create
 * an account".** `/sign-in` has no already-signed-in guard (`app/router.tsx:101-113` guards
 * `_authed`, not the public routes), so offering it to somebody who is signed in sends them to a
 * login form they do not need — a control that is present but wrong, which is the same class of
 * defect as no control at all. While the session is still resolving the signed-out pair renders,
 * which is correct for the overwhelmingly common case (an emailed link opened in a fresh browser)
 * and swaps rather than dead-ends if it turns out otherwise.
 */
export function InviteExitLinks(): React.ReactElement {
  const session = useSession();

  if (session.data?.user) {
    return (
      <CardContent>
        <Link to="/" className={buttonVariants()}>
          Go to SchedulePoint
        </Link>
      </CardContent>
    );
  }

  return (
    <CardContent className="flex flex-col gap-2">
      <Link to="/sign-in" className={buttonVariants()}>
        Sign in
      </Link>
      <Link to="/sign-up" className={buttonVariants({ variant: 'outline' })}>
        Create an account
      </Link>
    </CardContent>
  );
}
