import type { ActivitySummary } from '@repo/types';
import { useEffect, useRef } from 'react';

import type { PendingGhost } from '../components/TsldCanvas';
import type { TsldEditOutcome, TsldRepositionInput } from '../components/TsldPanel';
import { drawnDaySpan } from '../model/drawn-span';
import { repositionAnnouncement } from '../model/reposition-announcement';

import type { BarDateSource } from '@/lib/bar-dates';

/** Debounce (ms) that coalesces a held Alt+arrow key-repeat into one nudge write (M5 5.2 §4). */
export const NUDGE_DEBOUNCE_MS = 150;
/** Serialize retry interval (ms): re-attempt the commit while a prior write is still in flight. */
const SERIALIZE_RETRY_MS = 40;

/** The accumulating optimistic target of an in-progress nudge (survives burst boundaries). */
interface NudgeTarget {
  activityId: string;
  name: string;
  span: number;
  laneIndex: number;
  startDay: number;
}

/**
 * Diff the absolute target against the *live persisted* row → the minimal PATCH, or `null` when
 * props have already caught up (no write needed) or the activity has vanished. Pure so both the
 * serialized `commit` and the unmount flush share identical semantics.
 */
function buildReposition(
  t: NudgeTarget,
  activities: readonly ActivitySummary[],
  dataDate: string,
  source: BarDateSource,
): TsldRepositionInput | null {
  const persisted = activities.find((a) => a.id === t.activityId);
  if (!persisted) return null; // the activity was deleted elsewhere — nothing to write
  // Compared against where the bar is DRAWN, the same origin the target was seeded from.
  const persistedStart = drawnDaySpan(persisted, source, dataDate)?.startDay ?? 0;
  const laneChanged = t.laneIndex !== persisted.laneIndex;
  const timeChanged = t.startDay !== persistedStart;
  if (!laneChanged && !timeChanged) return null; // props caught up to the target — no-op
  return {
    activityId: t.activityId,
    ...(timeChanged ? { startDay: t.startDay } : {}),
    ...(laneChanged ? { laneIndex: t.laneIndex } : {}),
  };
}

export interface CoalescedNudgeDeps {
  onReposition: ((input: TsldRepositionInput) => Promise<TsldEditOutcome>) | undefined;
  activities: readonly ActivitySummary[];
  dataDate: string | null;
  setGhost: (ghost: PendingGhost | null) => void;
  setConflict: (message: string | null) => void;
  announce: (message: string) => void;
  /** True while a pointer-drag reposition is committing — a keyboard nudge must not race it. */
  isPointerBusy: () => boolean;
  /**
   * Which dates the canvas is drawing bars from — the panel's `barDateSource`. A nudge means "one
   * day later than the bar IS", so it seeds from the drawn span; required rather than defaulted,
   * because the default that shipped (the early start) is the defect it exists to prevent.
   */
  barDateSource: BarDateSource;
}

/**
 * Coalesced keyboard nudge (M5 5.2). A held `Alt`+arrow fires OS key-repeat faster than a PATCH
 * round-trip; committing per repeat self-inflicts stale-version 409s (and a recalc per keystroke).
 * Instead this accumulates the **absolute** optimistic target across the burst, debounces the
 * commit, and **serializes** writes — so a burst is ONE minimal PATCH read at the live version.
 *
 * Correctness:
 * - The target **persists across burst boundaries** (it is not reset from props while a prior write
 *   is unsettled), and each commit sends the **absolute** target diffed against the *current
 *   persisted* value (read live from `activities`), so a fast re-nudge before the refetch lands
 *   still commits the correct net position rather than clobbering it from a stale baseline.
 * - Writes serialize (`busyRef`), so the version a commit reads is always post-refetch-fresh.
 * - A pending nudge is **flushed on unmount** (e.g. a `key={planId}` remount) rather than dropped.
 * - A keyboard nudge bails while a pointer reposition is in flight (`isPointerBusy`), and vice-versa
 *   (the caller's pointer path skips while the optimistic ghost is set) — no concurrent writes.
 *
 * All mutable burst state lives in refs; `deps` is read live via a ref so the debounced fire never
 * runs against a stale closure. Returns the `nudge(activity, axis, delta)` handler.
 */
