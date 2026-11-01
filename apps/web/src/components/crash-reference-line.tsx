import { useCrashReference } from '@/lib/crash-reference';

/**
 * "This problem has been reported. Reference: XXXXXX." under a crash fallback's paragraph, and
 * nothing at all until the server has answered with a reference (spec Q3): the line must never
 * claim a report that did not arrive. Static text, not a live region — the heading already took
 * focus and announced the failure, and a second announcement seconds later would talk over it.
 */
export function CrashReferenceLine(): React.JSX.Element | null {
  const reference = useCrashReference();
  if (reference === null) return null;
  return (
    <p className="text-muted-foreground text-sm">
      This problem has been reported. Reference: <span className="font-mono">{reference}</span>.
    </p>
  );
}
