import type { ActivitySummary } from '@repo/types';
import { useEffect, useRef } from 'react';

import type { PendingGhost } from '../components/TsldCanvas';
import type { TsldEditOutcome, TsldResizeInput } from '../components/TsldPanel';
import { daysBetween } from '../render/render-model';

import { NUDGE_DEBOUNCE_MS } from './use-coalesced-nudge';

/** Serialize retry interval (ms): re-attempt the commit while a prior write is still in flight. */
const SERIALIZE_RETRY_MS = 40;

/** The accumulating optimistic target of an in-progress duration nudge (ADR-0052 M2). */
interface DurationTarget {
  activityId: string;
  name: string;
  /** The bar's fixed start day + lane, for the optimistic ghost (a resize moves neither). */
  startDay: number;
  laneIndex: number;
  /** The absolute tentative duration (whole days, clamped ≥ 1). */
  durationDays: number;
}

/**
 * Diff the absolute target against the *live persisted* row → the minimal resize input, or `null`
 * when props have already caught up (no write needed) or the activity has vanished. Pure so the
 * serialized `commit` and the unmount flush share identical semantics (the sibling
 * `use-coalesced-nudge` pattern).
 */
function buildResize(
  t: DurationTarget,
  activities: readonly ActivitySummary[],
): TsldResizeInput | null {
  const persisted = activities.find((a) => a.id === t.activityId);
  if (!persisted) return null; // the activity was deleted elsewhere — nothing to write
  if (t.durationDays === persisted.durationDays) return null; // props caught up — no-op
  return { activityId: t.activityId, durationDays: t.durationDays };
}

export interface CoalescedDurationNudgeDeps {
  onResize: ((input: TsldResizeInput) => Promise<TsldEditOutcome>) | undefined;
  activities: readonly ActivitySummary[];
  dataDate: string | null;
  setGhost: (ghost: PendingGhost | null) => void;
  setConflict: (message: string | null) => void;
  announce: (message: string) => void;
  /** True while a pointer edit is committing — a keyboard nudge must not race it. */
  isPointerBusy: () => boolean;
}

/**
 * Coalesced keyboard **duration** nudge (ADR-0052 M2, WCAG 2.5.7): the `Shift+←/→` equivalent of
 * the finish-edge resize drag. A held key fires OS key-repeat faster than a PATCH round-trip, so —
 * exactly like the sibling `useCoalescedNudge` — this accumulates the **absolute** target duration
 * across the burst, debounces the commit, and **serializes** writes so a burst is ONE minimal
 * PATCH read at the live version. The duration clamps at ≥ 1 day (the floor announces and no-ops,
 * mirroring the top-lane boundary message). All mutable state lives in refs; a pending nudge is
 * flushed on unmount rather than dropped. Returns the `nudge(activity, delta)` handler.
 */
export function useCoalescedDurationNudge(
  deps: CoalescedDurationNudgeDeps,
): (activity: ActivitySummary, delta: number) => void {
  const depsRef = useRef(deps);
  // Keep the latest deps in a ref so the debounced/serialized commit never runs against a stale
  // closure. Updated in an effect (not during render) so refs aren't written mid-render.
  useEffect(() => {
    depsRef.current = deps;
  });
  const targetRef = useRef<DurationTarget | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  // The in-flight write's settled chain (or null when idle), awaited by the unmount flush so a
  // delta queued *behind* an in-flight write isn't dropped (the #25c fix, inherited).
  const inFlightRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);

  const commit = (): void => {
    const t = targetRef.current;
    const { onResize, activities, setGhost, setConflict, announce } = depsRef.current;
    if (!t || !onResize) {
      targetRef.current = null;
      setGhost(null);
      return;
    }
    // Serialize: never read a version while the previous burst's write/invalidation is in flight.
    if (busyRef.current) {
      timerRef.current = setTimeout(commit, SERIALIZE_RETRY_MS);
      return;
    }
    const input = buildResize(t, activities);
    if (!input) {
      targetRef.current = null;
      setGhost(null);
      return; // deleted elsewhere, or props caught up — no write needed
    }
    const finalDuration = t.durationDays;
    const { name } = t;
    busyRef.current = true;
    inFlightRef.current = onResize(input)
      .then((outcome) => {
        if (!mountedRef.current) return;
        setGhost(null);
        if (outcome.conflict) {
          setConflict(outcome.conflict);
          targetRef.current = null; // truth wins — re-seed from props on the next nudge
        }
        if (outcome.applied) {
          // NB: targetRef deliberately survives here (the absolute-target cross-burst rule the
          // sibling hook documents), so a fast follow-up nudge extends from it, not a stale prop.
          announce(
            `Resized “${name}” to ${finalDuration} ${finalDuration === 1 ? 'day' : 'days'}; dates will update.`,
          );
        }
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return;
        setGhost(null);
        setConflict(err instanceof Error ? err.message : 'Couldn’t resize the activity.');
        targetRef.current = null;
      })
      .finally(() => {
        busyRef.current = false;
        inFlightRef.current = null;
      });
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (!targetRef.current) return;
      // Flush a queued nudge so a pending edit isn't silently dropped on unmount / plan switch.
      const flushFinal = (): void => {
        const t = targetRef.current;
        const { onResize, activities } = depsRef.current;
        if (!t || !onResize) return;
        const input = buildResize(t, activities);
        targetRef.current = null;
        if (input) void onResize(input).catch(() => {});
      };
      const inFlight = inFlightRef.current;
      if (busyRef.current && inFlight) void inFlight.then(flushFinal, flushFinal);
      else flushFinal();
    };
    // All mutable state is in refs read live via depsRef, so the empty deps array is correct.
  }, []);

  return (activity, delta) => {
    const { onResize, dataDate, setGhost, setConflict, announce, isPointerBusy } = depsRef.current;
    if (!onResize || dataDate === null) return;
    if (isPointerBusy()) return; // don't race an in-flight pointer edit
    let t = targetRef.current;
    if (!t || t.activityId !== activity.id) {
      // Switching activities mid-burst — flush the previous target before starting a new one.
      if (t) {
        if (timerRef.current) clearTimeout(timerRef.current);
        commit();
      }
      t = {
        activityId: activity.id,
        name: activity.name,
        startDay: activity.earlyStart ? daysBetween(dataDate, activity.earlyStart) : 0,
        laneIndex: activity.laneIndex,
        durationDays: activity.durationDays,
      };
      targetRef.current = t;
    }
    // One working day is the floor (ADR-0052 §3): the boundary announces and no-ops, mirroring
    // the reposition nudge's "Already in the top lane."
    const next = Math.max(1, t.durationDays + delta);
    if (next === t.durationDays) {
      announce('Duration is already one day.');
      return;
    }
    t = { ...t, durationDays: next };
    targetRef.current = t;
    setConflict(null);
    // Optimistic ghost tracks the burst for sighted users; AT hears the net result on commit.
    setGhost({
      startDay: t.startDay,
      endDay: t.startDay + t.durationDays - 1,
      laneIndex: t.laneIndex,
    });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(commit, NUDGE_DEBOUNCE_MS);
  };
}
