/**
 * The pairwise **dimension table** (ADR-0066 M3.1, feature-spec §4).
 *
 * Chosen by reading the engine's branch points rather than by multiplying enum sizes: a dimension
 * earns a place here because the engine does something different for each of its values, and a
 * value earns a place because some code path reads it. Multiplying every enum in the schema would
 * produce a bigger array that tests less.
 *
 * Two things about this file are load-bearing and easy to lose:
 *
 * 1. **An excluded value is declared, never omitted.** A value the product cannot author is listed
 *    with its reason, so a reader can tell "we chose not to cross this" from "we forgot". That is
 *    M3.1's stated risk — silent exclusions hiding a real gap — and it is exactly what M2's
 *    coverage report found: four calendar shapes the engine supports and no client can create.
 * 2. **The order is the tie-break.** The covering-array search is greedy, and greedy searches are
 *    only reproducible if every tie resolves the same way. Reordering this table changes which
 *    cases are generated, which is fine, but it must change them the same way on every machine.
 */

/** One value a dimension can take, as it appears in a generated case. */
export interface DimensionValue {
  /** Stable id, used in the case name and in a divergence report. */
  id: string;
  /**
   * Present when the product **cannot author** this value. It is generated into no case, and the
   * generator reports it — an unreachable value that simply vanished would read as covered.
   */
  unreachable?: { reason: string; debt: number | null };
}

export interface Dimension {
  id: string;
  /** Which object the value lands on — the differential reports it, so a reader knows where to look. */
  scope: 'plan' | 'activity' | 'relationship' | 'assignment' | 'resource';
  values: DimensionValue[];
}

/**
 * The four calendar shapes the API can express, plus the two it cannot.
 *
 * `shift-night` and `window-only` are ADR-0036 capabilities with no author path anywhere in the
 * product (TECH_DEBT #79/#80). They stay in the table **as declared-unreachable** rather than being
 * deleted, because deleting them would make the table describe a smaller product than the engine is,
 * and the next reader would have no way to know the difference.
 */
const CALENDAR_VALUES: DimensionValue[] = [
  { id: 'inherit' },
  { id: 'own-5-day' },
  { id: 'own-24-hour' },
  {
    id: 'shift-night',
    unreachable: {
      reason: 'no write path accepts intraday shift windows — every calendar day is the full day',
      debt: 80,
    },
  },
  {
    id: 'window-only',
    unreachable: {
      reason: 'a non-working base week is a 422: the calendars API requires workingWeekdays >= 1',
      debt: 79,
    },
  },
];

