import type {
  ActivityStep,
  ActivityStepInput,
  ActivitySummary,
  CrossPlanDependencySummary,
  EditedField,
  ResourceAssignmentSummary,
} from '@repo/types';

import type { Command } from './commands';
import {
  APPLIED,
  checkActivities,
  matches,
  notApplicable,
  pick,
  replayActivities,
  writeOrSetAside,
  type ReplayContext,
  type ReplayResult,
} from './replay';

import type { CreateCrossPlanLinkInput } from '@/features/cross-plan-dependencies/api/use-cross-plan-dependencies';
import type {
  AssignmentCreateBody,
  AssignmentUpdateInput,
} from '@/features/resources/api/use-resources';

/**
 * The commands for the records a planner edits beside the bar (undo-redo M3): outline position, weighted
 * steps, resource assignments and cross-plan links. Same contract as `commands.ts` (ADR-0176) — declare
 * the rows and fields, check them against a fresh read, then write only those fields — and kept in its
 * own file because none of it is an activity's own field set.
 */

/** A field's value for comparison: the API speaks `null`, so an absent field and a null are one value. */
function sameValue(a: unknown, b: unknown): boolean {
  return (a ?? null) === (b ?? null);
}

// ---------------------------------------------------------------------------------------------------
// Re-parenting
// ---------------------------------------------------------------------------------------------------

/** `useUpdateActivityParents().mutateAsync` — one all-or-nothing batch that files rows under a summary. */
export type UpdateParentsFn = (input: {
  parents: { id: string; parentId: string | null; version: number }[];
}) => Promise<ActivitySummary[]>;

/** The rows a batch actually moved: those whose parent differs between the two states. */
export function reparentedRows(
  before: readonly ActivitySummary[],
  after: readonly ActivitySummary[],
): ActivitySummary[] {
  const prior = new Map(before.map((row) => [row.id, row.parentId ?? null]));
  return after.filter((row) => prior.has(row.id) && prior.get(row.id) !== (row.parentId ?? null));
}

/**
 * What to call a re-parenting step the surface did not name (Indent / Outdent says only which row and
 * where): the row and its destination, or — for several rows — the count and the destination when they
 * share one. `activities` supplies the destination's name.
 */
export function reparentLabel(
  moved: readonly ActivitySummary[],
  activities: readonly ActivitySummary[],
): string {
  const destinations = new Set(moved.map((row) => row.parentId ?? null));
  const only = destinations.size === 1 ? [...destinations][0] : undefined;
  const where =
    only === undefined
      ? null
      : only === null
        ? 'to the top level'
        : `under “${activities.find((a) => a.id === only)?.name ?? 'a summary'}”`;
  const what =
    moved.length === 1 ? `“${moved[0]?.name ?? 'activity'}”` : `${String(moved.length)} activities`;
  return where === null ? `Move ${what}` : `Move ${what} ${where}`;
}

/**
 * Reverse a **re-parenting** — Indent / Outdent, a summary's Members save, the bulk-assign bar. One call
 * to the batch endpoint is one step, however many rows it moved: the endpoint is all-or-nothing on
 * versions already, and so is the check here (one row whose parent somebody else changed sets the whole
 * step aside, and nothing is written).
 *
 * Only `parentId` is compared and written. A colleague renaming a row you indented is not a reason to
 * refuse, and the undo must not put the old name back.
 */
