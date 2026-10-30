import type { ActivitySummary } from '@repo/types';

import type { SwimlaneProjection, SwimlaneInput } from '../render/project-swimlanes';

import { drawnDaySpan } from './drawn-span';
import type { DaySpan, SwimlaneEditContext } from './swimlane-lanes';

import type { BarDateSource } from '@/lib/bar-dates';

/**
 * What every swimlane write is planned against: the projection the diagram draws, the drawn span of
 * each bar in it, and the lane each bar remembers against each swimlane (swimlanes M2-T4, M2-T10).
 *
 * One builder for the panel's gestures and for **Move to swimlane…**, which is offered from places
 * that are not the panel (the activity editor): the plan they act on must be the plan the planner
 * sees, so both ask this function, over the same `deriveDiagramSource` output. `null` when swimlanes
 * are not being drawn or there is no data date to measure spans from.
 */
export function swimlaneEditContext(args: {
  scene: SwimlaneProjection | null;
  input: SwimlaneInput | null;
  /** The activities the scene was projected over (the band's summaries are already out of it). */
  sceneActivities: readonly ActivitySummary[];
  /** Every activity in the plan, as stored: remembered lanes are read from these rows. */
  activities: readonly ActivitySummary[];
  barDateSource: BarDateSource;
  dataDate: string | null;
}): SwimlaneEditContext | null {
  const { scene, input, sceneActivities, activities, barDateSource, dataDate } = args;
  if (scene === null || input === null || dataDate === null) return null;
  const spans = new Map<string, DaySpan>();
  const stored = new Map<string, number>();
  for (const a of sceneActivities) {
    stored.set(a.id, a.laneIndex);
    const span = drawnDaySpan(a, barDateSource, dataDate);
    if (span !== null) spans.set(a.id, span);
  }
  const rows = new Map(activities.map((a) => [a.id, a]));
  return {
    scene,
    input,
    spans,
    stored,
    remembered: (id, swimlaneId) => {
      const row = rows.get(id);
      // A code swimlane remembers the lane stored for (the type, that value) — the list carries the
      // activity's current basis only, so an activity moved to a value it has not held reads none.
      if (input.source === 'ACTIVITY_CODE') {
        return row?.codeSwimlaneLanes?.find(
          (l) => l.codeTypeId === input.codeTypeId && l.codeValueId === swimlaneId,
        )?.laneIndex;
      }
      return row?.swimlaneLanes.find((l) =>
        swimlaneId === null
          ? l.basis === 'NO_SWIMLANE'
          : l.basis === 'SWIMLANE' && l.swimlaneId === swimlaneId,
      )?.laneIndex;
    },
  };
}
