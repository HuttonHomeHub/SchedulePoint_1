import type { ActivitySummary } from '@repo/types';

import type { SwimlaneLaneFacts } from './reposition-announcement';
import type { SwimlaneLanePlacement } from './swimlane-lanes';

/**
 * The edit contract between the panel and its host: what a committed move carries and what the
 * write answers. They live in the model layer, not in `TsldPanel.tsx`, so the hooks that translate
 * and announce a move (`use-swimlane-editing`, the nudges) can name them without importing the
 * component that imports them — a type cycle the panel re-exports away.
 */

/**
 * A committed reposition — a free-2D move (M4). `startDay` (present iff the day changed) maps to a
 * hand-placed `visualStart` + recalc; `laneIndex` (present iff the lane changed) is layout only (no
 * recalc).

 * **It wrote an `SNET` constraint until the collapse** (one-planning-surface M-F-T3), and this
 * block still said so at the M-J gate pass. A drop is a placement, not a commitment somebody
 * recorded, and the difference is what the whole epic is about — so a docblock describing the
 * drop as a constraint is the most misleading sentence a reader of this file could meet. The route issues the minimal PATCH for whichever axes are present. **At least one axis
 * is always present** — the gesture machine emits a `reposition` only when a whole cell changed,
 * and the route treats the all-absent case as a no-op — though the type can't enforce that.
 */
export interface TsldRepositionInput {
  activityId: string;
  startDay?: number;
  /**
   * The new lane in the swimlane-free layout. **Never present while swimlanes are shown** (SC-1):
   * a move then carries {@link swimlaneLanes} instead, because a display lane is derived and
   * writing one into `laneIndex` would make turning swimlanes off lose the planner's arrangement.
   */
  laneIndex?: number;
  /**
   * The lane write for a move made on the swimlane layout: the bar's lane inside its (possibly new)
   * swimlane, and the swimlane's unplaced members at their drawn lanes (swimlanes M2-T4).
   */
  swimlaneLanes?: readonly SwimlaneLanePlacement[];
}

/**
 * The shared outcome of an optimistic edit (reposition or link). It **resolves** for both
 * success and a domain conflict (stale `version`, a cycle, a duplicate — ADR-0021/0022); a
 * genuine failure rejects. `applied` says whether the write actually landed — false when it was
 * refused (nothing changed), true when it landed (even if the follow-up recalc then failed) — so
 * the success status is announced only when it's true. `conflict` is the banner message.
 */
export interface TsldEditOutcome {
  applied: boolean;
  conflict: string | null;
  /** False when the conflict is a rule rather than stale data, so the banner offers no Refresh. */
  refreshable?: boolean;
  /** With swimlanes shown: where the bar landed, so the announcement can speak the C9 form. */
  swimlane?: SwimlaneLaneFacts;
  /**
   * The lane the bar actually landed in, when that is not the lane the gesture asked for — a drop
   * onto an occupied lane goes on to the next free one (NetPoint-layout M3, `resolveLaneDrop`).
   * Absent means "where you asked". The announcements read this rather than the request, or they
   * would name a lane the bar is not in.
   */
  laneIndex?: number;
}

export type TsldRepositionOutcome = TsldEditOutcome;

/**
 * What a host must be able to do for the bulk selection bar to appear
 * (`docs/specs/canvas-multi-select/` M4).
 *
 * Every field is required. An optional operation would let a host wire two of three and ship a bar
 * with a button that silently does nothing — the exact shape the epic's own enablement passes keep
 * finding, so the type refuses to express it.
 */
export interface TsldBulkOperations {
  /** May the caller write to this plan at all (role + pen), and — when not — why. */
  gate: { writable: boolean; reason: string | null };
  /** Delete the given activities as ONE batch; resolves when the write and its command have landed. */
  deleteMany: (activities: readonly ActivitySummary[]) => Promise<void>;
  /** Create the chain, in the given order. Rejects with a message; a failure leaves ZERO edges. */
  linkChain: (edges: readonly { predecessorId: string; successorId: string }[]) => Promise<void>;
  /**
   * Move every selected activity by one day/lane delta, as ONE batch and ONE undoable step
   * (`docs/TECH_DEBT.md` #108).
   *
   * On this contract rather than inside the panel because the host owns the mutation and the
   * ADR-0048 command stack — the same reason `deleteMany` and `linkChain` are here. ADR-0080 built
   * every piece below it (`movedPlacement`, `bulkMoveSnapshots`, `bulkPlacementCommand`,
   * `useBatchPlacements`, `PATCH …/activities/placements` with its API e2e) and left **nothing
   * calling them**: the gesture kept moving one bar. This is the call that was missing.
   */
  moveMany: (
    rows: readonly ActivitySummary[],
    delta: { dayDelta: number; laneDelta: number },
    /**
     * `coalesce` folds moves of the same set into one undo step when their keypresses were within
     * the history's window; `pressedAt` (epoch ms) is when the last of them happened (the keyboard).
     */
    options?: {
      coalesce?: boolean;
      pressedAt?: number;
      /**
       * Set instead of a lane delta while swimlanes are shown (the delta is then `0`): each bar's lane
       * inside its own swimlane, written through the positions endpoint (swimlanes M2-T4).
       */
      swimlaneLanes?: readonly SwimlaneLanePlacement[];
      /** The undo step's name, when the move is not a plain "Move N activities" (an assignment). */
      label?: string;
    },
  ) => Promise<{
    /** False when nothing was written (a pen rejection, a stale version, a no-op). */
    applied: boolean;
    conflict: string | null;
    /** False when the conflict is a rule (the batch cap) rather than stale data, so the banner
     * offers no Refresh. Absent means refreshable, like every other conflict. */
    refreshable?: boolean;
    /**
     * With swimlanes shown: how many of the selection actually changed lane (some may have found
     * none free and stayed), and which way. The sentence says this, never the delta that was asked.
     */
    swimlaneMoved?: { moved: number; total: number; direction: 'up' | 'down' };
  }>;
}