export function reparentCommand(params: {
  /** The rows as they were before the write; rows whose parent did not change are ignored. */
  before: readonly ActivitySummary[];
  /** The rows the batch returned. */
  after: readonly ActivitySummary[];
  updateParents: UpdateParentsFn;
  label: string;
}): Command {
  const { updateParents } = params;
  const priorParent = new Map(params.before.map((row) => [row.id, row.parentId ?? null]));
  const names = new Map(params.before.map((row) => [row.id, row.name]));
  const moved = reparentedRows(params.before, params.after);
  let atUndo = new Map<string, string | null>(moved.map((row) => [row.id, row.parentId ?? null]));
  let atRedo = new Map<string, string | null>(
    moved.map((row) => [row.id, priorParent.get(row.id) ?? null]),
  );
  const replay = (
    ctx: ReplayContext,
    expect: ReadonlyMap<string, string | null>,
    target: ReadonlyMap<string, string | null>,
    settle: (next: Map<string, string | null>) => void,
  ): Promise<ReplayResult> =>
    expect.size === 0
      ? Promise.resolve(APPLIED)
      : replayActivities(
          ctx,
          [...expect].map(([id, parentId]) => {
            const name = names.get(id);
            return { id, ...(name === undefined ? {} : { name }), expect: { parentId } };
          }),
          async (rows) => {
            const result = await updateParents({
              parents: [...target].flatMap(([id, parentId]) => {
                const row = rows.get(id);
                return row === undefined ? [] : [{ id, parentId, version: row.version }];
              }),
            });
            const next = new Map(target);
            for (const row of result) next.set(row.id, row.parentId ?? null);
            settle(next);
          },
        );
  return {
    label: params.label,
    undo: (ctx) =>
      replay(ctx, atUndo, atRedo, (next) => {
        atRedo = next;
      }),
    redo: (ctx) =>
      replay(ctx, atRedo, atUndo, (next) => {
        atUndo = next;
      }),
  };
}

// ---------------------------------------------------------------------------------------------------
// Weighted steps
// ---------------------------------------------------------------------------------------------------

/** `useReplaceActivitySteps().mutateAsync`, addressed at an activity — a bulk replace of its steps. */
export type ReplaceStepsFn = (input: {
  activityId: string;
  version: number;
  steps: ActivityStepInput[];
}) => Promise<ActivityStep[]>;

/** The mutable part of each step, in order — what the bulk replace takes and a replay compares. */
function stepInputsOf(steps: readonly ActivityStep[]): ActivityStepInput[] {
  return [...steps]
    .sort((a, b) => a.seq - b.seq)
    .map(({ name, weight, percentComplete }) => ({ name, weight, percentComplete }));
}

function sameSteps(a: readonly ActivityStepInput[], b: readonly ActivityStepInput[]): boolean {
  return (
    a.length === b.length &&
    a.every((step, i) => {
      const other = b[i];
      return (
        other !== undefined &&
        step.name === other.name &&
        step.weight === other.weight &&
        step.percentComplete === other.percentComplete
      );
    })
  );
}

/** Whether a save changed the steps at all — a save of what was already there is not a step. */
export function stepsChanged(
  before: readonly ActivityStep[],
  after: readonly ActivityStep[],
): boolean {
  return !sameSteps(stepInputsOf(before), stepInputsOf(after));
}

/**
 * Reverse a **weighted-steps save**. The endpoint replaces the whole ordered list, so the inverse is a
 * replace with the list as it stood before — and the check is on the whole list too: a step added,
 * edited, reordered or removed by somebody else since sets the step aside, because writing the old list
 * back would silently undo their change. Step ids are not compared; a replace re-creates them.
 *
 * The activity's own row is read only for its current version (a replace bumps it) and to learn that it
 * still exists; its physical % is derived from the steps and is deliberately neither compared nor
 * written (recompute, don't restore — ADR-0048).
 */
