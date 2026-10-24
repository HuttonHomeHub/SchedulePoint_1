import type { ActivitySummary } from '@repo/types';

import type { SwimlaneInput, SwimlaneProjection } from '../render/project-swimlanes';
import { NO_SWIMLANE_LABEL } from '../render/project-swimlanes';

import { swimlanePlace } from './reposition-announcement';

/**
 * **The parallel listbox, grouped by swimlane** (swimlanes M2-T10, ui-architecture C9).
 *
 * A suffix on every row would *describe* the structure; ADR-0122's rule is that a structure must be
 * *reachable*, so with swimlanes drawn each swimlane is a `role="group"` named by the swimlane, in
 * swimlane order, with "No swimlane" last, and plan order is kept inside each group.
 *
 * **The count invariant (ADR-0063 §4) holds by construction:** every activity is in exactly one
 * group, so the options are the same activities that the flat list carries, including ones the WBS
 * band draws or that have no drawn start. Membership is the swimlane input's, the one the projection
 * itself uses, so a member of a deleted swimlane (its id kept for a restore) lands under none exactly
 * where the diagram draws it.
 */
export interface ListboxGroup {
  readonly key: string;
  /** The swimlane's name, or "No swimlane". `null` for the one ungrouped list. */
  readonly label: string | null;
  readonly rows: readonly ActivitySummary[];
}

/**
 * With no swimlane input there is one group with no label, whose `rows` **is** `activities`, so the
 * caller renders the flat list it always did and keyboard order is plan order (SC-3).
 */
export function groupListboxRows(
  activities: readonly ActivitySummary[],
  input: SwimlaneInput | null,
): readonly ListboxGroup[] {
  if (input === null) return [{ key: 'all', label: null, rows: activities }];
  const known = new Set(input.swimlanes.map((s) => s.id));
  const byGroup = new Map<string | null, ActivitySummary[]>();
  for (const a of activities) {
    const member = input.membership.get(a.id) ?? null;
    const key = member !== null && known.has(member) ? member : null;
    const held = byGroup.get(key);
    if (held) held.push(a);
    else byGroup.set(key, [a]);
  }
  const groups: ListboxGroup[] = input.swimlanes.map((s) => ({
    key: s.id,
    label: s.name,
    rows: byGroup.get(s.id) ?? [],
  }));
  const none = byGroup.get(null);
  if (none) groups.push({ key: 'none', label: NO_SWIMLANE_LABEL, rows: none });
  return groups;
}

/** The order the keyboard walks and the DOM renders: every group's rows, group after group. */
export function listboxOrder(groups: readonly ListboxGroup[]): readonly ActivitySummary[] {
  const [only] = groups;
  return groups.length === 1 && only?.label === null ? only.rows : groups.flatMap((g) => g.rows);
}

/**
 * Each drawn bar's "in Mechanical, lane 2 of 3" (C9), from the projection. A bar the scene does not
 * draw has no entry, and its sentence carries no lane clause at all.
 */
export function swimlaneLaneClauses(scene: SwimlaneProjection): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, display] of scene.displayLanes) {
    const extent = scene.extents.find(
      (e) => display >= e.firstLane && display < e.firstLane + e.laneCount,
    );
    if (extent === undefined) continue;
    out.set(
      id,
      `in ${swimlanePlace({
        swimlane: extent.name ?? NO_SWIMLANE_LABEL,
        lane: display - extent.firstLane,
        count: extent.laneCount,
        changedSwimlane: false,
        displayLane: display,
        how: 'asked',
      })}`,
    );
  }
  return out;
}
