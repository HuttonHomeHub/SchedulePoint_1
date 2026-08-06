import { useOutcomeFocus } from '@/hooks/use-outcome-focus';
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
 * It also **takes focus, once**. A submit that fails leaves the reader's focus on the submit button
 * with the reason rendered above it, out of sight on a small viewport; `role="alert"` announces it
 * to a screen-reader user and nobody else. One node carries both the role and the focus — never two
 * — which is the ADR-0074 M5-T1 rule: two live regions read the same sentence twice.
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
  const shown = typeof message === 'string' && message !== '';
  const ref = useOutcomeFocus<HTMLDivElement>(shown);

  if (!shown) return null;

  return (
    <div
      role="alert"
      tabIndex={-1}
      ref={ref}
      className={cn(
        'border-destructive-text bg-destructive-text/5 text-destructive-text rounded-md border p-3 text-sm',
        className,
      )}
    >
      {message}
    </div>
  );
}