export function stepsReplaceCommand(params: {
  activity: Pick<ActivitySummary, 'id' | 'name'>;
  before: readonly ActivityStep[];
  after: readonly ActivityStep[];
  replaceSteps: ReplaceStepsFn;
  label?: string;
}): Command {
  const { activity, replaceSteps } = params;
  const before = stepInputsOf(params.before);
  const after = stepInputsOf(params.after);
  let atUndo = after;
  let atRedo = before;
  const replay = async (
    ctx: ReplayContext,
    expect: readonly ActivityStepInput[],
    target: readonly ActivityStepInput[],
    settle: (saved: ActivityStepInput[]) => void,
  ): Promise<ReplayResult> => {
    const checked = await checkActivities(ctx, [
      { id: activity.id, name: activity.name, expect: {} },
    ]);
    if (!checked.ok) return checked.result;
    const row = checked.rows.get(activity.id);
    const live = await ctx.readSteps(activity.id);
    if (row === undefined || live === undefined) return notApplicable('gone', activity.name);
    if (!sameSteps(stepInputsOf(live), expect)) return notApplicable('changed', activity.name);
    return writeOrSetAside(activity.name, async () => {
      settle(
        stepInputsOf(
          await replaceSteps({
            activityId: activity.id,
            version: row.version,
            steps: target.map((step) => ({ ...step })),
          }),
        ),
      );
    });
  };
  return {
    label: params.label ?? `Edit steps of “${activity.name}”`,
    undo: (ctx) =>
      replay(ctx, atUndo, before, (saved) => {
        atRedo = saved;
      }),
    redo: (ctx) =>
      replay(ctx, atRedo, after, (saved) => {
        atUndo = saved;
      }),
  };
}

// ---------------------------------------------------------------------------------------------------
// Resource assignments
// ---------------------------------------------------------------------------------------------------

/** `useCreateAssignmentOn().mutateAsync` — assigns a resource to the named activity. */
export type CreateAssignmentFn = (input: {
  activityId: string;
  body: AssignmentCreateBody;
}) => Promise<ResourceAssignmentSummary>;
/** `useUpdateAssignment().mutateAsync` — a partial PATCH of one assignment. */
export type UpdateAssignmentFn = (
  input: AssignmentUpdateInput,
) => Promise<ResourceAssignmentSummary>;
/** `useDeleteAssignment().mutateAsync` — unassigns (soft delete; there is no restore endpoint). */
export type DeleteAssignmentFn = (input: {
  assignmentId: string;
  activityId: string;
}) => Promise<void>;

/** The three writes an assignment step can make. */
export interface AssignmentWrites {
  createAssignment: CreateAssignmentFn;
  updateAssignment: UpdateAssignmentFn;
  deleteAssignment: DeleteAssignmentFn;
}

/** The fields of an assignment a step writes, and so the ones a replay compares. */
const ASSIGNMENT_FIELDS = [
  'budgetedUnits',
  'unitsPerHour',
  'isDriving',
  'curveType',
  'lagMinutes',
  'budgetedCost',
  'actualCost',
  'actualUnits',
] as const;
type AssignmentField = (typeof ASSIGNMENT_FIELDS)[number];
type AssignmentState = Pick<ResourceAssignmentSummary, AssignmentField>;
type AssignmentPatch = Omit<AssignmentUpdateInput, 'assignmentId' | 'activityId' | 'version'>;

/** A resource a write moved off driving, so the step that reverses the write can put it back. */
export interface DisplacedDriver {
  /** The assignment as it was before it was displaced. */
  assignment: ResourceAssignmentSummary;
  resourceName: string;
}

/** The create body that re-issues a state: null means "unset", which a create expresses by omission. */
function assignmentBodyOf(resourceId: string, state: AssignmentState): AssignmentCreateBody {
  return {
    resourceId,
    budgetedUnits: state.budgetedUnits,
    isDriving: state.isDriving,
    curveType: state.curveType,
    lagMinutes: state.lagMinutes,
    actualUnits: state.actualUnits,
    ...(state.unitsPerHour === null ? {} : { unitsPerHour: state.unitsPerHour }),
    ...(state.budgetedCost === null ? {} : { budgetedCost: state.budgetedCost }),
    ...(state.actualCost === null ? {} : { actualCost: state.actualCost }),
  };
}

