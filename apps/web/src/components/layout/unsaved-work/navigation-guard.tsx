import { useBlocker } from '@tanstack/react-router';
import { useCallback, useEffect, useRef } from 'react';

import { useUnsavedWorkRegistry } from './unsaved-work-provider';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { describeUnsavedWork, hasUnsavedWork } from '@/lib/unsaved-work/report';

/**
 * Stop a navigation that would silently discard unsaved work.
 *
 * **A modal blocks the canvas and blocks nothing else.** ADR-0101 returned the activity editor to a
 * `<dialog>`, which is right, and a modal still does not stand between a planner and the browser's
 * Back button, a reload, or a closed tab. Before this there was no `beforeunload` handler and no
 * router blocker anywhere in the app: work simply vanished, with no prompt and no record.
 *
 * **One blocker, both channels, one source of truth.** `useBlocker` registers through
 * `history.block()`, and `@tanstack/history` attaches its `beforeunload` listener once at history
 * creation, reading the same blocker array. So in-app navigation and browser exit are already one
 * mechanism, and adding our own `window` listener would be a second opinion that drifts.
 *
 * **The trap that would have shipped this broken** (measured, `m0-measurement.md`): the unload path
 * never calls `shouldBlockFn`. It reads `enableBeforeUnload ?? true` and treats `true` as "block".
 * Registered with the default, this prompts the browser's "Leave site?" dialog on **every reload of
 * every page** — including a page with nothing unsaved — while the in-app half behaves perfectly.
 * The function form is not a refinement; it is the only correct usage.
 *
 * **Both callbacks must be referentially stable.** They sit in the registering effect's dependency
 * array, so an inline arrow re-registers the blocker on every render — every keystroke in a form.
 * Both are `useCallback` with empty deps reading the registry ref, which is also why the registry
 * is a ref rather than state.
 */
export function NavigationGuard(): React.ReactElement | null {
  /**
   * The registry object is created once per provider (`useMemo` with no dependencies), so depending
   * on it directly keeps both callbacks referentially stable — no ref mirror, and no ref written
   * during render, which the React Compiler rule correctly refuses. That stability is not an
   * assumption: `navigation-guard.test.tsx` counts registrations across five renders and fails at
   * six if it ever stops holding.
   */
  const registry = useUnsavedWorkRegistry();

  /** Where focus was when the navigation was attempted, so **Keep editing** can put it back. */
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const shouldBlockFn = useCallback(
    ({ next, current }: { next?: { fullPath?: string }; current?: { fullPath?: string } }) => {
      const reports = registry?.read() ?? [];
      if (!hasUnsavedWork(reports)) return false;
      // Never stand between someone and the way out. Signing out and an expired session both land
      // on /sign-in, and a confirmation there would trap a reader whose session is already gone —
      // the work is unreachable either way, so the prompt could only waste the one action left.
      if (next?.fullPath?.startsWith('/sign-in')) return false;
      // A navigation to where we already are discards nothing.
      if (next?.fullPath !== undefined && next.fullPath === current?.fullPath) return false;
      returnFocusTo.current = document.activeElement as HTMLElement | null;
      return true;
    },
    [registry],
  );

  const enableBeforeUnload = useCallback(() => hasUnsavedWork(registry?.read() ?? []), [registry]);

  const resolver = useBlocker({ shouldBlockFn, enableBeforeUnload, withResolver: true });

  const blocked = resolver.status === 'blocked';
  const reports = blocked ? (registry?.read() ?? []) : [];

  /**
   * The work went away while the dialog was open — a save landed, or the surface unmounted. Let the
   * navigation through rather than asking about something that no longer exists.
   */
  useEffect(() => {
    if (blocked && !hasUnsavedWork(registry?.read() ?? [])) resolver.proceed?.();
  }, [blocked, registry, resolver]);

  if (!blocked) return null;

  return (
    <ConfirmDialog
      open
      title="Leave without saving?"
      description={`${describeUnsavedWork(reports)} Leaving this page will discard them.`}
      confirmLabel="Leave"
      cancelLabel="Keep editing"
      confirmVariant="destructive"
      onConfirm={() => resolver.proceed?.()}
      onClose={() => {
        resolver.reset?.();
        // Focus goes back to what the reader activated. Native <dialog> restore is not enough here:
        // the element that opened this was a link or a rail button, not a trigger this dialog owns,
        // so without an explicit return focus lands on <body> — which is a WCAG 2.4.3 failure and
        // also silently kills the workspace keyboard accelerators. That exact drop has shipped
        // three times at this seam (ADR-0063 M6, ADR-0092, ADR-0099 M10).
        returnFocusTo.current?.focus();
      }}
    />
  );
}
