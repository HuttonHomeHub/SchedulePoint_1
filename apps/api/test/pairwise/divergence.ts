import type { DimensionAssignment } from '@repo/seed';

/**
 * **What the two sides disagreed about** (ADR-0066 M3.3).
 *
 * A failing differential is only useful if it says which activity, which field, both values, and
 * which dimension pair the case was built to cross. "Case 41 diverged" sends a reader to a
 * sixty-three-plan database with nothing to look for; the shape below sends them to one row.
 */
export interface Divergence {
  caseId: string;
  /** The activity's key in the spec — the same string used as its `code` in the database. */
  activityKey: string;
  field: string;
  /** What `computeSchedule` said, given the spec. */
  expected: unknown;
  /** What the application persisted and read back. */
  actual: unknown;
}

/** The fields compared, and why each is worth comparing. */
export const COMPARED_FIELDS = [
  // The four dates are the product. Everything else in the schedule is derived from them, so a
  // divergence in one of these is the one a planner would notice first.
  'earlyStart',
  'earlyFinish',
  'lateStart',
  'lateFinish',
  // Float and criticality are what the four plan-level switches exist to change. Comparing dates
  // alone would let a `totalFloatMode` that is read by the engine and dropped by the write path
  // pass silently, because the dates are identical under every mode.
  'totalFloat',
  'freeFloat',
  'isCritical',
] as const;

export type ComparedField = (typeof COMPARED_FIELDS)[number];

/**
 * Render the divergences for a human. Grouped by case, because one dropped field usually shows up
 * on several activities at once and a flat list makes that look like several problems.
 */
export function formatDivergences(
  divergences: readonly Divergence[],
  assignments: ReadonlyMap<string, DimensionAssignment>,
): string {
  if (divergences.length === 0) return 'No divergences: the application matches the engine.';

  const byCase = new Map<string, Divergence[]>();
  for (const item of divergences) {
    const bucket = byCase.get(item.caseId);
    if (bucket === undefined) byCase.set(item.caseId, [item]);
    else bucket.push(item);
  }

  const lines: string[] = [
    `${divergences.length} divergence(s) across ${byCase.size} case(s).`,
    '',
    'The application and the engine disagree on the same inputs. The engine was fed the SPEC, not',
    'the persisted rows, so a field the write or read path dropped shows up here as a mismatch.',
    '',
  ];

  for (const [caseId, items] of byCase) {
    lines.push(`  ${caseId}`);
    // The dimensions are what makes the case what it is — the first question a reader asks.
    const assignment = assignments.get(caseId);
    if (assignment !== undefined) {
      lines.push(`    dimensions: ${dimensionSummary(assignment)}`);
    }
    for (const item of items) {
      lines.push(
        `    ${item.activityKey}.${item.field}: engine=${render(item.expected)} app=${render(item.actual)}`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * The dimensions most likely to explain a divergence, first. A full twenty-six-value dump is
 * unreadable at the point of failure; the reader can open the plan's description for the rest.
 */
function dimensionSummary(assignment: DimensionAssignment): string {
  const interesting = [
    'activityType',
    'constraint',
    'status',
    'calendar',
    'dependencyType',
    'lagSign',
    'progressRecalcMode',
    'totalFloatMode',
    'criticalPathDefinition',
  ];
  return interesting
    .filter((key) => assignment[key] !== undefined)
    .map((key) => `${key}=${assignment[key]!}`)
    .join(' ');
}

function render(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'absent';
  // A compared field is always a date string, a number or a boolean. Anything else is serialised
  // rather than stringified: `[object Object]` in a divergence report is worse than useless,
  // because it looks like a value and names nothing.
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? 'unrenderable';
}
