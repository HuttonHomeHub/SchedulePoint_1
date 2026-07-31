import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useRecalculateCommand } from './use-schedule';

/** Trailing debounce (ms) that coalesces a burst of structural edits into one recalc (ADR-0032 M3). */
export const AUTO_RECALC_DEBOUNCE_MS = 500;

/**
 * How long a {@link PlanAutoRecalc.hold} may defer a recalculation before it fires anyway
 * (ADR-0064 T7).
 *
 * A hold exists so the bars do not move under a planner's hand between the two clicks of a link.
 * It must therefore be **capped**, because the thing holding it is a human gesture: someone who
 * arms the Link tool, clicks one bar and goes to lunch would otherwise leave the plan's dates stale
 * for the rest of the session, with nothing on screen saying why. Ten seconds is far longer than
 * any real two-click pick and far shorter than "until the tab is closed".
 */
export const AUTO_RECALC_HOLD_CAP_MS = 10_000;

export interface PlanAutoRecalc {
  /** Request a coalesced recalculation after a structural edit — trailing-debounced + single-flight. */
  notify: () => void;
  /**
   * Recalculate now (the manual Recalculate button's "force"): cancels the debounce and fires.
   * `onSuccess` (optional) fires once when the resulting recalc completes — so the *explicit* manual
   * action can confirm ("Schedule recalculated.") without the silent auto-triggered path announcing
   * on every debounced edit.
   */
  flush: (onSuccess?: () => void) => void;
  /** True while a recalculation POST is in flight (drives the manual button's busy state). */
  isPending: boolean;
  /**
   * Defer coalesced recalculations while a two-click gesture is open (ADR-0064 T7). While any hold
   * is open a {@link PlanAutoRecalc.notify} records the request but does not fire; the last
   * {@link PlanAutoRecalc.release} fires it, coalesced into one run.
   *
   * **Token-based**, not a boolean or a counter, so a caller can only ever release its own hold —
   * a stray extra `release()` from one surface cannot unblock another's open pick.
   */
  hold: (token: symbol) => void;
  /** Release a hold taken with {@link PlanAutoRecalc.hold}. Idempotent and unknown-token-safe. */
  release: (token: symbol) => void;
}

/**
 * The **auto-recalculate coalescer** (ADR-0032 M3). After any structural edit — from the canvas or
 * the activities table — a plan's CPM schedule must recalculate so the canvas plots the new dates.
 * Doing that per edit storms the recalc endpoint and self-inflicts latency; instead every surface
 * calls {@link PlanAutoRecalc.notify}, which **trailing-debounces** (≈500 ms) and **single-flights**
 * the recalc: a burst of edits becomes one recalc, and an edit made while a recalc is in flight
 * queues exactly one more run for when it settles. The manual Recalculate button calls
 * {@link PlanAutoRecalc.flush} to fire immediately. Guarded by `enabled` (role + pen + a start date)
 * so it never fires when a recalc would 4xx. Wraps the existing {@link useRecalculateCommand} — the
 * endpoint and ADR-0022's engine-owned batched write are unchanged; only the client cadence is.
 *
 * All burst state is in refs (read live), mirroring `use-coalesced-nudge`, so the debounced fire
 * never runs against a stale closure; the timer is cleared on unmount and a queued recalc is
 * best-effort flushed so a just-made edit still schedules across a `key={planId}` remount.
 */
