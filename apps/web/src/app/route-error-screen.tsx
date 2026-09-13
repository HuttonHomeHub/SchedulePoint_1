import type { ErrorComponentProps } from '@tanstack/react-router';
import { useRouter } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';

/**
 * What a reader sees when a route's `beforeLoad` or loader rejects.
 *
 * **It used to instruct a retry it did not offer** (`docs/TECH_DEBT.md` #314). The copy read
 * "Please try again" above nothing pressable, while its twin — `components/error-boundary.tsx`,
 * same heading, written the same day — has always carried a **Reload** button. Both were right when
 * written and only one was revisited; the one WITHOUT the action is the one on the `_authed` guard
 * path, which is the commoner failure.
 *
 * **The recovery was already being handed to us and thrown away.** `ErrorComponentProps` is
 * `{ error, info?, reset }` (`@tanstack/router-core@1.171.28`, `dist/esm/route.d.ts:438-444`), and
 * the previous component took no props at all. So this is not a new affordance; it is the one the
 * router supplies.
 *
 * **Why `reset` + `invalidate` rather than the twin's `window.location.reload()`.** `reset` clears
 * the error boundary and `router.invalidate()` re-runs the loaders **without a page load**, so the
 * tab survives and so does anything unsaved sitting in a dialog behind the boundary — which means
 * this never trips ADR-0108's `beforeunload` guard. A full reload discards that work to recover
 * from what is usually a transient failure. The twin keeps its reload: it catches render errors,
 * where re-running a loader is not the remedy.
 */
export function RouteErrorScreen({ reset }: ErrorComponentProps): React.JSX.Element {
  const router = useRouter();

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground text-sm">
          We couldn&rsquo;t load this page. It may have been a temporary problem.
        </p>
        <Button
          onClick={() => {
            // Order matters: clear the boundary first, or `invalidate` re-runs the loaders while
            // the error state is still latched and the screen does not come back.
            reset();
            void router.invalidate();
          }}
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
