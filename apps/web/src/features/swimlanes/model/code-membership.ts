import { codeBasisOf, codeSwimlaneName, codeSwimlaneValues } from '@repo/layout';
import type { ActivitySummary, CodeValueSummary, PlanCodeLane } from '@repo/types';

import type { SwimlaneInput } from '@/features/tsld';

/**
 * The last build, keyed by the identity of its inputs — the one-slot cache of `manual-membership.ts`,
 * for the same reason: the scene, Move to swimlane… and auto-resolve all hand this the cache's own
 * arrays, so they share one build per data change instead of each walking every activity again.
 */
let last: {
  activities: readonly ActivitySummary[];
  typeId: string;
  typeName: string;
  values: readonly CodeValueSummary[];
  planLanes: ReadonlyMap<string, PlanCodeLane> | undefined;
  input: SwimlaneInput;
} | null = null;

/**
 * The neutral {@link SwimlaneInput} for a plan whose swimlanes are **one per value of a code** (source
 * `ACTIVITY_CODE`): the values in use, in value order, then "No <type>" holding whatever has none.
 *
 * - **Membership is derived**, not stored: an activity's live value of the type, from the `codes` the
 *   list already carries ({@link codeBasisOf}). A WBS summary is a member of nothing — it is never in a
 *   code swimlane — so it maps to `null` whatever it carries.
 * - **The stored lane** is the row kept for `(type, that value)`, or `(type, NULL)` under "No <type>".
 *   The list carries at most one entry for the type (the activity's current basis); `planLanes` is the
 *   plan-wide read, used only for an activity whose list entry is absent. **A lane is applied only when
 *   its `codeValueId` equals the activity's current value** (or both are none): a mismatch is a row
 *   from a basis the activity has left, so the activity counts as unplaced and the projection derives
 *   its lane, exactly as it does for any member with no row (ADR-0139).
 * - `values` must be the type's **live** values in `position` order.
 *
 * `noneName` is "No <type name>", so every place that words the none swimlane says "No Area" with no
 * edit of its own (ui-design §3.4).
 */
export function codeSwimlaneInput(
  activities: readonly ActivitySummary[],
  type: { id: string; name: string },
  values: readonly CodeValueSummary[],
  planLanes?: ReadonlyMap<string, PlanCodeLane>,
): SwimlaneInput {
  if (
    last?.activities === activities &&
    last.typeId === type.id &&
    last.typeName === type.name &&
    last.values === values &&
    last.planLanes === planLanes
  ) {
    return last.input;
  }
  const input = buildInput(activities, type, values, planLanes);
  last = { activities, typeId: type.id, typeName: type.name, values, planLanes, input };
  return input;
}

function buildInput(
  activities: readonly ActivitySummary[],
  type: { id: string; name: string },
  values: readonly CodeValueSummary[],
  planLanes: ReadonlyMap<string, PlanCodeLane> | undefined,
): SwimlaneInput {
  const live = new Set(values.map((v) => v.id));
  const membership = new Map<string, string | null>();
  for (const a of activities) {
    membership.set(a.id, a.type === 'WBS_SUMMARY' ? null : codeBasisOf(a.codes, type.id, live));
  }
  const inUse = codeSwimlaneValues(
    values,
    activities.map((a) => ({ type: a.type, valueId: membership.get(a.id) ?? null })),
  );

  const storedLanes = new Map<string, { lane: number; updatedAt: number }>();
  for (const a of activities) {
    // A summary that carries a value has a row keyed to that value, not to "none", so it reads as
    // unplaced here and is derived — it is only ever drawn when nothing lifts it into the WBS band.
    const basis = membership.get(a.id) ?? null;
    const row =
      a.codeSwimlaneLanes?.find((l) => l.codeTypeId === type.id && l.codeValueId === basis) ??
      matching(planLanes?.get(a.id), basis);
    if (row) storedLanes.set(a.id, { lane: row.laneIndex, updatedAt: Date.parse(row.updatedAt) });
  }

  return {
    swimlanes: inUse.map((v) => ({ id: v.id, name: codeSwimlaneName(v) })),
    membership,
    storedLanes,
    source: 'ACTIVITY_CODE',
    codeTypeId: type.id,
    codeTypeName: type.name,
    noneName: `No ${type.name}`,
  };
}

const matching = (row: PlanCodeLane | undefined, basis: string | null): PlanCodeLane | undefined =>
  row !== undefined && row.codeValueId === basis ? row : undefined;
