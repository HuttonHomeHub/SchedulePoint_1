import type { ActivitySummary, DependencySummary } from '@repo/types';

import { computeLaneArrangement } from '../src/features/tsld/model/arrange-lanes';
import type { RenderActivity, RenderEdge } from '../src/features/tsld/render/render-model';
import { toRenderActivities, toRenderEdges } from '../src/features/tsld/render/to-render-model';
import { barDateSourceFor } from '../src/lib/bar-dates';

/**
 * **The canvas's own mapping, applied to what the REST API returned** (spec
 * `docs/specs/relayout-quality` §4.2). The benchmark's scenes are not built by a copy of the mapper:
 * `toRenderActivities` / `toRenderEdges` / `computeLaneArrangement` are the functions `TsldPanel`
 * calls, with the arguments `TsldPanel` passes (`barDateSourceFor(false)` = `'visual'`, the plan's
 * `plannedStart` as the data date, the WBS band off as on a fresh load). A scene built from the
 * in-process seed mapper would draw different spans (`measure-finish-milestone.mts:12-16`).
 *
 * Node-side, no DOM: bundled with esbuild by `measure-relayout.mjs` and run once per capture.
 */
export interface RawPlan {
  seedName: string;
  planName: string;
  /** The plan's `plannedStart`, which is the diagram's data date (`plan-workspace-toolbar.tsx`). */
  dataDate: string | null;
  /** The plan's working-day calendar, as `use-plan-workspace-model.ts` resolves it. */
  calendar: { workingWeekdays: number; exceptions: [string, boolean][] } | null;
  activities: ActivitySummary[];
  dependencies: DependencySummary[];
}

export interface CorpusPlan {
  seedName: string;
  planName: string;
  dataDate: string;
  calendar: RawPlan['calendar'];
  /** The scene as the canvas draws it; `laneIndex` is the layout as seeded (the "hand" layout). */
  activities: RenderActivity[];
  edges: RenderEdge[];
  /** The dialog's Re-layout seed: `arrangeSummary.changes` (rows `packLanes` moves). */
  packChanges: { id: string; laneIndex: number }[];
  /** Activities with a drawn start: what `drawnCount` counts, and what the 300 limit is on. */
  drawn: number;
}

export function buildCorpusPlan(raw: RawPlan): CorpusPlan | null {
  // A plan with no data date has no x axis; the product moves nothing on it either.
  if (raw.dataDate === null) return null;
  const source = barDateSourceFor(false);
  const activities = toRenderActivities(raw.activities, source);
  const edges = toRenderEdges(raw.dependencies);
  const packChanges = computeLaneArrangement({
    activities: raw.activities,
    sceneActivities: raw.activities,
    dependencies: raw.dependencies,
    dataDate: raw.dataDate,
  });
  return {
    seedName: raw.seedName,
    planName: raw.planName,
    dataDate: raw.dataDate,
    calendar: raw.calendar,
    activities,
    edges,
    packChanges,
    drawn: activities.filter((a) => a.drawnStart !== null).length,
  };
}