export function useCoalescedNudge(
  deps: CoalescedNudgeDeps,
): (activity: ActivitySummary, axis: 'lane' | 'time', delta: number) => void {
  const depsRef = useRef(deps);
  // Keep the latest deps in a ref so the debounced/serialized commit never runs against a stale
  // closure. Updated in an effect (not during render) so refs aren't written mid-render.
  useEffect(() => {
    depsRef.current = deps;
  });
  const targetRef = useRef<NudgeTarget | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  // The in-flight write's settled chain (or null when idle). The unmount flush awaits it so a delta
  // queued *behind* an in-flight write isn't dropped (#25c).
  const inFlightRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);

  const commit = (): void => {
    const t = targetRef.current;
    const { onReposition, activities, dataDate, setGhost, setConflict, announce } = depsRef.current;
    if (!t || !onReposition || dataDate === null) {
      targetRef.current = null;
      setGhost(null);
      return;
    }
    // Serialize: never read a version while the previous burst's write/invalidation is in flight.
    if (busyRef.current) {
      timerRef.current = setTimeout(commit, SERIALIZE_RETRY_MS);
      return;
    }
    const input = buildReposition(t, activities, dataDate, depsRef.current.barDateSource);
    if (!input) {
      targetRef.current = null;
      setGhost(null);
      return; // deleted elsewhere, or props caught up — no write needed
    }
    const laneChanged = input.laneIndex !== undefined;
    const timeChanged = input.startDay !== undefined;
    const finalLane = t.laneIndex;
    // The lane the bar is persisted in, so the announcement can tell "went on past an occupied
    // lane" from "found no free lane at all" (`reposition-announcement.ts`).
    const originalLane = activities.find((a) => a.id === t.activityId)?.laneIndex ?? finalLane;
    const { name } = t;
    busyRef.current = true;
    inFlightRef.current = onReposition(input)
      .then((outcome) => {
        if (!mountedRef.current) return;
        setGhost(null);
        if (outcome.conflict) {
          setConflict(outcome.conflict);
          targetRef.current = null; // truth wins — re-seed from props on the next nudge
        }
        // The bar went on past an occupied lane (NetPoint-layout M3), or could not move at all:
        // the next nudge must extend from where it IS, not from the lane that was asked for.
        const landed = outcome.laneIndex ?? finalLane;
        if (outcome.laneIndex !== undefined && targetRef.current?.activityId === input.activityId) {
          targetRef.current = { ...targetRef.current, laneIndex: outcome.laneIndex };
        }
        if (outcome.applied) {
          // NB: deliberately do NOT null targetRef here. It's the absolute target and must survive
          // the window before `activities` refetches, so a fast follow-up nudge extends from it
          // rather than re-seeding from a stale prop (that would re-introduce the cross-burst
          // clobber this hook fixes). Once props catch up, the next commit's caught-up check no-ops.
          announce(
            repositionAnnouncement({
              name,
              snappedDate: null,
              timeChanged,
              laneChanged,
              requested: finalLane,
              landed,
              original: originalLane,
            }),
          );
        }
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return;
        setGhost(null);
        setConflict(err instanceof Error ? err.message : 'Couldn’t move the activity.');
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
      // `flushFinal` is a best-effort absolute write that touches no React state (safe post-unmount).
      const flushFinal = (): void => {
        const t = targetRef.current;
        const { onReposition, activities, dataDate } = depsRef.current;
        if (!t || !onReposition || dataDate === null) return;
        const input = buildReposition(t, activities, dataDate, depsRef.current.barDateSource);
        targetRef.current = null;
        if (input) void onReposition(input).catch(() => {});
      };
      // A write is still in flight AND a further burst queued more delta: await the in-flight write,
      // THEN flush the queued net target. Previously the `!busyRef` guard dropped it (#25c).
      const inFlight = inFlightRef.current;
      if (busyRef.current && inFlight) void inFlight.then(flushFinal, flushFinal);
      else flushFinal();
    };
    // All mutable state is in refs read live via depsRef, so the empty deps array is correct.
  }, []);

  return (activity, axis, delta) => {
    const { onReposition, dataDate, setGhost, setConflict, announce, isPointerBusy } =
      depsRef.current;
    if (!onReposition || dataDate === null) return;
    if (isPointerBusy()) return; // don't race an in-flight pointer-drag reposition
    let t = targetRef.current;
    if (!t || t.activityId !== activity.id) {
      // Switching activities mid-burst — flush the previous target before starting a new one.
      if (t) {
        if (timerRef.current) clearTimeout(timerRef.current);
        commit();
      }
      // Seeded from where the bar is DRAWN: a placed bar's early start can be days from it, and
      // `Alt+→` from there threw the placement the wrong way (reported 2026-09-23).
      const drawn = drawnDaySpan(activity, depsRef.current.barDateSource, dataDate);
      const startDay = drawn?.startDay ?? 0;
      const span = drawn ? drawn.endDay - drawn.startDay : 0;
      t = {
        activityId: activity.id,
        name: activity.name,
        span,
        laneIndex: activity.laneIndex,
        startDay,
      };
      targetRef.current = t;
    }
    if (axis === 'lane') {
      // Only lane 0 is a hard boundary; downward is unbounded (a planner may spread activities into
      // new lanes). `Alt+↑` at the top announces and no-ops; there is no artificial bottom cap.
      const next = Math.max(0, t.laneIndex + delta);
      if (next === t.laneIndex) {
        announce('Already in the top lane.');
        return;
      }
      t = { ...t, laneIndex: next };
    } else {
      // An SNET before the data date is legal; the engine clamps as needed.
      t = { ...t, startDay: t.startDay + delta };
    }
    targetRef.current = t;
    setConflict(null);
    // Optimistic ghost tracks the burst for sighted users; AT hears the net result on commit.
    setGhost({ startDay: t.startDay, endDay: t.startDay + t.span, laneIndex: t.laneIndex });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(commit, NUDGE_DEBOUNCE_MS);
  };
}
