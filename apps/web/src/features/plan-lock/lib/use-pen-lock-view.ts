import { useEffect, useRef, useState } from 'react';

import type { PlanPen } from '../api/use-plan-edit-lock';
import type { EditLockControlsProps } from '../components/EditLockControls';

import { type LockView, resolveLockView } from './lock-view';

/**
 * The shared orchestration behind every "who holds the pen" surface (ADR-0028): resolving the
 * {@link LockView} from the live status, the once-a-second tick for the `aria-hidden` "active …" /
 * grace asides, the transient "Keep editing" dismissal, the lost-control scroll-into-view, and the
 * WCAG 2.4.3 focus return — after the user's *own* action unmounts the button they pressed, focus is
 * pulled back to the surface's container rather than dropping to `<body>`.
 *
 * Extracted so the full {@link EditLockBanner} card and the compact toolbar pen-status render from
 * one implementation — the delicate hand-off logic lives in exactly one place. Attach the returned
 * `containerRef` to each surface's `role="status"` root and spread `controlsProps` on
 * `EditLockControls`; `view` is null while the status is still loading (render a placeholder).
 */
export function usePenLockView(
  pen: PlanPen,
  currentUserId: string | undefined,
  /** Fixed clock for the asides (tests); live-ticks each second when omitted. */
  now?: number,
): {
  penManaged: boolean;
  view: LockView | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  controlsProps: EditLockControlsProps;
} {
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

  // After the user's own action changes the view (their button unmounted), pull focus back to the
  // surface container rather than letting it fall to <body>.
  useEffect(() => {
    if (justActedRef.current) {
      justActedRef.current = false;
      containerRef.current?.focus();
    }
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
