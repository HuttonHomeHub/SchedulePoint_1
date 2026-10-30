import type {
  ActivityCodeAssignment,
  ActivityStep,
  ActivitySummary,
  CodeTypeSummary,
  CodeValueSummary,
  CrossPlanDependencySummary,
  DependencySummary,
  PlanSummary,
  ResourceAssignmentSummary,
  SwimlaneSummary,
} from '@repo/types';

import { calendarDeletedDetail } from './history-result';

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
 * - `already-restored` — undoing a dissolve whose restore batch is already consumed (restored elsewhere).
 * - `unfiled` — undoing a dissolve: the summary was put back but its activities could not be moved back
 *   under it. The one reason that says something was written, so the planner is not told "nothing changed".
 * - `value-deleted` — a code step whose target value has been deleted since (the server's 422
 *   `CODE_VALUE_DELETED` / `CODE_VALUE_WRONG_TYPE`). Unlike a deleted activity it is restorable from
 *   Codes…, so the strip says where the way back is (`m3-ui-design.md` §8.2).
 * - `swimlanes-changed` — a code step whose lanes the server refused (409 `SWIMLANE_SOURCE_CHANGED`)
 *   because a colleague switched the plan's swimlane source since the lanes were planned.
 */
export type NotApplicableReason =
  | 'changed'
  | 'gone'
  | 'parent-deleted'
  | 'duplicate'
  | 'cycle'
  | 'unfiled'
  | 'already-restored'
  | 'value-deleted'
  | 'swimlanes-changed';

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
export const UNNAMED_SUBJECT = 'An activity in this step';

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
  /** The plan's active swimlanes in display order, read fresh. A deleted swimlane is simply absent. */
  readSwimlanes: () => Promise<readonly SwimlaneSummary[]>;
  /** The plan's live code types in display order, read fresh, **without their values**. A deleted type is absent. */
  readCodeTypes: () => Promise<readonly CodeTypeSummary[]>;
  /** One code type's live values in display order, read fresh; `undefined` when the type itself is gone. */
  readCodeValues: (codeTypeId: string) => Promise<readonly CodeValueSummary[] | undefined>;
  /** The plan record, read fresh; `undefined` when the plan itself is gone. */
  readPlan: () => Promise<PlanSummary | undefined>;
}

/** A field's value for comparison: the API speaks `null`, so an absent field and a null are one value. */
function comparable(value: unknown): unknown {
  return value === undefined ? null : value;
}

/**
 * Whether two `codes` lists name the same value for every type. An absent list and an empty one are
 * the same answer (the key is absent on a plan with no code type), and order is not part of it.
 */
export function sameCodes(
  a: readonly ActivityCodeAssignment[] | undefined,
  b: readonly ActivityCodeAssignment[] | undefined,
): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  const held = new Map(left.map((c) => [c.codeTypeId, c.codeValueId] as const));
  return right.every((c) => held.get(c.codeTypeId) === c.codeValueId);
}

/** The named fields of a row, as a plain object — what a step expects to find, or wrote. */
export function pick<T extends object, K extends keyof T>(row: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) out[key] = row[key];
  return out;
}

/** Whether every expected field holds its expected value in `row`. Only the named fields are read. */
export function matches<T extends object>(row: T, expected: Partial<T>): boolean {
  return (Object.keys(expected) as (keyof T)[]).every((key) =>
    // `codes` is a list, and `===` on two lists is identity: it would refuse every row.
    key === 'codes'
      ? sameCodes(
          row[key] as readonly ActivityCodeAssignment[] | undefined,
          expected[key] as readonly ActivityCodeAssignment[] | undefined,
        )
      : comparable(row[key]) === comparable(expected[key]),
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
      // The one 409 that is NOT set aside (ADR-0201 D4): the cure — restoring the calendar — is in the
      // planner's hands, and a deleted activity is not listed in Recently deleted, so dropping the
      // step would leave no way in the product to get that work back. A throw leaves both stacks intact.
      if (reason === 'CALENDAR_DELETED') throw new CalendarDeletedFailure(calendarNameOf(err), err);
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

/**
 * A restore refused because the row uses a calendar that has since been deleted. A {@link ReplayFailure}
 * (the step stays on its stack and the strip offers Try again) that carries the calendar's name rather
 * than a sentence, because the sentence says "undo again" or "redo again" and only the host knows which
 * press it was (`calendarDeletedDetail` in `history-result.ts`). `detail` is the undo wording, for any
 * caller that reads it without knowing the direction.
 */
export class CalendarDeletedFailure extends ReplayFailure {
  constructor(
    /** Null when the calendar row no longer exists to be named. */
    readonly calendarName: string | null,
    cause: unknown,
  ) {
    super(calendarDeletedDetail('undo', calendarName), cause);
    this.name = 'CalendarDeletedFailure';
  }
}

/** The calendar's name from a `CALENDAR_DELETED` envelope, when it carries one. */
function calendarNameOf(err: ApiFetchError): string | null {
  const calendar = (err.error.details as { calendar?: { name?: unknown } } | undefined)?.calendar;
  return typeof calendar?.name === 'string' ? calendar.name : null;
}

/** Whether an error is the server saying the thing is already gone. */
export function isNotFound(err: unknown): boolean {
  return err instanceof ApiFetchError && err.status === 404;
}