/** The PATCH body for a target state's values of `fields` — and only those. */
function assignmentPatchOf(
  target: AssignmentState,
  fields: ReadonlySet<AssignmentField>,
): AssignmentPatch {
  return {
    ...(fields.has('budgetedUnits') ? { budgetedUnits: target.budgetedUnits } : {}),
    // A PATCH cannot clear a rate (ADR-0040); the caller recreates the row when it must.
    ...(fields.has('unitsPerHour') && target.unitsPerHour !== null
      ? { unitsPerHour: target.unitsPerHour }
      : {}),
    ...(fields.has('isDriving') ? { isDriving: target.isDriving } : {}),
    ...(fields.has('curveType') ? { curveType: target.curveType } : {}),
    ...(fields.has('lagMinutes') ? { lagMinutes: target.lagMinutes } : {}),
    ...(fields.has('budgetedCost') ? { budgetedCost: target.budgetedCost } : {}),
    ...(fields.has('actualCost') && target.actualCost !== null
      ? { actualCost: target.actualCost }
      : {}),
    ...(fields.has('actualUnits') ? { actualUnits: target.actualUnits } : {}),
  };
}

/**
 * An activity's assignments, and the one for a resource. **A resource is assigned to an activity at
 * most once**, so the pair (activity, resource) identifies an assignment across a delete and a
 * re-create — there is no restore endpoint, so a re-created assignment has a new id, and every later
 * step that named the old id would otherwise address a row that no longer exists.
 */
async function liveAssignments(
  ctx: ReplayContext,
  activityId: string,
  resourceId: string,
): Promise<
  | { ok: false }
  | {
      ok: true;
      list: readonly ResourceAssignmentSummary[];
      row: ResourceAssignmentSummary | undefined;
    }
> {
  const list = await ctx.readAssignments(activityId);
  if (list === undefined) return { ok: false };
  return { ok: true, list, row: list.find((a) => a.resourceId === resourceId) };
}

/**
 * Assign / unassign as a toggle on whether the resource is on the activity, differing only in start
 * state and direction — the `linkToggle` shape. A re-created assignment is found by resource, not by id
 * (see {@link liveAssignments}).
 *
 * **Setting a driver is a move**: the server clears the activity's previous driver in the same write.
 * So the step that reverses an assignment which took over driving must put that driver back
 * (`displaced`), and one that re-creates a driver remembers whom it displaced. The two writes are two
 * requests, so they are not atomic — both rows are checked first, and the driver is restored BEFORE the
 * delete, so a failure between them leaves a coherent activity (one driver) rather than none.
 */
function assignmentToggle(params: {
  assignment: ResourceAssignmentSummary;
  resourceName: string;
  activityName: string;
  startPresent: boolean;
  displaced: DisplacedDriver | undefined;
  writes: AssignmentWrites;
}): { ensurePresent: Command['redo']; ensureAbsent: Command['redo'] } {
  const { assignment, resourceName, activityName, writes } = params;
  const { activityId, resourceId } = assignment;
  let present = params.startPresent;
  let displaced = params.displaced;
  // What the assignment was left with, and so what the removal expects to find.
  let state: AssignmentState = pick(assignment, ASSIGNMENT_FIELDS);
  return {
    ensurePresent: async (ctx) => {
      if (present) return APPLIED;
      const live = await liveAssignments(ctx, activityId, resourceId);
      if (!live.ok) return notApplicable('gone', activityName);
      if (live.row !== undefined) return notApplicable('duplicate', resourceName);
      const driver = state.isDriving
        ? live.list.find((a) => a.isDriving && a.resourceId !== resourceId)
        : undefined;
      return writeOrSetAside(resourceName, async () => {
        const created = await writes.createAssignment({
          activityId,
          body: assignmentBodyOf(resourceId, state),
        });
        state = pick(created, ASSIGNMENT_FIELDS);
        displaced =
          driver === undefined
            ? undefined
            : { assignment: driver, resourceName: 'The driving resource' };
        present = true;
      });
    },
    ensureAbsent: async (ctx) => {
      if (!present) return APPLIED;
      const live = await liveAssignments(ctx, activityId, resourceId);
      if (!live.ok) return notApplicable('gone', activityName);
      if (live.row === undefined) return notApplicable('gone', resourceName);
      if (!matches(live.row, state)) return notApplicable('changed', resourceName);
      const row = live.row;
      const previous = displaced;
      const driver =
        previous === undefined
          ? undefined
          : live.list.find((a) => a.resourceId === previous.assignment.resourceId);
      if (previous !== undefined) {
        if (driver === undefined) return notApplicable('gone', previous.resourceName);
        if (driver.isDriving) return notApplicable('changed', previous.resourceName);
      }
      return writeOrSetAside(resourceName, async () => {
        if (driver !== undefined) {
          await writes.updateAssignment({
            assignmentId: driver.id,
            activityId,
            version: driver.version,
            isDriving: true,
          });
        }
        await writes.deleteAssignment({ assignmentId: row.id, activityId });
        displaced = undefined;
        present = false;
      });
    },
  };
}

