import type {
  ActivityStep,
  ActivitySummary,
  CrossPlanDependencySummary,
  DependencySummary,
  ResourceAssignmentSummary,
} from '@repo/types';

import { ApiFetchError } from '@/lib/api/client';

/**
 * **Check, then write** (ADR-0176): the vocabulary a command's replay speaks, and the checks every
 * command shares so no builder invents its own.
 *
 * A step that cannot apply is not an error: nothing was written, the step is set aside, and the
 * planner is told why. Only a transport failure or a lost pen (423) leaves a replay as a throw,
 * because those say nothing about the step.
 */

/**
 * Why a step could not apply.
 *
 * - `changed` — a field the step wrote no longer holds the value the step left (or the server said 409).
 * - `gone` — a row the step needs is no longer there (deleted since, or 404).
 * - `parent-deleted` — a restore the server refused because the phase it was filed under was deleted.
 * - `duplicate` — re-creating a link the plan already has.
 * - `cycle` — re-creating a cross-plan link that would now close a loop in the programme's logic.
 * - `unfiled` — undoing a dissolve: the summary was put back but its activities could not be moved back
 *   under it. The one reason that says something was written, so the planner is not told "nothing changed".
 */
export type NotApplicableReason =
  'changed' | 'gone' | 'parent-deleted' | 'duplicate' | 'cycle' | 'unfiled';

export type ReplayResult =
  | { readonly kind: 'applied' }
  | {
      readonly kind: 'not-applicable';
      readonly reason: NotApplicableReason;
      /** What the strip names as having changed; a row's name, or a plain-words stand-in. */
      readonly subjectName: string;
    };

export const APPLIED: ReplayResult = { kind: 'applied' };

export function notApplicable(reason: NotApplicableReason, subjectName: string): ReplayResult {
  return { kind: 'not-applicable', reason, subjectName };
}

/** What a multi-row step says when it has no remembered name for a row that is gone. */
const UNNAMED_SUBJECT = 'An activity in this step';

/**
 * How many rows a replay reads one by one. A step naming this many rows or fewer is checked through
 * the per-row endpoints (one small request each, in parallel); a larger step walks the plan's list
 * once. The list is paged and walked **sequentially** (`apiFetchAllPages`), so it costs a request per
 * hundred activities before the write can start — on a 2,000-activity plan about twenty round trips.
 * A handful of single reads is never dearer than that, and five covers every single-row step, a link
 * chain and a paste of a few bars.
 */
export const SINGLE_READ_LIMIT = 5;

/**
 * What a replay reads with. A **fresh** read — not whatever the views last drew — because the whole
 * point of the check is to see what is on the server now. Rows missing from a map are gone.
 */
export interface ReplayContext {
  readActivities: (ids: readonly string[]) => Promise<ReadonlyMap<string, ActivitySummary>>;
  readDependencies: (ids: readonly string[]) => Promise<ReadonlyMap<string, DependencySummary>>;
  /** Every link with an end on one of these activities, by link id. */
  readLinksOf: (activityIds: readonly string[]) => Promise<ReadonlyMap<string, DependencySummary>>;
  /** Every activity filed directly under one of these summaries, by id. */
  readChildrenOf: (parentIds: readonly string[]) => Promise<ReadonlyMap<string, ActivitySummary>>;
  /** An activity's weighted steps in order; `undefined` when the activity itself is gone. */
  readSteps: (activityId: string) => Promise<readonly ActivityStep[] | undefined>;
  /** An activity's resource assignments; `undefined` when the activity itself is gone. */
  readAssignments: (
    activityId: string,
  ) => Promise<readonly ResourceAssignmentSummary[] | undefined>;
  /** One cross-plan link by id; `undefined` when it is gone. */
  readCrossPlanLink: (linkId: string) => Promise<CrossPlanDependencySummary | undefined>;
}

/** A field's value for comparison: the API speaks `null`, so an absent field and a null are one value. */
function comparable(value: unknown): unknown {
  return value === undefined ? null : value;
}

/** The named fields of a row, as a plain object — what a step expects to find, or wrote. */
export function pick<T extends object, K extends keyof T>(row: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) out[key] = row[key];
  return out;
}

/** Whether every expected field holds its expected value in `row`. Only the named fields are read. */
export function matches<T extends object>(row: T, expected: Partial<T>): boolean {
  return (Object.keys(expected) as (keyof T)[]).every(
    (key) => comparable(row[key]) === comparable(expected[key]),
  );
}

