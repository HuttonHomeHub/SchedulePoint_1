import type { ActivitySummary, SwimlaneSummary } from '@repo/types';

import type { SwimlaneInput } from '@/features/tsld';

/**
 * The neutral {@link SwimlaneInput} for a plan whose swimlanes are **hand-made** (source `MANUAL`):
 * membership is each activity's own `swimlaneId`, and the stored lane is the row written against
 * that membership's basis.
 *
 * **Which stored row is "the current basis".** An activity in a swimlane that is in the list reads
 * its `SWIMLANE` row for that swimlane. Everything else — no swimlane, or a `swimlaneId` that names
 * a swimlane no longer in the list (soft-deleted: that id is kept so a restore brings the member
 * back, `ActivitySummary.swimlaneId`) — is shown under "No swimlane" and reads its `NO_SWIMLANE`
 * row. The projection reads an unknown id as "No swimlane" on its own; this has to agree, or a
 * member of a deleted swimlane would be placed by a lane stored against a basis it is not on.
 *
 * `membership` is passed through as stored, unfiltered, for the same reason: the projection owns
 * the "unknown id" rule and a second copy of it here could only drift from it.
 *
 * `swimlanes` is taken in the order the API returned it (`ORDER BY position, id`), which is the
 * display order.
 */
export function manualSwimlaneInput(
  activities: readonly ActivitySummary[],
  swimlanes: readonly SwimlaneSummary[],
): SwimlaneInput {
  const known = new Set(swimlanes.map((s) => s.id));
  const membership = new Map<string, string | null>();
  const storedLanes = new Map<string, { lane: number; updatedAt: number }>();

  for (const a of activities) {
    membership.set(a.id, a.swimlaneId);
    const swimlaneId = a.swimlaneId !== null && known.has(a.swimlaneId) ? a.swimlaneId : null;
    const row = a.swimlaneLanes.find((l) =>
      swimlaneId === null
        ? l.basis === 'NO_SWIMLANE'
        : l.basis === 'SWIMLANE' && l.swimlaneId === swimlaneId,
    );
    if (row) storedLanes.set(a.id, { lane: row.laneIndex, updatedAt: Date.parse(row.updatedAt) });
  }

  return {
    swimlanes: swimlanes.map((s) => ({ id: s.id, name: s.name })),
    membership,
    storedLanes,
  };
}
