import { useEffect, useMemo, useRef, useState } from 'react';

import type { PlanPen } from '../api/use-plan-edit-lock';
import type { EditLockControlsProps } from '../components/EditLockControls';

import { type LockView, resolveLockView } from './lock-view';

/**
 * One resolved pen, shared by the two surfaces that show it (console epic M5).
 *
 * Named because the hook is called **once** — in the plan workspace — and its return handed to both
 * the deck's `Start editing` / `Stop editing` control and the foot row's badge, sentence and
 * hand-off actions. It holds real local state (a dismissed request id, a countdown tick, a
 * just-acted ref), so a second call would let those two halves disagree about the same lock.
 *
 * `containerRef` belongs to the **cluster**, not to the deck's control: attach it to the surface
 * rendering `role="status"`. `view` is null while the status is still loading — render a
 * placeholder, never an empty state, which reads as "nobody is editing".
 */
export interface PenLockView {
  penManaged: boolean;
  view: LockView | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  controlsProps: EditLockControlsProps;
}

/**
 * The shared orchestration behind every "who holds the pen" surface (ADR-0028): resolving the
 * {@link LockView} from the live status, the once-a-second tick for the `aria-hidden` "active …" /
 * grace asides, the transient "Keep editing" dismissal, the lost-control scroll-into-view, and the
 * WCAG 2.4.3 focus return — when the user's *own* action unmounts the button they pressed, focus is
 * pulled back to the surface's container rather than dropping to `<body>`. **When it does not
 * unmount it, nothing moves**; see that effect's own comment for why the qualifier is load-bearing.
 *
 * Extracted so the full `EditLockBanner` card and the compact pen status render from one
 * implementation — the delicate hand-off logic lives in exactly one place.
 *
 * **This docblock was orphaned for the whole of M5**, left above a second `/**` that described the
 * interface below it, so the function itself carried none and its text still instructed callers to
 * attach `containerRef` to "each surface's `role=\"status\"` root" — which the deck's pen control
 * deliberately does not do. Found by the M7 architecture review; the convention this file now
 * follows is that a docblock is edited where it is wrong rather than prepended to.
 */