/** Whether an edit changed any field a step would write — a save of what was already there is not a step. */
export function assignmentChanged(
  before: ResourceAssignmentSummary,
  after: ResourceAssignmentSummary,
): boolean {
  return ASSIGNMENT_FIELDS.some((key) => !sameValue(before[key], after[key]));
}

/** The label an assignment step carries when the host names none. */
function assignmentLabel(verb: string, resourceName: string, activityName: string): string {
  return `${verb} “${resourceName}” ${verb === 'Assign' ? 'to' : 'on'} “${activityName}”`;
}

/**
 * Reverse **assigning a resource** — undo unassigns it (when it is still as it was left), redo assigns
 * it again. See {@link assignmentToggle} for identity and for what happens to a displaced driver.
 */
export function assignmentAddCommand(params: {
  /** The assignment the create returned. */
  assignment: ResourceAssignmentSummary;
  resourceName: string;
  activityName: string;
  /** The driver this assignment took over from, as it stood before, when it became the driver. */
  displaced?: DisplacedDriver;
  writes: AssignmentWrites;
  label?: string;
}): Command {
  const toggle = assignmentToggle({
    assignment: params.assignment,
    resourceName: params.resourceName,
    activityName: params.activityName,
    writes: params.writes,
    startPresent: true,
    displaced: params.displaced,
  });
  return {
    label: params.label ?? assignmentLabel('Assign', params.resourceName, params.activityName),
    undo: toggle.ensureAbsent,
    redo: toggle.ensurePresent,
  };
}

/** Reverse **unassigning a resource** — undo assigns it again with what it held; redo removes it. */
export function assignmentRemoveCommand(params: {
  /** The assignment as it was when it was removed. */
  assignment: ResourceAssignmentSummary;
  resourceName: string;
  activityName: string;
  writes: AssignmentWrites;
  label?: string;
}): Command {
  const toggle = assignmentToggle({
    assignment: params.assignment,
    resourceName: params.resourceName,
    activityName: params.activityName,
    writes: params.writes,
    startPresent: false,
    displaced: undefined,
  });
  return {
    label: params.label ?? assignmentLabel('Unassign', params.resourceName, params.activityName),
    undo: toggle.ensurePresent,
    redo: toggle.ensureAbsent,
  };
}

/**
 * Reverse an **assignment edit** (units, rate, driving, curve, join lag, cost). Only the fields the edit
 * changed — diffed from the server's before and after rows — are compared and written.
 *
 * `editedField` is replayed with the write when the original carried it, because that is what makes the
 * server recompute the triad (ADR-0040): a units-driven activity's duration comes back with the units,
 * which the server derives rather than this step restoring. A PATCH cannot clear a rate, so an edit that
 * SET a rate is reversed by re-creating the assignment without one; that one case does not carry
 * `editedField`, so a duration the edit derived is not recomputed.
 *
 * Making a resource the driver moves the previous driver off; reversing it puts that driver back
 * (`displaced`), as {@link assignmentToggle} does for an assign.
 */
