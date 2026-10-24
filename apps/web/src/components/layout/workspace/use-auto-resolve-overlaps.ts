import type { ActivitySummary } from '@repo/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { PlainLaneRow, SwimlaneLaneRow } from '@/features/swimlanes';
import type { SwimlaneInput } from '@/features/tsld';
import type { LaneResolution } from '@/features/tsld/model/auto-resolve';
import {
  layoutSnapshotsOf,
  resolveBothLayouts,
  type LayoutSnapshots,
  type SwimlaneResolution,
} from '@/features/tsld/model/auto-resolve-swimlanes';
import {
  autoArrangeCommand,
  type CheckableCommand,
  composeSteps,
  swimlaneLanesCommand,
  type BatchPositionsFn,
  type Command,
} from '@/features/undo-redo';
import type { PlanEditHistory } from '@/features/undo-redo/use-plan-edit-history';

/** What the dock says after an edit moved a bar clear of an overlap. */
export interface LayoutResolvedNotice {
  /** The sentence the dock shows, and the one announced — one source, so they cannot disagree. */
  readonly message: string;
  /** The undo step this notice is about; its `Undo` runs only while this is still on top. */
  readonly command: Command;
}

export interface AutoResolveOverlaps {
  /**
   * Take the "before" snapshot for a planner's structural command. Call it BEFORE the command's
   * write: a snapshot taken after would already contain the overlap the edit created, and the rule
   * would read it as one that existed before and leave it alone.
   *
   * A burst of commands before the schedule settles keeps the FIRST snapshot and unions the
   * subjects, because the resolution runs once, against the picture the planner started from.
   */
  begin: (subjects: Iterable<string>) => void;
  /** Add ids that only exist once a write returns — a create's new activity (spec §4.4). */
  addSubjects: (ids: Iterable<string>) => void;
  /**
   * Resolve now rather than on the next settle. For commands that change lanes and nothing else,
   * which trigger no recalculation and so will never settle — a bulk lane move.
   */
  resolveNow: () => void;
  /**
   * An undo or redo is about to run. Any pending snapshot is dropped: a replay restores a recorded
   * state, and resolving against it would move a bar the planner has just asked to have back.
   */
  noteReplay: () => void;
  notice: LayoutResolvedNotice | null;
  dismissNotice: () => void;
}

const RETRY_MS = 250;
const MAX_RETRIES = 40;

interface Pending {
  readonly s0: LayoutSnapshots;
  readonly subjects: Set<string>;
}

/**
 * `requestIdleCallback` where the browser has it, a macrotask where it does not (jsdom, Safari).
 *
 * FC-N5b measured the resolution of a 50-bar cascade at `scale-2000` at 8.8 ms p95 against a 2 ms
 * bar, so by the condition's own consequence it runs off the render path
 * (`docs/specs/netpoint-layout/m3-auto-resolve.md`). The timeout is a ceiling, not a delay: a
 * browser that never goes idle still resolves within a second.
 */
function whenIdle(run: () => void): void {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: object) => number })
    .requestIdleCallback;
  if (typeof ric === 'function') ric(run, { timeout: 1000 });
  else setTimeout(run, 0);
}

const activities = (count: number): string =>
  count === 1 ? '1 activity' : `${String(count)} activities`;

/**
 * The dock's sentence, which also names **which picture moved** once the plan has two (swimlanes
 * M2-T5): a bar can be cleared in the swimlane view, in the picture the planner would see with
 * swimlanes off, or in both, and "lane 3" means a different lane in each. With no swimlane picture
 * the sentences are exactly the ones this had before swimlanes, and a swimlane lane is never named
 * as a bare "lane" — it is a lane of a named swimlane.
 */
