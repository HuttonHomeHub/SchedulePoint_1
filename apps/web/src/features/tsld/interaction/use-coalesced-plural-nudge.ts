import type { ActivitySummary } from '@repo/types';
import { useEffect, useRef, type MutableRefObject } from 'react';

import type { PendingGhost } from '../components/TsldCanvas';
import type { TsldBulkOperations } from '../components/TsldPanel';
import { drawnDaySpan } from '../model/drawn-span';
import {
  MOVE_FAILED_NOTE,
  pluralMoveAnnouncement,
  STILL_SAVING_NOTE,
  swimlanePluralAnnouncement,
} from '../model/reposition-announcement';
import {
  isStartEdgeFrozen,
  startFrozenPluralReason,
  summaryNotMovablePluralReason,
  topLanePluralReason,
} from '../render/hit-test';

import { NUDGE_DEBOUNCE_MS, SERIALIZE_RETRY_MS } from './use-coalesced-nudge';

import type { BarDateSource } from '@/lib/bar-dates';

/** How long a commit waits for the previous write to show in the props before it goes anyway. */
const VERSION_WAIT_MAX_MS = 2000;

/**
 * One burst of key presses on one selected set. It holds a **delta**, not an absolute target:
 * `moveMany` moves a set by one uniform delta, and the server rolls each `visualStart` onto a
 * working day, so rows land non-uniformly and a per-row absolute target could not be expressed.
 */
interface Burst {
  /** The sorted id set — a different selection is a different burst. */
  key: string;
  ids: readonly string[];
  /** The anchor's drawn span and lane, including any earlier write the props do not show yet. */
  span: number;
  startDay: number;
  laneIndex: number;
  /** The earlier-write lane offset applied to every row's persisted lane (top-lane check). */
  laneOffset: number;
  dayDelta: number;
  laneDelta: number;
  /** When the latest keypress of the burst happened — the undo window is measured from it. */
  pressedAt: number;
}

/** A committed delta the props do not show yet, so the next burst on the set extends from it. */
interface Lag {
  key: string;
  /** The live versions when it was queued — equal versions mean the write has not landed. */
  versions: ReadonlyMap<string, number>;
  dayDelta: number;
  laneDelta: number;
}

export interface CoalescedPluralNudgeDeps {
  moveMany: TsldBulkOperations['moveMany'] | undefined;
  activities: readonly ActivitySummary[];
  dataDate: string | null;
  setGhost: (ghost: PendingGhost | null) => void;
  /** `refreshable` false for a refusal that is a rule, not stale data (no refresh offered). */
  setConflict: (message: string | null, refreshable?: boolean) => void;
  announce: (message: string) => void;
  /** True while any OTHER write (a pointer drag, a single-bar nudge) is committing. */
  isOtherWriteBusy: () => boolean;
  /** Held true while this hook has a pending or in-flight burst, so the other writers can see it. */
  busyRef: MutableRefObject<boolean>;
  /** Which dates the canvas is drawing bars from — the nudge moves the bar as DRAWN. */
  barDateSource: BarDateSource;
  /**
   * With swimlanes shown (`activities` are then in display lanes): the top of each bar's own
   * swimlane, as a display lane. The set stops there, the way it stops at lane 0 without swimlanes.
   * Absent means lane 0.
   */
  laneFloor?: ((activityId: string) => number) | undefined;
  /** The sentence for a set held at the top; absent is `topLanePluralReason`. */
  topLaneReason?: ((count: number, total: number) => string) | undefined;
}