/** One activity a step touched, the fields it expects to find there, and the name to say if not. */
export interface ActivityExpectation {
  id: string;
  /** The activity's name for the message; absent where the builder holds none (a bulk step). */
  name?: string;
  expect: Partial<ActivitySummary>;
}

export type Checked<T> =
  | { readonly ok: true; readonly rows: ReadonlyMap<string, T> }
  | { readonly ok: false; readonly result: ReplayResult };

/**
 * The pre-check for activities: every expectation's row must exist and hold the expected fields.
 * **All or nothing** — the first failing row sets the whole step aside, so a multi-row step is never
 * half-applied. Fields the step did not write are not read, which is what makes a colleague's edit to
 * something else irrelevant.
 */
export async function checkActivities(
  ctx: ReplayContext,
  expectations: readonly ActivityExpectation[],
): Promise<Checked<ActivitySummary>> {
  const rows = await ctx.readActivities(expectations.map((e) => e.id));
  for (const expectation of expectations) {
    const row = rows.get(expectation.id);
    if (row === undefined) {
      return {
        ok: false,
        result: notApplicable('gone', expectation.name ?? UNNAMED_SUBJECT),
      };
    }
    if (!matches(row, expectation.expect)) {
      return { ok: false, result: notApplicable('changed', expectation.name ?? row.name) };
    }
  }
  return { ok: true, rows };
}

/** One link a step touched, and the fields it expects to find on it. */
export interface DependencyExpectation {
  id: string;
  /** How the link is named in the message, e.g. `Excavate → Pour`. */
  name: string;
  expect: Partial<DependencySummary>;
}

/** The pre-check for links — the same contract as {@link checkActivities}. */
export async function checkDependencies(
  ctx: ReplayContext,
  expectations: readonly DependencyExpectation[],
): Promise<Checked<DependencySummary>> {
  const rows = await ctx.readDependencies(expectations.map((e) => e.id));
  for (const expectation of expectations) {
    const row = rows.get(expectation.id);
    if (row === undefined) {
      return { ok: false, result: notApplicable('gone', expectation.name) };
    }
    if (!matches(row, expectation.expect)) {
      return { ok: false, result: notApplicable('changed', expectation.name) };
    }
  }
  return { ok: true, rows };
}

/** The link's name for a message — both endpoints, like its label. */
export function linkName(dependency: DependencySummary): string {
  return `${dependency.predecessor.name} → ${dependency.successor.name}`;
}

/**
 * The machine-readable reason on a `{ error: { details } }` envelope, when it carries one.
 *
 * Read rather than assumed (ADR-0076): `ApiFetchError` carries the whole envelope error as `.error`
 * (`lib/api/client.ts`), `DomainError.details` is copied straight through by
 * `all-exceptions.filter.ts`, and `lib/api/calendar-scope-errors.ts` already reads `details.reason`
 * exactly this way.
 */
function reasonOf(err: ApiFetchError): string | undefined {
  return (err.error.details as { reason?: string } | undefined)?.reason;
}

/**
 * Run a write, turning the server's "no" into a set-aside. A 409 between the pre-check and the write
 * is a race and reads as `changed`; the three reasons the server names itself keep their own words.
 * **Never retried** — the server has said the world moved. Anything else (423, a network failure, a
 * 5xx) is rethrown, because it says nothing about whether the step applies.
 */
export async function writeOrSetAside(
  subjectName: string,
  write: () => Promise<unknown>,
): Promise<ReplayResult> {
  try {
    await write();
    return APPLIED;
  } catch (err) {
    if (err instanceof ApiFetchError && (err.status === 409 || err.status === 404)) {
      if (err.status === 404) return notApplicable('gone', subjectName);
      const reason = reasonOf(err);
      if (reason === 'PARENT_DELETED') return notApplicable('parent-deleted', subjectName);
      // A cross-plan link the plan already has, or one that would close a programme cycle because
      // somebody else has since linked the other way: both read as "that link cannot be made now".
      if (reason === 'CROSS_PLAN_CYCLE_DETECTED') return notApplicable('cycle', subjectName);
      if (reason === 'DUPLICATE_DEPENDENCY' || reason === 'DUPLICATE_CROSS_PLAN_DEPENDENCY') {
        return notApplicable('duplicate', subjectName);
      }
      return notApplicable('changed', subjectName);
    }
    throw err;
  }
}

