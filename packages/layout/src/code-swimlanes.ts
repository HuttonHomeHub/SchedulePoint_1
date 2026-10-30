/**
 * Swimlanes from a code (p6-activity-codes M4): the three pure rules the web's scene and the API must
 * agree on — which of an activity's values is its swimlane, which values are swimlanes at all, and what
 * a swimlane is called. Like the rest of this package they take plain structural inputs and import
 * neither Prisma nor `@repo/types` (ADR-0019).
 *
 * The "values in use" rule is pinned by `code-swimlane-values-in-use.fixture.json`, which the API's
 * SQL count (`CodeTypeRepository.countValuesInUse`) and {@link codeSwimlaneValues} both read, so the
 * two cannot drift.
 */

/** The part of an activity's code assignment the basis reads. */
export interface CodeAssignmentRef {
  codeTypeId: string;
  codeValueId: string;
}

/**
 * The code twin of {@link wbsBasisOf}: the value an activity carries of type `typeId` when that value
 * is live, else `null` — the activity is in "No <type>". `liveValueIds` is the type's live values, so
 * a value that was deleted reads as none, exactly as the server derives it (`(T, NULL)`).
 */
export function codeBasisOf(
  codes: readonly CodeAssignmentRef[] | undefined,
  typeId: string,
  liveValueIds: ReadonlySet<string>,
): string | null {
  const held = codes?.find((c) => c.codeTypeId === typeId)?.codeValueId;
  return held !== undefined && liveValueIds.has(held) ? held : null;
}

/** One live activity as the "values in use" rule sees it. `type` is a plain string, as in `WbsNode`. */
export interface CodeSwimlaneMember {
  type: string;
  /** The activity's live value of the type (see {@link codeBasisOf}), or `null`. */
  valueId: string | null;
}

/**
 * The **values in use**, in the order given (the values list is `ORDER BY position, id`): a value is in
 * use when at least one live activity that is **not a WBS summary** carries it. Summaries are excluded
 * because a summary is never a member of a code swimlane, so counting one would offer a swimlane with
 * nothing in it. `values` must be the type's live values; `members` the plan's live activities.
 */
export function codeSwimlaneValues<V extends { id: string }>(
  values: readonly V[],
  members: readonly CodeSwimlaneMember[],
): V[] {
  const carried = new Set<string>();
  for (const m of members) {
    if (m.valueId !== null && m.type !== 'WBS_SUMMARY') carried.add(m.valueId);
  }
  return values.filter((v) => carried.has(v.id));
}

/** What a value is called as a swimlane (and anywhere else it is read as a name): description, else short code. */
export function codeSwimlaneName(value: { shortCode: string; description: string | null }): string {
  return value.description ?? value.shortCode;
}
