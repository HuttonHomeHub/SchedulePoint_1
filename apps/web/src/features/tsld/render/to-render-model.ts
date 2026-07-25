import type { ActivitySummary, DependencySummary, SchedulingMode } from '@repo/types';

import { activityBarLabel } from './a11y';
import { laneOverlapIds } from './lane-overlap';
import type { RenderActivity, RenderEdge } from './render-model';

import { activeConstraintAnchor } from '@/lib/constraint-format';

/**
 * Which persisted dates feed each bar's geometry (ADR-0033). `early` is classic CPM (the earliest
 * dates) and the default; `visual` reads the engine's effective-Visual dates (VISUAL mode); `late`
 * reads the late dates (the read-only Late-Start overlay, M4).
 */
export type BarDateSource = 'early' | 'visual' | 'late';

/**
 * Pick the bar-date source for the active view (ADR-0033): the read-only **Late overlay** wins for
 * display when on (M4), else the plan's **scheduling mode** decides (`VISUAL` → the effective-Visual
 * dates, `EARLY` → the earliest). Callers gate on `VITE_SCHEDULING_MODES`; flag-off the mode is
 * always `EARLY` and the overlay is never on, so this yields `early` (today's behaviour).
 */
export function barDateSourceFor(mode: SchedulingMode, lateOverlay: boolean): BarDateSource {
  if (lateOverlay) return 'late';
  return mode === 'VISUAL' ? 'visual' : 'early';
}

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
  const bars = activities.map((a) => ({
    activity: a,
    start:
      source === 'visual' ? a.visualEffectiveStart : source === 'late' ? a.lateStart : a.earlyStart,
    finish:
      source === 'visual'
        ? a.visualEffectiveFinish
        : source === 'late'
          ? a.lateFinish
          : a.earlyFinish,
  }));
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
    visualDriftDays: source === 'visual' ? a.visualDriftDays : null,
    laneOverlap: overlapping.has(a.id),
    constraint: activeConstraintAnchor(a),
    label: activityBarLabel(a),
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