export function usePlanAutoRecalc(
  orgSlug: string,
  planId: string,
  opts: {
    enabled: boolean;
    onMessage?: (message: string) => void;
    /**
     * Called when a hold hits {@link AUTO_RECALC_HOLD_CAP_MS} and the deferred recalculation fires
     * anyway. The caller's open gesture is no longer safe — the bars are about to move — so it must
     * drop it and say so. Nothing here decides what "drop it" means; that belongs to whoever holds.
     */
    onHoldExpired?: () => void;
  },
): PlanAutoRecalc {
  const recalc = useRecalculateCommand(orgSlug, planId);
  const recalcRef = useRef(recalc);
  const optsRef = useRef(opts);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const mountedRef = useRef(true);
  // A one-shot success callback for a manual flush (the Recalculate button), fired once when the
  // resulting recalc succeeds — survives the queue if the flush lands during an in-flight run.
  const manualSuccessRef = useRef<(() => void) | null>(null);
  // The queued single-flight re-run calls `fire` again; go through a ref so `fire`'s closure never
  // references itself (stale-closure-safe, and satisfies react-hooks).
  const fireRef = useRef<() => void>(() => {});
  /**
   * Open holds (ADR-0064 T7). A `Set` of tokens rather than a count, so a double-release is a no-op
   * instead of silently opening the gate on somebody else's pick.
   */
  const holdsRef = useRef<Set<symbol>>(new Set());
  /** A `notify()` arrived while held, so the last release owes a recalculation. */
  const heldNotifyRef = useRef(false);
  /** The cap timer, armed by the FIRST hold and cleared by the last release. */
  const holdCapRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fire = useCallback((): void => {
    const { enabled, onMessage } = optsRef.current;
    if (!enabled) {
      queuedRef.current = false;
      manualSuccessRef.current = null; // never announce success for a recalc that can't run
      return;
    }
    if (inFlightRef.current) {
      queuedRef.current = true; // single-flight: run exactly once more when the in-flight one settles
      return;
    }
    inFlightRef.current = true;
    queuedRef.current = false;
    const drain = (): void => {
      inFlightRef.current = false;
      if (queuedRef.current && mountedRef.current) fireRef.current();
    };
    recalcRef.current.run({
      onSuccess: () => {
        const announce = manualSuccessRef.current;
        manualSuccessRef.current = null;
        announce?.();
        drain();
      },
      onError: (message) => {
        manualSuccessRef.current = null; // a failed manual flush must not later announce success
        onMessage?.(message);
        drain();
      },
    });
  }, []);

  // Keep the live command/opts and the self-reference in refs (updated in an effect, not during
  // render) so the debounced/queued fire never runs against a stale closure.
  useEffect(() => {
    recalcRef.current = recalc;
    optsRef.current = opts;
    fireRef.current = fire;
  });

  const notify = useCallback((): void => {
    // Held: remember that a recalculation is owed, and let the last release schedule it. No timer is
    // armed, so a burst of edits during one open pick still becomes exactly one run afterwards.
    if (holdsRef.current.size > 0) {
      heldNotifyRef.current = true;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fire, AUTO_RECALC_DEBOUNCE_MS);
  }, [fire]);

  /** Clear the cap timer. Safe to call when none is armed. */
  const clearHoldCap = useCallback((): void => {
    if (holdCapRef.current) {
      clearTimeout(holdCapRef.current);
      holdCapRef.current = null;
    }
  }, []);

  const hold = useCallback((token: symbol): void => {
    const first = holdsRef.current.size === 0;
    holdsRef.current.add(token);
    if (!first) return;
    // The cap is armed by the FIRST hold and measured from there, not reset by later ones — the
    // question it answers is "how long has the schedule been stale", and that clock starts once.
    holdCapRef.current = setTimeout(() => {
      holdCapRef.current = null;
      holdsRef.current.clear();
      optsRef.current.onHoldExpired?.();
      if (heldNotifyRef.current) {
        heldNotifyRef.current = false;
        fireRef.current();
      }
    }, AUTO_RECALC_HOLD_CAP_MS);
  }, []);

  const release = useCallback(
    (token: symbol): void => {
      if (!holdsRef.current.delete(token)) return; // unknown or already-released token: no-op
      if (holdsRef.current.size > 0) return;
      clearHoldCap();
      if (!heldNotifyRef.current) return;
      heldNotifyRef.current = false;
      // Debounce from here rather than firing instantly: releasing a pick is usually the middle of a
      // burst (commit → the next edit), and the whole point of the coalescer is to see the burst out.
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(fire, AUTO_RECALC_DEBOUNCE_MS);
    },
    [fire, clearHoldCap],
  );

  const flush = useCallback(
    (onSuccess?: () => void): void => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (onSuccess) manualSuccessRef.current = onSuccess;
      // An explicit Recalculate is the user overruling the hold, not a coalesced edit: fire now and
      // drop the holds, so the surface that took one is told its gesture is no longer protected.
      if (holdsRef.current.size > 0) {
        holdsRef.current.clear();
        clearHoldCap();
        heldNotifyRef.current = false;
        optsRef.current.onHoldExpired?.();
      }
      fire();
    },
    [fire, clearHoldCap],
  );

  useEffect(() => {
    mountedRef.current = true;
    // Copied into the effect so the cleanup clears the set this effect saw, not whatever the ref
    // points at by then (react-hooks/exhaustive-deps). Same object in practice — the ref is never
    // reassigned — but "in practice" is how ref-in-cleanup bugs are always described.
    const holds = holdsRef.current;
    return () => {
      mountedRef.current = false;
      if (holdCapRef.current) {
        clearTimeout(holdCapRef.current);
        holdCapRef.current = null;
      }
      // A hold cannot outlive the hook that owns it — an unmount with a pick still open must not
      // suppress the trailing flush below, which is the only thing that saves a just-made edit.
      holds.clear();
      if (heldNotifyRef.current && optsRef.current.enabled && !inFlightRef.current) {
        heldNotifyRef.current = false;
        recalcRef.current.run({});
        return;
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        // Best-effort trailing recalc so an edit made just before unmount still schedules.
        if (optsRef.current.enabled && !inFlightRef.current) recalcRef.current.run({});
      }
    };
  }, []);

  // Stable identity except when `isPending` flips, so a consumer can safely depend on it (the toolbar
  // context memo) without churning every render (notify/flush are already stable).
  return useMemo(
    () => ({ notify, flush, hold, release, isPending: recalc.isPending }),
    [notify, flush, hold, release, recalc.isPending],
  );
}
