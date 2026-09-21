import type { ActivitySummary, DependencySummary } from '@repo/types';

import { activityBarLabel } from './a11y';
import { laneOverlapIds } from './lane-overlap';
import type { RenderActivity, RenderEdge } from './render-model';

import { barDatesFor, type BarDateSource } from '@/lib/bar-dates';
import { activeConstraintAnchor } from '@/lib/constraint-format';

/**
 * Which persisted dates feed each bar's geometry (ADR-0033). `early` is classic CPM (the earliest
 * dates) and the default; `visual` reads the engine's effective-Visual dates (VISUAL mode); `late`
 * reads the late dates (the read-only Late-Start overlay, M4).
 */

export type { BarDateSource } from '@/lib/bar-dates';
export { barDateSourceFor } from '@/lib/bar-dates';

/**
 * Pick the bar-date source for the active view (ADR-0033): the read-only **Late overlay** wins for
 * display when on (M4), else the plan's **scheduling mode** decides (`VISUAL` → the effective-Visual
 * dates, `EARLY` → the earliest). Callers gate on `VITE_SCHEDULING_MODES`; flag-off the mode is
 * always `EARLY` and the overlay is never on, so this yields `early` (today's behaviour).
 */

/**
 * The seam that maps the API shapes (`ActivitySummary` / `DependencySummary`) to the
 * render model's minimal shapes (ADR-0026). Pure and dependency-free so the mapping —
 * including the constraint anchor (only when the type AND date are both present, mirroring
 * the engine's paired rule) — is unit-testable without the canvas/React.
 *
 * `source` selects which engine-computed dates draw the bar (ADR-0033). There is **no client-side
 * seeding** (CQ-9): an unplaced activity in VISUAL mode already carries an effective-earliest from
 * the engine's second pass, so the successor push is server-computed and simply read here.
 */
export function toRenderActivities(
  activities: readonly ActivitySummary[],
  source: BarDateSource = 'early',
): RenderActivity[] {
  // Resolve each bar's drawn span once (source-dependent), then reuse it for both the overlap pass
  // and the final render shape — one map over `activities`, no positional re-indexing.
  const bars = activities.map((a) => ({ activity: a, ...barDatesFor(a, source) }));
  // A manual lane drop can leave two bars overlapping in time in one lane (TECH_DEBT #24c) — flag
  // both, computed on the same dates the bars draw at so the cue matches the picture in every mode.
  const overlapping = laneOverlapIds(
    bars.map((b) => ({
      id: b.activity.id,
      laneIndex: b.activity.laneIndex,
      start: b.start,
      finish: b.finish,
    })),
  );

  return bars.map(({ activity: a, start, finish }) => ({
    id: a.id,
    type: a.type,
    laneIndex: a.laneIndex,
    earlyStart: start,
    earlyFinish: finish,
    isCritical: a.isCritical,
    isNearCritical: a.isNearCritical,
    // The conflict cue + drift are meaningful only in VISUAL mode — the engine computes them for
    // every plan, so gate them to the visual source here (EARLY/late bars never show the cue).
    visualConflict: source === 'visual' ? a.visualConflict : false,
    // The reason travels with the boolean, on the same gate — the painter needs it to decide which
    // EDGE it marks, and a render model carrying one without the other would force the painter to
    // guess (it guessed `rect.x` for both until the M-J gate pass).
    visualConflictReason: source === 'visual' ? a.visualConflictReason : null,
    visualDriftDays: source === 'visual' ? a.visualDriftDays : null,
    laneOverlap: overlapping.has(a.id),
    constraint: activeConstraintAnchor(a),
    label: activityBarLabel(a),
    // The same value the row/AT reports — the in-bar progress fill (ADR-0052 M4) draws from it,
    // so the canvas and the table can never disagree on how complete an activity is.
    percentComplete: a.percentComplete,
    // Engine-owned total float. Carried straight through — the canvas never computes float, it
    // only draws what the engine decided.
    totalFloat: a.totalFloat,
    // **The feasible window's right edge, and it is gated on the SAME basis the bar is drawn on**
    // (one-planning-surface M-E). `remainingFloat` is the room left from the PLACED finish; from
    // the EARLY finish the room is the whole `totalFloat`. So a plan switched back to Early mode
    // while still holding placements — which the product permits — would otherwise get a window
    // measured from one basis and drawn on another, short by exactly the drift.
    //
    // The two lines are deliberately parallel to the `visualDriftDays` gate above: they are the two
    // halves of one window, and M-F collapses both when the mode goes.
    remainingFloat: windowFloatFor(a, source),
  }));
}

export function toRenderEdges(dependencies: readonly DependencySummary[]): RenderEdge[] {
  return dependencies.map((d) => ({
    // Carried so the lag-anchor grab zone can name the edge it manipulates (ADR-0052 M3).
    id: d.id,
    predecessorId: d.predecessor.id,
    successorId: d.successor.id,
    type: d.type,
    isDriving: d.isDriving,
    // Carried for the time-true anchor rendering (ADR-0052); ignored by the legacy routing.
    lagDays: d.lagDays,
    lagCalendar: d.lagCalendar,
  }));
}

/**
 * The feasible window's right-edge float, for one activity on one bar basis.
 *
 * **A named rule with ONE caller, which is deliberate.** It was extracted for a second consumer —
 * the accessible clause M-E-T5 wrote — and that consumer was deleted at M-E's journey, once
 * driving the real product showed the Tier-1 sentence already carried every fact the window draws.
 * The extraction is kept rather than inlined because the rule is subtle and this repository has
 * already shipped it wrong once: `#348` was the window drawn from `remainingFloat` while the
 * projection handed the painter `totalFloat`, leaving the bracket short by the drift on every
 * placed activity. A name at the call site is what stops the next reader "simplifying" the
 * conditional back to one branch.
 *
 * Exported for its unit suite, and because a rule worth naming is worth being able to test.
 */
export function windowFloatFor(
  a: Pick<ActivitySummary, 'remainingFloat' | 'totalFloat'>,
  source: BarDateSource,
): number | null {
  return source === 'visual' ? a.remainingFloat : a.totalFloat;
}