export function assignmentEditCommand(params: {
  before: ResourceAssignmentSummary;
  after: ResourceAssignmentSummary;
  resourceName: string;
  activityName: string;
  /** Which triad quantity the forward write named, when it named one. */
  editedField?: EditedField;
  /** The driver this edit took over from, when it made the resource the driver. */
  displaced?: DisplacedDriver;
  writes: AssignmentWrites;
  label?: string;
}): Command {
  const { before, after, resourceName, activityName, writes } = params;
  const { activityId, resourceId } = after;
  const fields = ASSIGNMENT_FIELDS.filter((key) => !sameValue(before[key], after[key]));
  const fieldSet: ReadonlySet<AssignmentField> = new Set(fields);
  let atUndo: AssignmentState = pick(after, ASSIGNMENT_FIELDS);
  let atRedo: AssignmentState = pick(before, ASSIGNMENT_FIELDS);
  const replay = async (
    ctx: ReplayContext,
    expect: AssignmentState,
    target: AssignmentState,
    direction: 'undo' | 'redo',
    settle: (next: AssignmentState) => void,
  ): Promise<ReplayResult> => {
    if (fields.length === 0) return APPLIED;
    const live = await liveAssignments(ctx, activityId, resourceId);
    if (!live.ok) return notApplicable('gone', activityName);
    if (live.row === undefined) return notApplicable('gone', resourceName);
    if (!matches(live.row, pick(expect, fields))) return notApplicable('changed', resourceName);
    const row = live.row;
    const previous = params.displaced;
    // Reversing "became the driver" is putting the displaced driver back — that write moves this one off.
    const restoreDriver =
      direction === 'undo' && previous !== undefined && fieldSet.has('isDriving');
    const driver =
      restoreDriver && previous !== undefined
        ? live.list.find((a) => a.resourceId === previous.assignment.resourceId)
        : undefined;
    if (restoreDriver && previous !== undefined) {
      if (driver === undefined) return notApplicable('gone', previous.resourceName);
      if (driver.isDriving) return notApplicable('changed', previous.resourceName);
    }
    const own = new Set(fields.filter((key) => !(restoreDriver && key === 'isDriving')));
    const recreate = own.has('unitsPerHour') && target.unitsPerHour === null;
    return writeOrSetAside(resourceName, async () => {
      let saved: ResourceAssignmentSummary = row;
      if (recreate) {
        await writes.deleteAssignment({ assignmentId: row.id, activityId });
        saved = await writes.createAssignment({
          activityId,
          body: assignmentBodyOf(resourceId, {
            ...pick(row, ASSIGNMENT_FIELDS),
            ...pick(target, fields),
            ...(restoreDriver ? { isDriving: false } : {}),
          }),
        });
      } else if (own.size > 0) {
        const edited = params.editedField;
        // The one field the forward write named must be among those this write carries, or the server
        // would recompute from a quantity nobody sent. (`DURATION` is an activity's edited field, not
        // an assignment's — the assignment surfaces never name it.)
        const carriesEdited =
          (edited === 'UNITS' && own.has('budgetedUnits')) ||
          (edited === 'UNITS_PER_HOUR' && own.has('unitsPerHour'));
        saved = await writes.updateAssignment({
          assignmentId: row.id,
          activityId,
          version: row.version,
          ...assignmentPatchOf(target, own),
          ...(carriesEdited ? { editedField: edited } : {}),
        });
      }
      if (driver !== undefined) {
        await writes.updateAssignment({
          assignmentId: driver.id,
          activityId,
          version: driver.version,
          isDriving: true,
        });
      }
      // The row as the server holds it after this write, except the driving flag this step moved by
      // writing somebody else's row (the response predates that).
      settle({ ...pick(saved, ASSIGNMENT_FIELDS), ...(restoreDriver ? { isDriving: false } : {}) });
    });
  };
  return {
    label: params.label ?? assignmentLabel('Edit', resourceName, activityName),
    undo: (ctx) =>
      replay(ctx, atUndo, atRedo, 'undo', (next) => {
        atRedo = next;
      }),
    redo: (ctx) =>
      replay(ctx, atRedo, atUndo, 'redo', (next) => {
        atUndo = next;
      }),
  };
}

// ---------------------------------------------------------------------------------------------------
// Cross-plan links
// ---------------------------------------------------------------------------------------------------