const keyOf = (ids: readonly string[]): string => [...ids].sort().join(',');
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Coalesced keyboard nudge of a **plural selection** (`docs/TECH_DEBT.md` #116 item 1). A sibling of
 * `useCoalescedNudge` rather than a mode of it: that hook's correctness rests on an absolute
 * per-activity target diffed against one persisted row, each line earned by a defect (#25c, #448),
 * and a plural mode would have put a delta model inside the same refs. This one accumulates a net
 * delta, debounces it, and writes it through `moveMany` — the seam the plural drag uses, so the
 * keyboard and the pointer share one write, one undo step and one pen/409 handling.
 *
 * - A held key is ONE write: presses accumulate, and one `moveMany` goes out on settle.
 * - Writes queue behind each other, and a commit waits (bounded) until the props show the previous
 *   write, so it is read at the version that write left rather than a stale one. A residual 409
 *   is all-or-nothing and shown as the ordinary banner.
 * - An uncommitted burst is flushed on unmount; a committed one is never replayed (#448).
 * - Nothing is announced as moved unless `moveMany` says it applied — a pen rejection resolves
 *   `applied: false`.
 *
 * All mutable state is in refs; `deps` is read live through a ref so a debounced commit never runs
 * against a stale closure. Returns `nudge(ids, anchor, axis, delta)`.
 */
export function useCoalescedPluralNudge(
  deps: CoalescedPluralNudgeDeps,
): (ids: readonly string[], anchor: ActivitySummary, axis: 'lane' | 'time', delta: number) => void {
  const depsRef = useRef(deps);
  const burstRef = useRef<Burst | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const queuedRef = useRef(0);
  const mountedRef = useRef(true);
  const lagRef = useRef<Lag | null>(null);
  // The versions the last write sent, so the next commit can wait for the props to move past them.
  const lastSentRef = useRef<ReadonlyMap<string, number>>(new Map());

  const syncBusy = (): void => {
    depsRef.current.busyRef.current = burstRef.current !== null || queuedRef.current > 0;
  };

  const liveRows = (ids: readonly string[]): ActivitySummary[] =>
    ids.flatMap((id) => {
      const row = depsRef.current.activities.find((a) => a.id === id);
      return row ? [row] : [];
    });

  /** The deltas of an earlier committed write for this set that the props do not show yet. */
  const activeLag = (key: string, rows: readonly ActivitySummary[]): Lag | null => {
    const lag = lagRef.current;
    if (!lag || lag.key !== key) return null;
    return rows.every((r) => lag.versions.get(r.id) === r.version) ? lag : null;
  };

  const run = async (burst: Burst): Promise<void> => {
    // Nothing else is queued or being typed once this write settles.
    const settled = (): boolean => burstRef.current === null && queuedRef.current <= 1;
    try {
      // Wait for any other write to finish and for the previous write to show in the props.
      const deadline = Date.now() + VERSION_WAIT_MAX_MS;
      while (mountedRef.current && Date.now() < deadline) {
        const landed = liveRows(burst.ids).every((r) => {
          const sent = lastSentRef.current.get(r.id);
          return sent === undefined || r.version !== sent;
        });
        if (landed && !depsRef.current.isOtherWriteBusy()) break;
        await sleep(SERIALIZE_RETRY_MS);
      }
      const rows = liveRows(burst.ids);
      const { moveMany } = depsRef.current;
      if (rows.length === 0 || !moveMany) {
        lagRef.current = null;
        return;
      }
      lastSentRef.current = new Map(rows.map((r) => [r.id, r.version]));
      const outcome = await moveMany(
        rows,
        { dayDelta: burst.dayDelta, laneDelta: burst.laneDelta },
        { coalesce: true, pressedAt: burst.pressedAt },
      );
      if (!outcome.applied) {
        lagRef.current = null;
        lastSentRef.current = new Map();
      }
      if (!mountedRef.current) return;
      const { setConflict, announce, setGhost } = depsRef.current;
      if (outcome.conflict) setConflict(outcome.conflict, outcome.refreshable ?? true);
      else if (outcome.applied) {
        // On the swimlane layout the host reports what actually moved; the delta asked for is not
        // a fact about bars that found no free lane.
        announce(
          outcome.swimlaneMoved
            ? swimlanePluralAnnouncement({
                ...outcome.swimlaneMoved,
                timeChanged: burst.dayDelta !== 0,
              })
            : pluralMoveAnnouncement({
                count: rows.length,
                dayDelta: burst.dayDelta,
                laneDelta: burst.laneDelta,
              }),
        );
      } else {
        // The ghost was shown and nothing was written (a lost pen, most often). The pen UI says why;
        // this keeps the listener from hearing silence after pressing a key that did something.
        announce(MOVE_FAILED_NOTE);
      }
      if (settled()) setGhost(null);
    } catch (err: unknown) {
      lagRef.current = null;
      lastSentRef.current = new Map();
      if (!mountedRef.current) return;
      const { setConflict, setGhost } = depsRef.current;
      setConflict(err instanceof Error ? err.message : 'Couldn’t move those activities.');
      if (settled()) setGhost(null);
    }
  };

  /** Hand a burst to the write queue. The delta is now owned by that write. */
  const enqueue = (burst: Burst): void => {
    if (burst.dayDelta === 0 && burst.laneDelta === 0) {
      // A burst that netted to zero writes and announces nothing.
      if (queuedRef.current === 0 && mountedRef.current) depsRef.current.setGhost(null);
      return;
    }
    const rows = liveRows(burst.ids);
    const prior = activeLag(burst.key, rows);
    lagRef.current = {
      key: burst.key,
      versions: new Map(rows.map((r) => [r.id, r.version])),
      dayDelta: (prior?.dayDelta ?? 0) + burst.dayDelta,
      laneDelta: (prior?.laneDelta ?? 0) + burst.laneDelta,
    };
    queuedRef.current += 1;
    syncBusy();
    chainRef.current = chainRef.current
      .then(() => run(burst))
      .finally(() => {
        queuedRef.current -= 1;
        syncBusy();
      });
  };

  const flush = (): void => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const burst = burstRef.current;
    burstRef.current = null;
    if (burst) enqueue(burst);
    syncBusy();
  };

  // Refs only, but the cleanup below must call the latest closure, so it is read through a ref
  // that the effect keeps current — the same device as `depsRef`.
  const enqueueRef = useRef(enqueue);
  useEffect(() => {
    depsRef.current = deps;
    enqueueRef.current = enqueue;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      // Best-effort: the flushed write runs after the component is gone, so its outcome is neither
      // announced nor reported — a failure is silent, and the refetch shows the truth. Only the
      // UNCOMMITTED burst is flushed here; a queued one already owns its delta and runs on,
      // and nothing already written is replayed (#448).
      const burst = burstRef.current;
      burstRef.current = null;
      if (burst) enqueueRef.current(burst);
    };
  }, []);

  return (ids, anchor, axis, delta) => {
    const {
      moveMany,
      dataDate,
      setGhost,
      setConflict,
      announce,
      isOtherWriteBusy,
      barDateSource,
      laneFloor,
      topLaneReason,
    } = depsRef.current;
    if (!moveMany || dataDate === null) return;
    if (isOtherWriteBusy()) {
      // Don't race a pointer drag or a single-bar nudge — and don't drop the press silently.
      announce(STILL_SAVING_NOTE);
      return;
    }
    const rows = liveRows(ids);
    if (rows.length === 0) return;
    // A WBS summary is in the set: the server would refuse the whole batch (422), so say so first.
    const summaries = rows.filter((r) => r.type === 'WBS_SUMMARY').length;
    if (summaries > 0) {
      setConflict(summaryNotMovablePluralReason(summaries), false);
      return;
    }
    // Started bars cannot slide sideways (#431), and a set moves as one: refuse the whole burst
    // aloud rather than move some of it. A lane move is unaffected.
    if (axis === 'time') {
      const started = rows.filter(isStartEdgeFrozen).length;
      if (started > 0) {
        setConflict(startFrozenPluralReason(started), false);
        return;
      }
    }
    const key = keyOf(ids);
    if (burstRef.current && burstRef.current.key !== key) flush(); // switching sets mid-burst
    let burst = burstRef.current;
    if (!burst) {
      const lag = activeLag(key, rows);
      const drawn = drawnDaySpan(anchor, barDateSource, dataDate);
      burst = {
        key,
        ids,
        span: drawn ? drawn.endDay - drawn.startDay : 0,
        startDay: (drawn?.startDay ?? 0) + (lag?.dayDelta ?? 0),
        laneIndex: anchor.laneIndex + (lag?.laneDelta ?? 0),
        laneOffset: lag?.laneDelta ?? 0,
        dayDelta: 0,
        laneDelta: 0,
        pressedAt: Date.now(),
      };
    }
    if (axis === 'lane') {
      // The set keeps its shape at the top: moving it up past lane 0 would clamp each row on its
      // own and collapse the lanes between them (the per-row clamp in `movedPlacement`), so refuse
      // the whole press aloud rather than hand that to the server.
      const { laneOffset, laneDelta } = burst;
      const blocked = rows.filter(
        (r) => r.laneIndex + laneOffset + laneDelta + delta < (laneFloor?.(r.id) ?? 0),
      ).length;
      if (blocked > 0) {
        setConflict((topLaneReason ?? topLanePluralReason)(blocked, rows.length), false);
        return;
      }
      burst = { ...burst, laneDelta: laneDelta + delta };
    } else {
      burst = { ...burst, dayDelta: burst.dayDelta + delta };
    }
    burst = { ...burst, pressedAt: Date.now() };
    burstRef.current = burst;
    syncBusy();
    setConflict(null);
    // Optimistic ghost on the anchor only; AT hears the net result on commit.
    setGhost({
      startDay: burst.startDay + burst.dayDelta,
      endDay: burst.startDay + burst.dayDelta + burst.span,
      laneIndex: burst.laneIndex + burst.laneDelta,
    });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, NUDGE_DEBOUNCE_MS);
  };
}
