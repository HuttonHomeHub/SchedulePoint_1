import type { ErrorComponentProps } from '@tanstack/react-router';
import { useRouter } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';

/**
 * Whether an error is a route chunk that failed to download.
 *
 * **A copy of the router's own predicate, not an import of it.** `isModuleNotFoundError` is not
 * re-exported by `@tanstack/react-router`, and this package has no direct `@tanstack/router-core`
 * dependency — adding one would reopen the two-installed-versions risk `docs/TECH_DEBT.md` #178
 * records. The three prefixes are the messages Chrome, Firefox and Safari give for a failed dynamic
 * import (`@tanstack/router-core` `utils.js:147-150`). That location is registered in
 * `scripts/dependency-claims.json`, so `check:claims` fails on the router bump that changes them.
 */
export function isChunkLoadFailure(error: unknown): boolean {
  const message = (error as { message?: unknown } | null | undefined)?.message;
  if (typeof message !== 'string') return false;
  return (
    message.startsWith('Failed to fetch dynamically imported module') ||
    message.startsWith('error loading dynamically imported module') ||
    message.startsWith('Importing a module script failed')
  );
}

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
 *
 * **One failure class takes the reload anyway: a chunk that would not download** (route code
 * splitting, `docs/specs/route-code-splitting/`, M1-T1b). `lazyRouteComponent` latches the import's
 * error and re-throws it on every render until the document is replaced
 * (`@tanstack/react-router` `lazyRouteComponent.js:37-44`), so `reset()` + `invalidate()` re-renders
 * into the same latched error and the button appears to do nothing. The commonest cause is a
 * deploy: the host auto-redeploys under open tabs (ADR-0047), the old chunk names are gone, and
 * only a fresh `index.html` knows the new ones. The router already reloads once by itself for
 * that case; this is the retry for when that one reload has been spent or the network is down.
 * Every other failure keeps #314's behaviour, and the unit suite pins both branches.
 */
export function RouteErrorScreen({ error, reset }: ErrorComponentProps): React.JSX.Element {
  const router = useRouter();
  const chunkFailure = isChunkLoadFailure(error);

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground text-sm">
          {chunkFailure
            ? 'Part of this page could not be downloaded. The app may have been updated, or the connection dropped. Trying again reloads the page to fetch the latest version.'
            : 'We couldn\u2019t load this page. It may have been a temporary problem.'}
        </p>
        <Button
          onClick={() => {
            if (chunkFailure) {
              window.location.reload();
              return;
            }
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