/** The single-row form of {@link replayActivities}: the write is handed the row as it is NOW. */
export async function replayActivity(
  ctx: ReplayContext,
  expectation: ActivityExpectation,
  write: (row: ActivitySummary) => Promise<unknown>,
): Promise<ReplayResult> {
  const checked = await checkActivities(ctx, [expectation]);
  if (!checked.ok) return checked.result;
  const row = checked.rows.get(expectation.id);
  if (row === undefined) return notApplicable('gone', expectation.name ?? UNNAMED_SUBJECT);
  return writeOrSetAside(expectation.name ?? row.name, () => write(row));
}

/** The single-link form: check one link's fields, then write with the link as it is now. */
export async function replayDependency(
  ctx: ReplayContext,
  expectation: DependencyExpectation,
  write: (row: DependencySummary) => Promise<unknown>,
): Promise<ReplayResult> {
  const checked = await checkDependencies(ctx, [expectation]);
  if (!checked.ok) return checked.result;
  const row = checked.rows.get(expectation.id);
  if (row === undefined) return notApplicable('gone', expectation.name);
  return writeOrSetAside(expectation.name, () => write(row));
}

/** Check a set of activities, then write — the whole replay of a multi-row activity step. */
export async function replayActivities(
  ctx: ReplayContext,
  expectations: readonly ActivityExpectation[],
  write: (rows: ReadonlyMap<string, ActivitySummary>) => Promise<unknown>,
): Promise<ReplayResult> {
  const checked = await checkActivities(ctx, expectations);
  if (!checked.ok) return checked.result;
  const only = expectations.length === 1 ? expectations[0] : undefined;
  const subject = only?.name ?? UNNAMED_SUBJECT;
  return writeOrSetAside(subject, () => write(checked.rows));
}

/**
 * The guard for a step that **deletes** what it touches. Deleting cascades — a bar's links, a
 * summary's subtree — so "the row still exists" is not enough: a colleague may have edited it, linked
 * it, or filed work under it since, and the delete would take all of that with it. The step passes the
 * fields it expects each row to hold, says which links it knows about, and (for summaries) which
 * activities it knows are under it; anything else blocks the whole step.
 *
 * Resolves the checked rows (so the write can use their current versions) when it is safe to delete.
 */
export async function checkDeletable(
  ctx: ReplayContext,
  params: {
    rows: readonly ActivityExpectation[];
    isExpectedLink: (link: DependencySummary) => boolean;
    /** Activities the step knows are in the set, so a child outside it is somebody else's. */
    knownIds: ReadonlySet<string>;
  },
): Promise<Checked<ActivitySummary>> {
  const checked = await checkActivities(ctx, params.rows);
  if (!checked.ok) return checked;
  const blocked = (subjectName: string): Checked<ActivitySummary> => ({
    ok: false,
    result: notApplicable('changed', subjectName),
  });
  const summaries = [...checked.rows.values()].filter((row) => row.type === 'WBS_SUMMARY');
  if (summaries.length > 0) {
    const children = await ctx.readChildrenOf(summaries.map((row) => row.id));
    for (const child of children.values()) {
      if (!params.knownIds.has(child.id)) return blocked(child.name);
    }
  }
  const links = await ctx.readLinksOf(params.rows.map((r) => r.id));
  for (const link of links.values()) {
    if (!params.isExpectedLink(link)) return blocked(linkName(link));
  }
  return checked;
}

/**
 * A replay that failed part-way and knows what state it left the plan in, in the planner's words.
 *
 * It is a failure, not a set-aside — the step did not apply — but the generic "couldn't undo, try
 * again" would hide the one fact that matters (an assignment was removed and may not be back), so the
 * history shows `detail` instead. `cause` is the original error: a lost pen (423) is still a lost pen,
 * and the host runs the pen contract for it as well.
 */
export class ReplayFailure extends Error {
  constructor(
    readonly detail: string,
    cause: unknown,
  ) {
    super(detail, { cause });
    this.name = 'ReplayFailure';
  }
}

/** Whether an error is the server saying the thing is already gone. */
export function isNotFound(err: unknown): boolean {
  return err instanceof ApiFetchError && err.status === 404;
}
