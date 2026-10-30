import type { ActivityCodeLaneInput, ActivitySummary } from '@repo/types';

import { WBS_IMPROVEMENTS_ENABLED } from '@/config/env';
import type { SwimlaneInput } from '@/features/tsld';
import { deriveDiagramSource } from '@/features/tsld/model/derive-diagram-source';
import { swimlaneEditContext } from '@/features/tsld/model/swimlane-edit-context';
import {
  assignToSwimlane,
  assignToSwimlanes,
  type SwimlaneAssignGroup,
  type SwimlaneLanePlacement,
  type SwimlaneMove,
} from '@/features/tsld/model/swimlane-lanes';
import type { BarDateSource } from '@/lib/bar-dates';

/** What the planner reads: the picture the diagram draws, from the same inputs the scene uses. */
export interface CodeLanePlanningInput {
  /** The code swimlane input as it stands now; `null` when the plan's swimlanes are not made from a code. */
  input: SwimlaneInput | null;
  activities: readonly ActivitySummary[] | undefined;
  barDateSource: BarDateSource;
  dataDate: string | null;
  /** The pinned WBS band's toggle, which takes summaries out of the projection. */
  wbsBandOn: boolean;
}

/** The edit context every code lane plan is made against, or `null` while the picture is not there. */
function editContextOf(args: CodeLanePlanningInput) {
  const { input, activities, barDateSource, dataDate, wbsBandOn } = args;
  if (input?.source !== 'ACTIVITY_CODE' || activities === undefined || dataDate === null) {
    return null;
  }
  // The projection the diagram draws, band toggle included, so a lane chosen "free" is free in the
  // picture on screen whether or not swimlanes are shown (the same rule Move to swimlane… follows).
  const diagram = deriveDiagramSource(activities, {
    wbsBand: { enabled: WBS_IMPROVEMENTS_ENABLED, toggleOn: wbsBandOn },
    swimlanes: input,
    source: barDateSource,
    dataDate,
  });
  return swimlaneEditContext({
    scene: diagram.swimlaneScene,
    input,
    sceneActivities: diagram.sceneActivities,
    activities,
    barDateSource,
    dataDate,
  });
}

/**
 * Lane rows for a placement list: each activity's lane in the band it will be in, with the version it
 * will be written at. A mover states the version it sends in `activities`; anything else (an unplaced
 * neighbour the write pins) takes the list's.
 */
export function laneRowsOf(
  placements: readonly SwimlanePlacementLike[],
  versions: ReadonlyMap<string, number>,
): ActivityCodeLaneInput[] {
  return placements.flatMap((p) => {
    const version = versions.get(p.id);
    return version === undefined ? [] : [{ id: p.id, version, laneIndex: p.lane }];
  });
}

type SwimlanePlacementLike = Pick<SwimlaneLanePlacement, 'id' | 'lane'>;

/**
 * **Where a codes write puts the bars it moves** (`m4-ui-design.md` §5.3): the lanes to send with a
 * Set code…, the table's Set, the editor's Save codes — and with an undo or redo of any of them —
 * while the plan's swimlanes come from a code.
 *
 * Each row's new value of the source type is its target; a row that touches no value of that type, or
 * is a WBS summary (never a member of a code swimlane), is not planned. The movers keep their drawn
 * dates and go to the nearest free lane of their new band, and the unplaced members of every band
 * touched are written at the lanes they are drawn in, so the write moves the subjects and nothing else
 * (ADR-0153). It is lenient: a bar that is not drawn has no lane to keep and a value nobody uses yet
 * has no band until this write makes one, and neither may refuse a codes write.
 *
 * `null` when there is nothing to carry.
 */
export function planCodeSwimlaneLanes(
  planning: CodeLanePlanningInput,
  rows: readonly {
    id: string;
    version: number;
    codes: readonly { codeTypeId: string; codeValueId: string | null }[];
  }[],
): { lanesCodeTypeId: string; lanes: ActivityCodeLaneInput[] } | null {
  const ctx = editContextOf(planning);
  const { activities } = planning;
  const typeId = planning.input?.codeTypeId;
  if (ctx === null || activities === undefined || typeId === undefined) return null;
  const summaries = new Set(activities.filter((a) => a.type === 'WBS_SUMMARY').map((a) => a.id));
  const groups = new Map<string | null, string[]>();
  for (const row of rows) {
    const set = row.codes.find((c) => c.codeTypeId === typeId);
    if (set === undefined || summaries.has(row.id)) continue;
    const ids = groups.get(set.codeValueId);
    if (ids === undefined) groups.set(set.codeValueId, [row.id]);
    else ids.push(row.id);
  }
  if (groups.size === 0) return null;
  const move = assignToSwimlanes(
    ctx,
    [...groups].map(([target, ids]): SwimlaneAssignGroup => ({ ids, target })),
    { lenient: true },
  );
  if (move.kind !== 'write') return null;
  const versions = new Map(activities.map((a) => [a.id, a.version]));
  for (const row of rows) versions.set(row.id, row.version);
  return { lanesCodeTypeId: typeId, lanes: laneRowsOf(move.placements, versions) };
}

/**
 * Move to swimlane…'s plan: the strict move onto a band that is on screen (or "No <type>"), with the
 * same refusals the hand-made move gives. `null` while the picture is not there.
 */
export function planCodeSwimlaneMove(
  planning: CodeLanePlanningInput,
  ids: readonly string[],
  target: string | null,
): SwimlaneMove | null {
  const ctx = editContextOf(planning);
  return ctx === null ? null : assignToSwimlane(ctx, ids, target);
}
