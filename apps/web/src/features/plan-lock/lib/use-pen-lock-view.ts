import { useEffect, useRef, useState } from 'react';

import type { PlanPen } from '../api/use-plan-edit-lock';
import type { EditLockControlsProps } from '../components/EditLockControls';

import { type LockView, resolveLockView } from './lock-view';

/**
 * The shared orchestration behind every "who holds the pen" surface (ADR-0028): resolving the
 * {@link LockView} from the live status, the once-a-second tick for the `aria-hidden` "active …" /
 * grace asides, the transient "Keep editing" dismissal, the lost-control scroll-into-view, and the
 * WCAG 2.4.3 focus return — when the user's *own* action unmounts the button they pressed, focus is
 * pulled back to the surface's container rather than dropping to `<body>`. **When it does not
 * unmount it, nothing moves**; see the effect's own comment for why that qualifier is load-bearing
 * rather than defensive.
 *
 * Extracted so the full {@link EditLockBanner} card and the compact toolbar pen-status render from
 * one implementation — the delicate hand-off logic lives in exactly one place. Attach the returned
 * `containerRef` to each surface's `role="status"` root and spread `controlsProps` on
 * `EditLockControls`; `view` is null while the status is still loading (render a placeholder).
 */
/**
 * One resolved pen, shared by the two surfaces that show it (console epic M5).
 *
 * Named because the hook is now called **once** — in the plan workspace — and its return handed to
 * both the deck's `Start editing` / `Stop editing` control and the foot row's badge, sentence and
 * hand-off actions. It holds real local state (a dismissed request id, a countdown tick, a just-acted
 * ref), so a second call would let those two halves disagree about the same lock.
 */
export interface PenLockView {
  penManaged: boolean;
  view: LockView | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  controlsProps: EditLockControlsProps;
}

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

  useEffect(() => {
    if (now !== undefined || !pen.penManaged) return;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
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

  const controlsProps: EditLockControlsProps = {
    actions: view?.actions ?? [],
    holder: pen.status?.holder ?? null,
    isPending: pen.isPending,
    onStart: act(pen.startEditing),
    onStop: act(pen.stopEditing),
    onRequest: act(pen.requestControl),
    // Peer take-over and admin override are the SAME server call — `acquire({takeover:true})`; the
    // server decides immediate (override) vs post-grace (peer). They differ only in affordance.
    onTakeOver: act(pen.takeOver),
    onOverride: act(pen.takeOver),
    onHandover: act(pen.handoff),
    onKeep: act(() => {
      if (pen.status?.requestedBy) setDismissedRequestId(pen.status.requestedBy.id);
    }),
    onDismiss: act(pen.dismissLost),
  };

  return { penManaged: pen.penManaged, view, containerRef, controlsProps };
}