function sentenceFor(
  moves: { plain: readonly LaneResolution[]; swimlane: readonly SwimlaneResolution[] },
  names: { activity: (id: string) => string; swimlane: (id: string | null) => string },
  hasSwimlanePicture: boolean,
): string {
  const { plain, swimlane } = moves;
  if (!hasSwimlanePicture) {
    if (plain.length === 1) {
      const [move] = plain as [LaneResolution];
      return `Moved “${names.activity(move.id)}” to lane ${move.to + 1} so it no longer overlaps another activity.`;
    }
    return `Moved ${plain.length} activities to free lanes so no two activities overlap.`;
  }
  if (plain.length > 0 && swimlane.length > 0) {
    return `Moved ${activities(swimlane.length)} in the swimlane view and ${String(plain.length)} with swimlanes off so no two activities overlap.`;
  }
  if (swimlane.length === 1) {
    const [move] = swimlane as [SwimlaneResolution];
    return `Moved “${names.activity(move.id)}” to lane ${move.to + 1} of “${names.swimlane(move.swimlaneId)}” in the swimlane view so it no longer overlaps another activity.`;
  }
  if (swimlane.length > 1) {
    return `Moved ${swimlane.length} activities to free lanes in the swimlane view so no two activities overlap.`;
  }
  if (plain.length === 1) {
    const [move] = plain as [LaneResolution];
    return `Moved “${names.activity(move.id)}” to lane ${move.to + 1} of the diagram with swimlanes off so it no longer overlaps another activity.`;
  }
  return `Moved ${plain.length} activities to free lanes with swimlanes off so no two activities overlap.`;
}

/**
 * **An edit moves only the bar that caused it** — the workspace half of NetPoint-layout M3
 * (spec §4.2, ADR-0153). `resolveNewOverlaps` decides; this hook decides WHEN, and writes.
 *
 * When: once the recalculation the edit triggered has **settled** (`usePlanAutoRecalc.settled`),
 * because the overlap the product owner reported is usually one the engine made — a successor
 * pushed into a neighbour — and it does not exist until the new dates do.
 *
 * Writes go through the batch positions endpoint for any number of movers, recorded as their OWN
 * undo step (CQ-2): the first `Ctrl+Z` puts the bar back in the overlapping lane, the second undoes
 * the edit. That is the `autoArrangeCommand` shape rather than `relaneCommand`, a recorded departure
 * from the plan: `relaneCommand` coalesces on `relane:{id}`, so a planner nudging the moved bar
 * within 500 ms would fold their edit into this one and one `Ctrl+Z` would undo both.
 *
 * Nothing happens without the pen (`enabled`), on a replay, or while another write is in flight —
 * that last because the dates in the cache would describe a plan with half an edit in it; the
 * snapshot is kept and the next settle resolves it.
 */
