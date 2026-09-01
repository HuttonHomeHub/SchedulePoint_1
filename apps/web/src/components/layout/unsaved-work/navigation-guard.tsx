import { useBlocker } from '@tanstack/react-router';
import { useCallback, useEffect, useRef } from 'react';

import { useUnsavedWorkRegistry, useUnsavedWorkReports } from './unsaved-work-provider';

import { useAnnounce } from '@/components/ui/announcer';
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

  const announce = useAnnounce();

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

  /**
   * **Subscribed, not read imperatively — and this is a fix, not a tidy-up.**
   *
   * `useUnsavedWorkRegistry` returns a `useMemo(…, [])` object, so its identity never changes.
   * Nothing else here changes either while a confirmation is open. So the auto-proceed effect
   * below — whose whole subject is work disappearing WHILE the dialog stands — had a dependency
   * array that could not move, and the guard had nothing re-rendering it: the effect could only run
   * at the moment `blocked` flipped, which is precisely the moment `shouldBlockFn` has just
   * established there IS unsaved work. It fired in production only when something unrelated
   * happened to re-render this component.
   *
   * `useUnsavedWorkReports` is the subscribing reader, and until now it had **no production
   * caller** (`docs/TECH_DEBT.md` #184 recorded that, and kept it for a future consumer). This is
   * that consumer. The provider's `bump()` is already change-gated — a re-render that produces a
   * scope-for-scope identical report does not notify — so subscribing costs nothing per keystroke.
   *
   * The two blocker callbacks deliberately keep reading `registry` imperatively: they are
   * `useCallback([registry])`, and making them depend on a changing value would re-register the
   * blocker on every registry change, which `navigation-guard.test.tsx` counts.
   */
  const liveReports = useUnsavedWorkReports();
  const reports = blocked ? liveReports : [];

  /**
   * The work went away while the dialog was open — a save landed, or the surface unmounted. Let the
   * navigation through rather than asking about something that no longer exists.
   *
   * **And say so** (`docs/TECH_DEBT.md` #184). This completes a navigation with no gesture from the
   * reader: the dialog they were reading disappears and the page changes underneath them, which for
   * anyone not watching the screen is an unexplained context change and for anyone mid-sentence in
   * a screen reader is the sentence being cut off. The announcement is the only channel that
   * carries the reason, because visually the answer is obvious — the page moved — and audibly it is
   * not.
   *
   * It fires INSIDE the effect rather than beside `proceed()` at a call site, because there is no
   * call site: this is the one path that proceeds without anybody pressing anything.
   */
  useEffect(() => {
    if (blocked && !hasUnsavedWork(liveReports)) {
      announce('Your changes were saved, so leaving the page no longer discards anything.');
      resolver.proceed?.();
    }
  }, [announce, blocked, liveReports, resolver]);

  /**
   * Put focus back where the reader left it — **after** the dialog has gone, never inside the click
   * handler.
   *
   * The first version called `focus()` from `onClose`, and the accessibility review established it
   * was a **no-op**: at that moment the `<dialog>` is still open, so everything outside it is
   * `inert`, and the HTML spec says an inert element cannot be focused. The docblock claimed the
   * call was what put focus back; it never did anything. This seam has now shipped focus to
   * `<body>` four times (ADR-0063 M6, ADR-0092, ADR-0099 M10, and this).
   *
   * Keyed on `blocked` going true → false, which is the commit after the dialog unmounts. Only the
   * RESET path restores: on proceed the route is leaving and the element is going with it.
   */
  const wasBlocked = useRef(false);
  useEffect(() => {
    if (wasBlocked.current && !blocked) {
      const target = returnFocusTo.current;
      returnFocusTo.current = null;
      if (target?.isConnected === true) target.focus();
    }
    wasBlocked.current = blocked;
  }, [blocked]);

  if (!blocked) return null;

  return (
    <ConfirmDialog
      open
      title="Leave without saving?"
      description={`${describeUnsavedWork(reports)} Leaving this page will discard them.`}
      // "Discard and leave", not "Leave": the sibling confirmation in the activity editor says
      // "Discard" for the same irreversible act, and one word for losing work is worth more than a
      // shorter button. Found by the ux review as copy drift between two dialogs in one tree.
      confirmLabel="Discard and leave"
      cancelLabel="Keep editing"
      confirmVariant="destructive"
      onConfirm={() => resolver.proceed?.()}
      onClose={() => {
        resolver.reset?.();
      }}
    />
  );
}