/** `useCreateCrossPlanLink().mutateAsync` — resolves to the created link (carrying its new id). */
export type CreateCrossPlanLinkFn = (
  input: CreateCrossPlanLinkInput,
) => Promise<CrossPlanDependencySummary>;
/** `useDeleteCrossPlanLink().mutateAsync` — removes a link by id. */
export type DeleteCrossPlanLinkFn = (linkId: string) => Promise<void>;

const CROSS_PLAN_LINK_FIELDS = ['type', 'lagMinutes', 'lagCalendar'] as const;
type CrossPlanLinkState = Pick<CrossPlanDependencySummary, (typeof CROSS_PLAN_LINK_FIELDS)[number]>;

/**
 * Cross-plan add / remove as one toggle — the `linkToggle` shape, over the org-scoped endpoint. A
 * re-created link gets a new id, so the toggle tracks the live one. The create takes whole days
 * (`lagDays`), which is what every link here was made with — the form only offers days.
 */
function crossPlanLinkToggle(params: {
  link: CrossPlanDependencySummary;
  startPresent: boolean;
  createLink: CreateCrossPlanLinkFn;
  deleteLink: DeleteCrossPlanLinkFn;
}): { ensurePresent: Command['redo']; ensureAbsent: Command['redo'] } {
  const { link, createLink, deleteLink } = params;
  const name = `${link.predecessor.name} → ${link.successor.name}`;
  let liveId: string | null = params.startPresent ? link.id : null;
  let state: CrossPlanLinkState = pick(link, CROSS_PLAN_LINK_FIELDS);
  return {
    ensurePresent: async (ctx) => {
      if (liveId !== null) return APPLIED;
      // Both ends must still be there; the predecessor lives in another plan, which the by-id read
      // reaches because it is organisation-scoped.
      const endpoints = [link.predecessor, link.successor];
      const rows = await ctx.readActivities(endpoints.map((e) => e.id));
      const missing = endpoints.find((e) => !rows.has(e.id));
      if (missing !== undefined) return notApplicable('gone', missing.name);
      return writeOrSetAside(name, async () => {
        const created = await createLink({
          predecessorActivityId: link.predecessor.id,
          successorActivityId: link.successor.id,
          type: link.type,
          lagDays: link.lagDays,
          lagCalendar: link.lagCalendar,
        });
        liveId = created.id;
        state = pick(created, CROSS_PLAN_LINK_FIELDS);
      });
    },
    ensureAbsent: async (ctx) => {
      if (liveId === null) return APPLIED;
      const id = liveId;
      const live = await ctx.readCrossPlanLink(id);
      if (live === undefined) return notApplicable('gone', name);
      if (!matches(live, state)) return notApplicable('changed', name);
      return writeOrSetAside(name, async () => {
        await deleteLink(id);
        liveId = null;
      });
    },
  };
}

/** Reverse **adding a cross-plan link** — undo removes it (when unchanged), redo adds it again. */
export function crossPlanLinkAddCommand(params: {
  link: CrossPlanDependencySummary;
  createLink: CreateCrossPlanLinkFn;
  deleteLink: DeleteCrossPlanLinkFn;
  label?: string;
}): Command {
  const toggle = crossPlanLinkToggle({ ...params, startPresent: true });
  return {
    label:
      params.label ??
      `Add cross-plan link “${params.link.predecessor.name}” → “${params.link.successor.name}”`,
    undo: toggle.ensureAbsent,
    redo: toggle.ensurePresent,
  };
}

/** Reverse **removing a cross-plan link** — undo adds it again, redo removes it. */
export function crossPlanLinkRemoveCommand(params: {
  link: CrossPlanDependencySummary;
  createLink: CreateCrossPlanLinkFn;
  deleteLink: DeleteCrossPlanLinkFn;
  label?: string;
}): Command {
  const toggle = crossPlanLinkToggle({ ...params, startPresent: false });
  return {
    label:
      params.label ??
      `Remove cross-plan link “${params.link.predecessor.name}” → “${params.link.successor.name}”`,
    undo: toggle.ensurePresent,
    redo: toggle.ensureAbsent,
  };
}
