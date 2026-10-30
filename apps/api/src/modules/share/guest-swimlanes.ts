import type { SwimlaneSource } from '@prisma/client';
import { codeSwimlaneName, codeSwimlaneValues } from '@repo/layout';
import type { ActivityCodeLaneSummary, ActivitySwimlaneLaneSummary } from '@repo/types';

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
 * picture derived somewhere nobody else derives it. A code source is read by
 * {@link guestCodeSwimlaneList}, which the service reaches first.
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

/**
 * **The bands of a code-grouped plan, as a guest is shown them** (p6-activity-codes M4-T6): the type's
 * values in use, in value order, each as `{ id, name }` — the same rule and the same naming the member
 * screen draws by (`codeSwimlaneValues`, `codeSwimlaneName`). The value id is the band's identity so
 * members can match against it; its short code and description never travel as fields, only the one
 * name a band is labelled with, which is ADR-0205's stated residual.
 *
 * `values` are the type's live values in `ORDER BY position, id`; `carriers` the distinct
 * `(activity type, value id)` pairs the plan's live activities hold.
 */
export function guestCodeSwimlaneList(
  values: readonly { id: string; shortCode: string; description: string | null }[],
  carriers: readonly { type: string; valueId: string }[],
): GuestSwimlaneEntry[] {
  return codeSwimlaneValues(values, carriers).map((value) => ({
    id: value.id,
    name: codeSwimlaneName(value),
  }));
}

/**
 * **One activity's membership and lane under a code source**, by the member screen's rule
 * (`buildInput` in `apps/web/src/features/swimlanes/model/code-membership.ts`): a WBS summary is a
 * member of nothing; anyone else is in the band of their live value when that band is drawn, and in
 * "No <type>" (`null`) otherwise. The lane is the row stored for exactly that band, so a row kept for
 * a value the activity has left reads as never placed. Neither the activity's value id (when it is
 * not a drawn band) nor the lane row's timestamp is returned.
 */
export function guestCodePlacement(
  known: ReadonlySet<string>,
  activity: { type: string },
  valueId: string | undefined,
  lanes: readonly ActivityCodeLaneSummary[],
): GuestSwimlanePlacement {
  const memberOf =
    activity.type !== 'WBS_SUMMARY' && valueId !== undefined && known.has(valueId) ? valueId : null;
  const row = lanes.find((lane) => lane.codeValueId === memberOf);
  return { memberOfSwimlaneId: memberOf, swimlaneLaneIndex: row?.laneIndex ?? null };
}
