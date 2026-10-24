import type { SwimlaneSource } from '@prisma/client';
import type { ActivitySwimlaneLaneSummary } from '@repo/types';

/** The guest's swimlane list entry: a name to label the band and an id to match members against. */
export interface GuestSwimlaneEntry {
  id: string;
  name: string;
}

/** Where one activity sits in the guest's swimlane picture. */
export interface GuestSwimlanePlacement {
  /** A swimlane in the plan's live list, or `null` for "No swimlane". Never a deleted swimlane. */
  memberOfSwimlaneId: string | null;
  /** The in-swimlane lane stored against that membership, or `null` when never placed there. */
  swimlaneLaneIndex: number | null;
}

/** The placement of an activity in a plan that draws no swimlanes. */
export const NO_GUEST_SWIMLANE: GuestSwimlanePlacement = {
  memberOfSwimlaneId: null,
  swimlaneLaneIndex: null,
};

/**
 * **The swimlanes a guest is shown** (ADR-0051 §4 as amended for swimlanes, SQ-4): the plan's live,
 * hand-made swimlanes in display order, and only while the plan's source is `MANUAL`. A `NONE` plan
 * has none, and a `WBS` plan's swimlanes are the summaries at a level, which no client draws yet
 * (swimlanes M3) — so the guest, like a member, sees such a plan without swimlanes rather than a
 * picture derived somewhere nobody else derives it.
 *
 * Takes the rows already in `ORDER BY position, id`.
 */
export function guestSwimlaneList(
  source: SwimlaneSource,
  live: readonly { id: string; name: string }[],
): GuestSwimlaneEntry[] {
  return source === 'MANUAL' ? live.map(({ id, name }) => ({ id, name })) : [];
}

/**
 * **One activity's derived membership and lane**, by the rule the member screen draws by
 * (`manualSwimlaneInput` in `apps/web/src/features/swimlanes/model/manual-membership.ts`): an
 * activity in a swimlane that is in the live list reads its `SWIMLANE` row for that swimlane;
 * everything else — no swimlane, or an id naming a swimlane since deleted — is "No swimlane" and
 * reads its `NO_SWIMLANE` row. The raw `swimlaneId` is never returned: it may name a deleted
 * swimlane, and it is kept while the plan's source is not `MANUAL`.
 *
 * `known` is the live list's ids; an empty list (`NONE`, `WBS`, or no swimlanes) places nothing.
 */
export function guestSwimlanePlacement(
  known: ReadonlySet<string>,
  activity: { swimlaneId: string | null },
  lanes: readonly ActivitySwimlaneLaneSummary[],
): GuestSwimlanePlacement {
  if (known.size === 0) return NO_GUEST_SWIMLANE;
  const swimlaneId =
    activity.swimlaneId !== null && known.has(activity.swimlaneId) ? activity.swimlaneId : null;
  const row = lanes.find((lane) =>
    swimlaneId === null
      ? lane.basis === 'NO_SWIMLANE'
      : lane.basis === 'SWIMLANE' && lane.swimlaneId === swimlaneId,
  );
  return { memberOfSwimlaneId: swimlaneId, swimlaneLaneIndex: row?.laneIndex ?? null };
}
