import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useRecalculateCommand } from './use-schedule';

/** Trailing debounce (ms) that coalesces a burst of structural edits into one recalc (ADR-0032 M3). */
export const AUTO_RECALC_DEBOUNCE_MS = 500;

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
  opts: { enabled: boolean; onMessage?: (message: string) => void },
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
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fire, AUTO_RECALC_DEBOUNCE_MS);
  }, [fire]);

  const flush = useCallback(
    (onSuccess?: () => void): void => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (onSuccess) manualSuccessRef.current = onSuccess;
      fire();
    },
    [fire],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
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
    () => ({ notify, flush, isPending: recalc.isPending }),
    [notify, flush, recalc.isPending],
  );
}