export function usePenLockView(
  pen: PlanPen,
  currentUserId: string | undefined,
  /** Fixed clock for the asides (tests); live-ticks each second when omitted. */
  now?: number,
): PenLockView {
  const [dismissedRequestId, setDismissedRequestId] = useState<string | null>(null);
  const [tick, setTick] = useState(() => now ?? Date.now());
  const containerRef = useRef<HTMLDivElement>(null);
  const justActedRef = useRef(false);

  // **Paused while the tab is hidden**, which `render/use-now.ts` has done since ADR-0056 and this
  // timer did not: a backgrounded plan re-rendered the workspace 3,600 times an hour to advance a
  // relative-time phrase nobody was looking at. One correct pattern applied to a control and not
  // its neighbour, found by the M7 architecture review. Re-syncs on becoming visible rather than
  // waiting up to a second, so the aside is never briefly stale on return.
  useEffect(() => {
    if (now !== undefined || !pen.penManaged) return;
    let id: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      id = setInterval(() => setTick(Date.now()), 1000);
    };
    const stop = () => {
      if (id !== undefined) clearInterval(id);
      id = undefined;
    };
    const onVisibilityChange = () => {
      if (document.hidden) stop();
      else {
        setTick(Date.now());
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [now, pen.penManaged]);

  const effectiveNow = now ?? tick;
  const view = pen.penManaged
    ? resolveLockView(pen.status, pen.lostControl, currentUserId, dismissedRequestId, effectiveNow)
    : null;
  const signature = view ? `${view.tone}:${view.actions.join('|')}` : 'none';

  // After the user's own action changes the view, pull focus back to the surface container rather
  // than letting it fall to <body>.
  //
  // **Only when focus was actually lost**, which is narrower than it was and is the console epic's
  // M5-T4 correction. The restore was written for `EditLockControls`, where Start and Stop are
  // different members of the action list: an action that succeeds REMOVES the button that ran it,
  // focus falls to `<body>`, and every workspace keyboard accelerator dies with it (they are a
  // React `onKeyDown` on the workspace root), on top of the plain WCAG 2.2 §2.4.3 failure.
  //
  // The deck's pen control breaks that premise. It is one registry item whose label flips between
  // `Start editing` and `Stop editing`, so the element survives the transition and focus was never
  // lost — and restoring anyway takes focus off the button the planner is still standing on and
  // throws it to the foot row at the other end of the screen, which is the very failure this
  // effect exists to prevent, caused by the effect.
  //
  // So the condition is the FACT rather than the surface: `<body>` (or a detached node, or
  // nothing) means the pressed control went away and the restore is owed; anything else means
  // focus is somewhere real and moving it would be the regression. Asking which surface acted
  // would need the two to be told apart, and the hook deliberately does not know how many
  // surfaces read it.
  useEffect(() => {
    if (!justActedRef.current) return;
    justActedRef.current = false;
    const active = typeof document === 'undefined' ? null : document.activeElement;
    const lost = active === null || active === document.body || !active.isConnected;
    if (lost) containerRef.current?.focus();
  }, [signature]);

  // Surface a lost-pen event wherever the user is working.
  useEffect(() => {
    if (pen.lostControl && typeof containerRef.current?.scrollIntoView === 'function') {
      containerRef.current.scrollIntoView({ block: 'center' });
    }
  }, [pen.lostControl]);

  const act =
    (fn: () => void): (() => void) =>
    () => {
      justActedRef.current = true;
      fn();
    };

  // **Referentially stable while nothing a reader can see has changed** (console epic M7).
  //
  // This returned a fresh object literal on every render, which was harmless while the hook was
  // called in a leaf: `CompactPenStatus` re-rendered once a second and nothing else did. M5 moved
  // the call to the top of `ToolbarPlanWorkspace` and threaded the result through the TSLD toolbar
  // context — so the tick below began invalidating that context's `useMemo` every second, and with
  // it `resolveItems` over every registered command, both toolbars, and `TsldPanel`, which is the
  // canvas host and is not itself memoised.
  //
  // **Measured rather than argued, by two reviewers independently**: a render-count probe at the
  // shipped code against the pre-epic baseline showed `TsldPanel` going 1 → 6 renders across five
  // ticks where it had gone 1 → 2 and not scaled with the tick at all. The context memo's own
  // docblock names this hazard in as many words — "an unrelated parent re-render … doesn't hand
  // `<Toolbar>` a fresh context and churn its resolve → partition → measure cycle" — and M5
  // defeated it unconditionally.
  //
  // `signature` is already the hook's own answer to "has anything about the view changed", and it
  // is what the focus effect keys on. Reusing it here is not a convenience: it means the identity
  // and the effect cannot disagree about what counts as a change.
  //
  // The tick still fires; it just stops producing a new object when the second it counted did not
  // move any date the reader sees. What still moves per tick is the `aria-hidden` aside — which is
  // inside `view` and therefore inside `signature`'s subject only when its text changes, so a
  // countdown crossing a whole minute re-renders and the fifty-nine seconds between do not.
  const signatureWithAside = `${signature}|${view?.aside ?? ''}|${view?.message ?? ''}|${view?.badge ?? ''}`;

  // **The dependencies are the STABLE pieces, never `pen` itself**, and the first version of this
  // memo got that wrong in a way worth keeping: it listed `pen`, which `usePlanPen` rebuilds as a
  // fresh object literal on every render (`use-plan-edit-lock.ts` — it is not memoised). So the
  // memo never hit, and the fix for a once-a-second re-render was a `useMemo` that recomputed every
  // time: correct-looking, and incapable of working. Caught by asking whether the input was stable
  // rather than by anything failing, which is the only way this class is ever caught.
  //
  // The pieces below ARE stable: every callback is a `useCallback` on that hook, `penManaged` is a
  // build-time constant, and `holder` comes from the query cache. `signatureWithAside` covers
  // everything the two surfaces render, so a change a reader can see always produces a new object
  // and a tick that moves nothing does not.
  const { startEditing, stopEditing, requestControl, takeOver, handoff, dismissLost } = pen;
  const holder = pen.status?.holder ?? null;
  const requestedById = pen.status?.requestedBy?.id ?? null;
  const { penManaged, isPending } = pen;

  return useMemo(
    () => ({
      penManaged,
      view,
      containerRef,
      controlsProps: {
        actions: view?.actions ?? [],
        holder,
        isPending,
        onStart: act(startEditing),
        onStop: act(stopEditing),
        onRequest: act(requestControl),
        // Peer take-over and admin override are the SAME server call — `acquire({takeover:true})`;
        // the server decides immediate (override) vs post-grace (peer). They differ only in
        // affordance.
        onTakeOver: act(takeOver),
        onOverride: act(takeOver),
        onHandover: act(handoff),
        onKeep: act(() => {
          if (requestedById !== null) setDismissedRequestId(requestedById);
        }),
        onDismiss: act(dismissLost),
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `view` is rebuilt every render by
    // construction and `signatureWithAside` is the derived answer to whether it says anything
    // different; `act` is a local closure over a ref, which is stable by definition.
    [
      penManaged,
      isPending,
      signatureWithAside,
      holder,
      requestedById,
      startEditing,
      stopEditing,
      requestControl,
      takeOver,
      handoff,
      dismissLost,
    ],
  );
}
