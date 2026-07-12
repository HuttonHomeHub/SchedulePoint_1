import type { ActivitySummary, DependencySummary } from '@repo/types';

import type { RenderActivity, RenderEdge } from './render-model';

import { activeConstraintAnchor } from '@/lib/constraint-format';

/**
 * The seam that maps the API shapes (`ActivitySummary` / `DependencySummary`) to the
 * render model's minimal shapes (ADR-0026). Pure and dependency-free so the mapping —
 * including the constraint anchor (only when the type AND date are both present, mirroring
 * the engine's paired rule) — is unit-testable without the canvas/React.
 */
export function toRenderActivities(activities: readonly ActivitySummary[]): RenderActivity[] {
  return activities.map((a) => ({
    id: a.id,
    type: a.type,
    laneIndex: a.laneIndex,
    earlyStart: a.earlyStart,
    earlyFinish: a.earlyFinish,
    isCritical: a.isCritical,
    isNearCritical: a.isNearCritical,
    constraint: activeConstraintAnchor(a),
  }));
}

export function toRenderEdges(dependencies: readonly DependencySummary[]): RenderEdge[] {
  return dependencies.map((d) => ({
    predecessorId: d.predecessor.id,
    successorId: d.successor.id,
    type: d.type,
    isDriving: d.isDriving,
  }));
}