export const DIMENSIONS: readonly Dimension[] = [
  // ── Activity ────────────────────────────────────────────────────────────────────────────────
  {
    id: 'activityType',
    scope: 'activity',
    values: [
      { id: 'TASK' },
      { id: 'START_MILESTONE' },
      { id: 'FINISH_MILESTONE' },
      { id: 'LEVEL_OF_EFFORT' },
      { id: 'RESOURCE_DEPENDENT' },
    ],
  },
  {
    id: 'constraint',
    scope: 'activity',
    values: [
      { id: 'none' },
      { id: 'SNET' },
      { id: 'SNLT' },
      { id: 'FNET' },
      { id: 'FNLT' },
      { id: 'MSO' },
      { id: 'MFO' },
      { id: 'MANDATORY_START' },
      { id: 'MANDATORY_FINISH' },
    ],
  },
  {
    id: 'status',
    scope: 'activity',
    values: [{ id: 'NOT_STARTED' }, { id: 'IN_PROGRESS' }, { id: 'COMPLETE' }],
  },
  {
    id: 'percentCompleteType',
    scope: 'activity',
    values: [{ id: 'DURATION' }, { id: 'UNITS' }, { id: 'PHYSICAL' }],
  },
  {
    id: 'durationType',
    scope: 'activity',
    values: [
      { id: 'FIXED_DURATION_AND_UNITS_TIME' },
      { id: 'FIXED_DURATION_AND_UNITS' },
      { id: 'FIXED_UNITS' },
      { id: 'FIXED_UNITS_TIME' },
    ],
  },
  {
    id: 'accrualType',
    scope: 'activity',
    values: [{ id: 'START' }, { id: 'UNIFORM' }, { id: 'END' }],
  },
  { id: 'calendar', scope: 'activity', values: CALENDAR_VALUES },
  {
    id: 'externalInstants',
    scope: 'activity',
    values: [{ id: 'none' }, { id: 'early-start' }, { id: 'late-finish' }, { id: 'both' }],
  },
  {
    id: 'suspendResume',
    scope: 'activity',
    values: [{ id: 'absent' }, { id: 'present' }],
  },

  // ── Relationship ────────────────────────────────────────────────────────────────────────────
  {
    id: 'dependencyType',
    scope: 'relationship',
    values: [{ id: 'FS' }, { id: 'SS' }, { id: 'FF' }, { id: 'SF' }],
  },
  {
    id: 'lagCalendar',
    scope: 'relationship',
    values: [
      { id: 'PREDECESSOR' },
      { id: 'SUCCESSOR' },
      { id: 'TWENTY_FOUR_HOUR' },
      { id: 'PROJECT_DEFAULT' },
    ],
  },
  {
    id: 'lagSign',
    scope: 'relationship',
    values: [{ id: 'negative' }, { id: 'zero' }, { id: 'positive' }],
  },

  // ── Assignment and resource ─────────────────────────────────────────────────────────────────
  {
    id: 'resourceKind',
    scope: 'resource',
    values: [{ id: 'LABOUR' }, { id: 'EQUIPMENT' }, { id: 'MATERIAL' }],
  },
  {
    id: 'curveType',
    scope: 'assignment',
    values: [
      { id: 'UNIFORM' },
      { id: 'BELL' },
      { id: 'FRONT_LOADED' },
      { id: 'BACK_LOADED' },
      { id: 'DOUBLE_PEAK' },
    ],
  },
  { id: 'driving', scope: 'assignment', values: [{ id: 'yes' }, { id: 'no' }] },
  { id: 'unitsPerHour', scope: 'assignment', values: [{ id: 'null' }, { id: 'set' }] },
  { id: 'maxUnitsPerHour', scope: 'resource', values: [{ id: 'null' }, { id: 'set' }] },

  // ── Plan ────────────────────────────────────────────────────────────────────────────────────
  { id: 'schedulingMode', scope: 'plan', values: [{ id: 'EARLY' }, { id: 'VISUAL' }] },
  {
    id: 'progressRecalcMode',
    scope: 'plan',
    values: [{ id: 'RETAINED_LOGIC' }, { id: 'PROGRESS_OVERRIDE' }, { id: 'ACTUAL_DATES' }],
  },
  {
    id: 'criticalPathDefinition',
    scope: 'plan',
    values: [{ id: 'TOTAL_FLOAT' }, { id: 'LONGEST_PATH' }],
  },
  {
    id: 'totalFloatMode',
    scope: 'plan',
    values: [{ id: 'START' }, { id: 'FINISH' }, { id: 'SMALLEST' }],
  },
  { id: 'levelResources', scope: 'plan', values: [{ id: 'off' }, { id: 'on' }] },
  { id: 'levelWithinFloatOnly', scope: 'plan', values: [{ id: 'off' }, { id: 'on' }] },
  { id: 'ignoreExternalRelationships', scope: 'plan', values: [{ id: 'off' }, { id: 'on' }] },
  { id: 'useExpectedFinishDates', scope: 'plan', values: [{ id: 'off' }, { id: 'on' }] },
  { id: 'makeOpenEndsCritical', scope: 'plan', values: [{ id: 'off' }, { id: 'on' }] },
];

/** One generated case's choice of value per dimension, keyed by dimension id. */
export type DimensionAssignment = Readonly<Record<string, string>>;

/** The values excluded from generation, with the reason each is unreachable. */
export function unreachableValues(): Array<{
  dimension: string;
  value: string;
  reason: string;
  debt: number | null;
}> {
  return DIMENSIONS.flatMap((dimension) =>
    dimension.values
      .filter((value) => value.unreachable !== undefined)
      .map((value) => ({
        dimension: dimension.id,
        value: value.id,
        reason: value.unreachable!.reason,
        debt: value.unreachable!.debt,
      })),
  );
}

/** The values a case may actually take — every dimension keeps at least one. */
export function reachableValues(dimension: Dimension): string[] {
  return dimension.values.filter((value) => value.unreachable === undefined).map((v) => v.id);
}
