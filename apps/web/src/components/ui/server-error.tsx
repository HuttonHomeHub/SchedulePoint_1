import { alertBoxClassName } from './alert-box';

import { cn } from '@/lib/utils';

/**
 * A failure that came back from the server, given the weight it deserves (ADR-0077 M2-T1).
 *
 * **The defect this replaces is a hierarchy inversion.** Client-side validation — "enter a valid
 * email" — rendered in the bordered, tinted `FormErrorSummary`; a *server* refusal — wrong
 * password, rate limited, reset disabled — rendered as a bare red sentence, six hand-assembled
 * copies of `<p role="alert" className="text-destructive-text text-sm">`. The more serious failure
 * got the weaker treatment, and on the one screen where a stranger meets the product.
 *
 * **It announces; it does not take focus** (ADR-0077 M6-T2, accessibility review). It shipped
 * calling `useOutcomeFocus`, and that was wrong for the same reason the hook is right everywhere
 * else it is used: the hook exists to recover focus when **the control the reader was using has
 * just been unmounted** — the sign-in unverified branch, "check your email", "password changed".
 * A `ServerError` unmounts nothing. Every one of its call sites renders it **inside a form that is
 * still there**, so on a wrong password at `/sign-in` — the busiest public screen — focus was
 * taken off the password field the reader had just typed into (Enter inside a text input submits
 * without moving focus) and parked on an inert div, from which Tab goes *forward* to Email. That is
 * an unrequested focus displacement away from the control the reader is engaged with: WCAG 2.4.3,
 * and the same defect class this project has twice treated as blocking when a native `disabled`
 * blurred a button to `<body>` (ADR-0060 M6, ADR-0063 M6).
 *
 * `role="alert"` reaches a screen-reader user **regardless of focus**, which is the whole point of a
 * live region, so nothing is lost. Where an error genuinely can be attributed to one field, the
 * right move is the one `ChangePasswordForm` already makes: attach it to the field and
 * `setFocus()` there. The public forms cannot do that — saying *which* of email or password was
 * wrong is the enumeration oracle they exist to avoid — but "cannot attribute it" argues for
 * leaving focus alone, not for moving it somewhere useless.
 *
 * **It deliberately does NOT know what a 429 is**, which is a departure from the plan's wording.
 * `components/ui` is the design system; a primitive that imported `AuthError` to branch on a rate
 * limit would be a one-off in a `ui/` costume, which is the risk that task's own notes name. The
 * single place deciding what 429 means is `authErrorMessage()` (ADR-0077 M1-T4) — callers pass its
 * result in. One decision, one place, and this component stays reusable by anything with a message.
 */
export function ServerError({
  message,
  className,
}: {
  /** The sentence to show, or `null`/`undefined` when there is no failure. */
  message: string | null | undefined;
  className?: string;
}): React.ReactElement | null {
  if (typeof message !== 'string' || message === '') return null;

  return (
    <div role="alert" className={cn(alertBoxClassName, className)}>
      {message}
    </div>
  );
}