export function useAutoResolveOverlaps(params: {
  enabled: boolean;
  settled: number;
  /** Edits the recalculation still owes (`usePlanAutoRecalc.pendingEdits`). */
  pendingEdits: number;
  readActivities: () => readonly ActivitySummary[] | undefined;
  /** Whether any write is in flight — ANY, including the pen's heartbeat, hence the retry below. */
  isWriting: () => boolean;
  batchPositions: BatchPositionsFn;
  /**
   * The neutral swimlane input built from the cache, or `null` when the plan has no readable
   * swimlanes (source `NONE`, a WBS source before M3, or a list not loaded). With one, both
   * layouts are resolved and written in one batch.
   */
  readSwimlaneInput: () => SwimlaneInput | null;
  /** The positions write that takes swimlane rows too (`useWriteSwimlaneLanes`). */
  writeLayouts: (input: {
    positions: (SwimlaneLaneRow | PlainLaneRow)[];
  }) => Promise<ActivitySummary[]>;
  history: PlanEditHistory;
  announce: (message: string) => void;
  onWriteRejected: (err: unknown) => void;
}): AutoResolveOverlaps {
  const pendingRef = useRef<Pending | null>(null);
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  });
  const [notice, setNotice] = useState<LayoutResolvedNotice | null>(null);

  const begin = useCallback((subjects: Iterable<string>): void => {
    const { enabled, readActivities, readSwimlaneInput } = paramsRef.current;
    if (!enabled) return;
    const pending = pendingRef.current;
    if (pending !== null) {
      for (const id of subjects) pending.subjects.add(id);
      return;
    }
    pendingRef.current = {
      s0: layoutSnapshotsOf(readActivities() ?? [], readSwimlaneInput()),
      subjects: new Set(subjects),
    };
  }, []);

  const addSubjects = useCallback((ids: Iterable<string>): void => {
    const pending = pendingRef.current;
    if (pending === null) return;
    for (const id of ids) pending.subjects.add(id);
  }, []);

  const noteReplay = useCallback((): void => {
    pendingRef.current = null;
  }, []);

  const resolve = useCallback(async (): Promise<void> => {
    const pending = pendingRef.current;
    if (pending === null) return;
    const { enabled, pendingEdits, batchPositions, history, announce, onWriteRejected } =
      paramsRef.current;
    if (!enabled) {
      // The pen went between the edit and the settle: no write, and the overlap cue plus the
      // Arrange offer are what tell the planner (spec §3, "Pen lost between edit and settle").
      pendingRef.current = null;
      return;
    }
    // An edit the recalculation has not computed yet: its settle is coming, and resolves this.
    if (pendingEdits > 0) return;
    // A write that has not reached the coalescer yet — the planner's next edit, whose settle will
    // come — or one that never will, like the pen's heartbeat. Waiting for a settle would wait for
    // ever in the second case, so look again shortly, and give up after ten seconds rather than
    // resolve against a cache that may hold half an edit.
    //
    // Every read after the first wait goes back through `paramsRef`: the callbacks this started
    // with belong to the render that scheduled it, and a stale `isWriting` would never see the write
    // finish (the unit suite's "waits out a write" case, which failed first against exactly that).
    for (let tries = 0; paramsRef.current.isWriting(); tries += 1) {
      if (tries >= MAX_RETRIES || pendingRef.current !== pending) {
        if (pendingRef.current === pending) pendingRef.current = null;
        return;
      }
      await new Promise((done) => setTimeout(done, RETRY_MS));
    }
    // A settle may have arrived while this waited; if an edit is owed again, that settle resolves.
    if (paramsRef.current.pendingEdits > 0 || pendingRef.current !== pending) return;
    const rows = paramsRef.current.readActivities();
    if (rows === undefined) return;
    pendingRef.current = null;
    const after = layoutSnapshotsOf(rows, paramsRef.current.readSwimlaneInput());
    const moves = resolveBothLayouts(pending.s0, after, pending.subjects);
    if (moves.plain.length === 0 && moves.swimlane.length === 0) return;
    const byId = new Map(rows.map((a) => [a.id, a]));
    const plainPositions = moves.plain.flatMap((m) => {
      const row = byId.get(m.id);
      return row === undefined ? [] : [{ id: m.id, laneIndex: m.to, version: row.version }];
    });
    const swimlaneFor = new Map(moves.swimlane.map((m) => [m.id, m]));
    const plainTo = new Map(moves.plain.map((m) => [m.id, m.to]));
    // **One batch for both pictures.** A bar moved in both is one row carrying both lanes; each
    // field is the picture's own and neither is ever derived from the other (SC-1).
    const mixed: (SwimlaneLaneRow | PlainLaneRow)[] = [];
    for (const id of new Set([...plainTo.keys(), ...swimlaneFor.keys()])) {
      const row = byId.get(id);
      if (row === undefined) continue;
      const lane = swimlaneFor.get(id);
      const flat = plainTo.get(id);
      if (lane !== undefined) {
        mixed.push({
          id,
          version: row.version,
          swimlane: { laneIndex: lane.to },
          ...(flat === undefined ? {} : { laneIndex: flat }),
        });
      } else if (flat !== undefined) {
        mixed.push({ id, version: row.version, laneIndex: flat });
      }
    }
    if (mixed.length === 0) return;
    let saved: ActivitySummary[];
    try {
      saved =
        moves.swimlane.length === 0
          ? await batchPositions({ positions: plainPositions })
          : await paramsRef.current.writeLayouts({ positions: mixed });
    } catch (err) {
      // A 423 runs the shared pen contract; anything else (a 409 from a concurrent edit) leaves the
      // overlap drawn with its cue, and the Arrange offer is how the planner clears it. Never a
      // retry: the versions it would carry are the ones that were just refused.
      onWriteRejected(err);
      announce('An overlap could not be cleared automatically. Arrange can clear it.');
      return;
    }
    const swimlaneNames = new Map(
      (paramsRef.current.readSwimlaneInput()?.swimlanes ?? []).map((s) => [s.id, s.name]),
    );
    const message = sentenceFor(
      moves,
      {
        activity: (id) => byId.get(id)?.name ?? 'Activity',
        swimlane: (id) => (id === null ? 'No swimlane' : (swimlaneNames.get(id) ?? 'No swimlane')),
      },
      pending.s0.swimlane !== null && after.swimlane !== null,
    );
    const plainStep =
      moves.plain.length === 0
        ? null
        : autoArrangeCommand({
            batchPositions,
            before: moves.plain.map((m) => ({ id: m.id, laneIndex: m.from })),
            after: moves.plain.map((m) => ({ id: m.id, laneIndex: m.to })),
            saved,
            label:
              moves.plain.length === 1
                ? 'Move activity clear of an overlap'
                : `Move ${moves.plain.length} activities clear of overlaps`,
          });
    const total = new Set([...plainTo.keys(), ...swimlaneFor.keys()]).size;
    const label =
      total === 1
        ? 'Move activity clear of an overlap'
        : `Move ${total} activities clear of overlaps`;
    // Composed only when the swimlane picture moved: that step coalesces by its set of bars, and a
    // planner nudging the moved bar within 500 ms must not fold their edit into this one (CQ-2) —
    // composing is what drops the coalescing. A plain-only resolution is `autoArrangeCommand` as it
    // was before swimlanes, which never coalesces.
    const command: CheckableCommand | null =
      moves.swimlane.length === 0
        ? plainStep
        : composeSteps({
            label,
            steps: [
              ...(plainStep === null ? [] : [plainStep]),
              swimlaneLanesCommand({
                writeLanes: paramsRef.current.writeLayouts,
                before: moves.swimlane.map((m) => ({
                  id: m.id,
                  swimlaneId: m.swimlaneId,
                  lane: m.from,
                })),
                after: moves.swimlane.map((m) => ({
                  id: m.id,
                  swimlaneId: m.swimlaneId,
                  lane: m.to,
                })),
                saved,
              }),
            ],
          });
    if (command === null) return;
    history.record(command);
    announce(message);
    setNotice({ message, command });
  }, []);

  const lastSettled = useRef(params.settled);
  useEffect(() => {
    if (params.settled === lastSettled.current) return;
    lastSettled.current = params.settled;
    whenIdle(() => void resolve());
  }, [params.settled, resolve]);

  const resolveNow = useCallback((): void => {
    whenIdle(() => void resolve());
  }, [resolve]);

  // The notice's Undo is bound to ONE step. Once anything else is on top — a later edit, or this
  // step undone — the notice goes, rather than offering to undo something its sentence does not
  // describe (the ADR-0064 §7 defect). Derived on render rather than cleared in an effect: the
  // history object's identity changes whenever its top does, which is what re-runs this.
  const { history } = params;
  const current = notice !== null && history.isTop(notice.command) ? notice : null;

  const dismissNotice = useCallback(() => setNotice(null), []);

  return useMemo(
    () => ({ begin, addSubjects, resolveNow, noteReplay, notice: current, dismissNotice }),
    [begin, addSubjects, resolveNow, noteReplay, current, dismissNotice],
  );
}
