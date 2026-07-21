import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  containsCycle,
  importSchedule,
  type ImportGraph,
  type InterchangeReport,
} from '@repo/interchange';
import { WorkingWeekdays } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import { parseCalendarDate } from '../../common/validation/calendar-date';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityRepository } from '../activities/activity.repository';
import {
  CalendarRepository,
  type ImportCalendarBatchInput,
} from '../calendars/calendar.repository';
import { DependencyRepository } from '../dependencies/dependency.repository';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanEditLockService } from '../plan-lock/plan-lock.service';
import { PlanRepository } from '../plans/plan.repository';
import { ProjectRepository } from '../projects/project.repository';
import { ResourceAssignmentRepository } from '../resources/resource-assignment.repository';
import { ResourceRepository } from '../resources/resource.repository';
import { ScheduleService } from '../schedule/schedule.service';

import { INTERCHANGE_IMPORT } from './interchange-permissions';
import { INTERCHANGE_MAX_UPLOAD_BYTES } from './interchange.constants';
import type { UploadedInterchangeFile } from './uploaded-file';

/** Machine-readable reasons carried in an interchange {@link ValidationError}'s `details.reason`. */
export const INTERCHANGE_ERROR = {
  /** No multipart file was provided on the upload. */
  NO_FILE: 'NO_FILE',
  /** The uploaded bytes are not a parseable schedule file (not XER / malformed / no project). */
  UNPARSEABLE_FILE: 'UNPARSEABLE_FILE',
  /** A commit graph is internally inconsistent (unresolvable key). Should be unreachable — the pure
   * pipeline guarantees resolvable endpoints/calendars — so this is a defensive backstop, never a
   * normal user path. */
  INCONSISTENT_GRAPH: 'INCONSISTENT_GRAPH',
} as const;

/**
 * Business logic for schedule interchange (ADR-0050, C2). This is the thin persisting layer's brain: it
 * resolves the org scope from the caller's own memberships (anti-IDOR), pairs it with the
 * `interchange:import` capability check, and asserts the **target project** belongs to that org before
 * doing any work. It then hands the untrusted bytes to the pure, engine-free `@repo/interchange`
 * pipeline (`importXer`).
 *
 * Two entry points:
 * - **{@link dryRun}** — stateless: parse → map → validate/repair → report, with **no database write**.
 * - **{@link commit}** — persist the parsed graph as a new plan (calendars + activities + dependencies)
 *   in **one transaction** via the existing repositories, then **recalculate** the new plan and return
 *   `{ planId, report }`.
 *
 * A parseable file (even one that needed repairs — the repairs are named in the report) yields a report;
 * a structurally-impossible file (not XER / malformed / no project) is a user-safe rejection.
 */
@Injectable()
export class InterchangeService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly projects: ProjectRepository,
    private readonly plans: PlanRepository,
    private readonly calendars: CalendarRepository,
    private readonly activities: ActivityRepository,
    private readonly dependencies: DependencyRepository,
    private readonly resources: ResourceRepository,
    private readonly assignments: ResourceAssignmentRepository,
    private readonly schedule: ScheduleService,
    private readonly editLock: PlanEditLockService,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(InterchangeService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Parse an uploaded file against a target project and return the pre-commit interchange report.
   * Nothing is persisted. Throws {@link ForbiddenError} (403) without the capability, {@link NotFoundError}
   * (404) when the org/project is not the caller's (anti-IDOR), and {@link ValidationError} (422) when no
   * file is supplied or the bytes are not a parseable schedule file.
   */
  async dryRun(
    principal: Principal,
    orgSlug: string,
    projectId: string,
    file: UploadedInterchangeFile | undefined,
  ): Promise<InterchangeReport> {
    const { organization, project } = await this.resolveTarget(principal, orgSlug, projectId);
    const { report } = this.parse(file, organization.id, projectId, principal);

    this.logger.info(
      {
        organizationId: organization.id,
        projectId: project.id,
        userId: principal.userId,
        detectedFormat: report.detectedFormat,
        mapped: report.mapped,
        approximations: report.approximations.length,
        repairs: report.repairs.length,
        drops: report.drops.length,
      },
      'interchange dry-run parsed a file',
    );
    return report;
  }

  /**
   * **Commit** an uploaded file as a new plan in the target project (ADR-0050, C2, Task 1.5). Re-parses
   * the re-uploaded bytes (stateless — `importXer` is pure + deterministic, so the graph equals the one
   * the planner reviewed on the dry-run), then persists it and returns `{ planId, report }`.
   *
   * **Atomicity (ADR-0022-style single transaction):** the whole graph — calendars (+ exceptions), the
   * plan, activities and dependencies — is created in **one interactive `$transaction`** via the existing
   * repositories (the same composition each domain service uses; the repositories accept an injected `tx`).
   * Any failure inside it — a duplicate plan name / calendar name / activity code, a duplicate or cyclic
   * dependency, a DB CHECK — rolls the whole transaction back, so **nothing is created**. The graph is
   * already acyclic + de-duped (Task 1.3), but the dependency cycle guard (`wouldCreateCycle`) and the DB
   * uniqueness constraints still run as defence-in-depth.
   *
   * After the graph is committed, the new plan is **recalculated** (ScheduleService, its own ADR-0022
   * transaction — the engine is only invoked, never modified). Because that recalc runs in a separate
   * transaction, a recalc failure is compensated by a best-effort cleanup that hard-deletes the
   * just-created (and not-yet-surfaced) rows, preserving the "nothing is created on failure" contract.
   */
  async commit(
    principal: Principal,
    orgSlug: string,
    projectId: string,
    file: UploadedInterchangeFile | undefined,
  ): Promise<{ planId: string; report: InterchangeReport }> {
    const { organization, project } = await this.resolveTarget(principal, orgSlug, projectId);
    const { graph, report } = this.parse(file, organization.id, projectId, principal);

    // Phase 1 — persist the whole graph atomically via the existing repositories (each accepts `tx`),
    // mirroring how the domain services compose repository writes inside a single `$transaction`.
    const { planId, createdCalendarIds, createdResourceIds } = await this.prisma.$transaction(
      (tx) => this.persistGraph(tx, principal, project, graph),
    );

    this.logger.info(
      {
        organizationId: organization.id,
        projectId: project.id,
        planId,
        userId: principal.userId,
        calendars: graph.calendars.length,
        activities: graph.activities.length,
        dependencies: graph.dependencies.length,
        resources: graph.resources.length,
        assignments: graph.assignments.length,
      },
      'interchange commit persisted a plan',
    );

    // Phase 2 — recalculate the new plan (ADR-0022; ScheduleService owns its own transaction + engine).
    // Recalc is a pen-gated plan mutation (ADR-0028): under PLAN_EDIT_LOCK_ENFORCED it asserts the caller
    // holds the plan's edit-lock. The importer just created this plan in-request, so no one else can hold
    // its pen — take it (uncontended) for the importer, recalc, then release so the plan is left unlocked
    // for whoever opens it. (With enforcement off, assertHoldsPen is inert and this is a harmless no-op.)
    // A recalc failure on a freshly-created, valid, acyclic graph is not expected, but honour the
    // "nothing is created on failure" contract by compensating: hard-delete the just-created rows (which
    // no caller has seen — the id is returned only on success), then rethrow.
    await this.editLock.acquire(principal, orgSlug, planId, false);
    try {
      await this.schedule.recalculate(principal, orgSlug, planId);
    } catch (error) {
      await this.editLock.release(principal, orgSlug, planId).catch(() => undefined);
      await this.compensate(planId, createdCalendarIds, createdResourceIds);
      this.logger.error(
        {
          organizationId: organization.id,
          projectId: project.id,
          planId,
          userId: principal.userId,
        },
        'interchange commit recalculation failed — created plan rolled back',
      );
      throw error;
    }

    // Release the pen so the imported plan opens unlocked for whoever navigates to it.
    await this.editLock.release(principal, orgSlug, planId).catch(() => undefined);

    this.logger.info(
      { organizationId: organization.id, projectId: project.id, planId, userId: principal.userId },
      'interchange commit succeeded',
    );
    return { planId, report };
  }

  /**
   * Persist one import graph as a new plan inside the caller's transaction. Ids for the client-assignable
   * (`@default(uuid(7))`) rows are **pre-generated in memory** and the source `key` → id maps built up
   * front, so every foreign key resolves before any DB write and the whole graph lands in a handful of
   * **batched `createMany`s** (constant statement count, independent of graph size) — sidestepping the
   * per-row-insert loop that risked Prisma's 5s interactive-transaction timeout at the import ceiling
   * (ADR-0050 B3). Order stays FK-safe: calendars (+ shifts/exceptions/windows) → plan → activities →
   * dependencies:
   * - **Calendars** first, materialising each source-derived `key` → the pre-generated id, so the plan
   *   default and per-activity calendars resolve. Each calendar's intraday shift windows are approximated
   *   to the calendar module's weekday-mask contract (a weekday is worked iff it has ≥1 window — richer
   *   shift calendars are not API-modelled in M1); each exception maps to a whole-day working/non-working
   *   day. All inserted by {@link CalendarRepository.createManyForImport} in one batch per table.
   * - The **plan** (a single insert), with `plannedStart` = the source data date and its default calendar
   *   resolved.
   * - **Activities**, resolving each activity's `calendarKey` → id and assigning a **deterministic
   *   `laneIndex` = its 0-based position in the graph's activity list** (source order), all in one batch.
   * - **Dependencies**, resolving `predecessorKey` / `successorKey` → activity ids, in one batch. The
   *   graph is already acyclic + de-duped (Task 1.3); a **single whole-graph `containsCycle` check**
   *   re-asserts the DAG invariant (ADR-0021) ONCE up front (replacing the old O(E²) per-row
   *   `wouldCreateCycle` loop), and the DB partial-unique constraint still backstops duplicates.
   *
   * M2 (ADR-0038/0039/0040) extends the same batched shape: activities also carry WBS parentage,
   * constraint slots and progress; the org-scoped resource library is **resolved-or-created** (existing
   * active org resources are reused, only new ones inserted); and assignments join activities↔resources
   * — all still a handful of `createMany`s.
   *
   * Returns the new plan id, the created calendar ids, and the **newly-created** resource ids (both id
   * lists feed the phase-2 recalc-failure compensation; a reused resource is never ours to delete).
   */
  private async persistGraph(
    tx: Prisma.TransactionClient,
    principal: Principal,
    project: { id: string; organizationId: string },
    graph: ImportGraph,
  ): Promise<{ planId: string; createdCalendarIds: string[]; createdResourceIds: string[] }> {
    const stamp = { createdBy: principal.userId, updatedBy: principal.userId };
    const organizationId = project.organizationId;

    // Defence-in-depth: the pure pipeline already guarantees an acyclic graph (Task 1.3). Re-assert the
    // DAG invariant (ADR-0021) with ONE whole-graph check over the import keys — O(V+E) once, not the
    // old O(E²) per-row loop. Unreachable on the normal path; if a cycle slipped through, reject so the
    // whole transaction rolls back and nothing is created.
    if (containsCycle(graph.dependencies)) {
      throw new ConflictError('The imported schedule contains a dependency cycle.', {
        reason: INTERCHANGE_ERROR.INCONSISTENT_GRAPH,
      });
    }

    // 1. Pre-generate calendar (+ exception) ids and map source key → id, then batch-insert.
    const calendarIdByKey = new Map<string, string>();
    const createdCalendarIds: string[] = [];
    const calendarInputs: ImportCalendarBatchInput[] = graph.calendars.map((calendar) => {
      const id = randomUUID();
      calendarIdByKey.set(calendar.key, id);
      createdCalendarIds.push(id);
      return {
        id,
        organizationId,
        name: calendar.name,
        workingWeekdays: this.maskFromShifts(calendar.shifts),
        exceptions: calendar.exceptions.map((exception) => ({
          id: randomUUID(),
          // The mapper emits single-day exceptions (startDate == endDate); the calendar module stores a
          // whole-day working/non-working exception (a window present ⇒ a worked day).
          date: parseCalendarDate(exception.startDate),
          isWorking: exception.windows.length > 0,
          label: exception.label,
        })),
        ...stamp,
      };
    });
    await this.calendars.createManyForImport(calendarInputs, tx);

    // 2. The plan (single insert), with its default calendar resolved from the graph's default key.
    const defaultCalendarId = this.resolveCalendarId(
      graph.plan.defaultCalendarKey,
      calendarIdByKey,
    );
    const plan = await this.plans.create(
      {
        organizationId,
        projectId: project.id,
        name: graph.plan.name,
        description: null,
        // The mandatory CPM data date (ADR-0033): the source data date → `plannedStart`.
        plannedStart: parseCalendarDate(graph.plan.dataDate),
        ...(defaultCalendarId ? { calendarId: defaultCalendarId } : {}),
        ...stamp,
      },
      tx,
    );

    // 3. Pre-generate an id for EVERY activity — including WBS_SUMMARY nodes (ADR-0038) — up front so
    // both the dependency endpoints and the WBS self-FK (`parentKey`) resolve from one map regardless of
    // source order. All activities land in a SINGLE `createMany`, so the parent self-FK is validated at
    // statement end: a child row may be inserted before its WBS_SUMMARY parent without a transient FK
    // violation, so no parent-before-child ordering is required.
    const activityIdByKey = new Map<string, string>();
    for (const activity of graph.activities) {
      activityIdByKey.set(activity.key, randomUUID());
    }
    // Map source key → id (deterministic lane per source order), batch-insert. The pure pipeline already
    // guaranteed WBS/constraint/progress consistency (acyclic same-plan tree, paired constraints,
    // deriveStatus/N08/N18/resume≥suspend), so every field is written verbatim.
    const activityRows: Prisma.ActivityCreateManyInput[] = graph.activities.map(
      (activity, laneIndex) => {
        const progress = activity.progress;
        return {
          id: this.resolveActivityId(activity.key, activityIdByKey),
          organizationId,
          planId: plan.id,
          code: activity.code,
          name: activity.name,
          // Now incl. WBS_SUMMARY / RESOURCE_DEPENDENT (M2, ADR-0038/0039).
          type: activity.type,
          // Durations arrive as working-minutes (ADR-0036); a milestone/summary is 0 (already normalised).
          durationMinutes: activity.durationMinutes,
          calendarId: this.resolveCalendarId(activity.calendarKey, calendarIdByKey),
          // WBS parent (ADR-0038): another in-graph activity's id (a WBS_SUMMARY), or null for top-level.
          parentId:
            activity.parentKey === null
              ? null
              : this.resolveActivityId(activity.parentKey, activityIdByKey),
          laneIndex,
          // Constraints (ADR-0035 §7–§12): primary + secondary type/date pairs + the ALAP flag.
          constraintType: activity.constraintType,
          constraintDate: this.toDateOrNull(activity.constraintDate),
          secondaryConstraintType: activity.secondaryConstraintType,
          secondaryConstraintDate: this.toDateOrNull(activity.secondaryConstraintDate),
          scheduleAsLateAsPossible: activity.scheduleAsLateAsPossible,
          // Progress (ADR-0035 §6): written verbatim when present; an un-progressed activity keeps the
          // column defaults (NOT_STARTED / 0 / nulls).
          ...(progress
            ? {
                status: progress.status,
                percentComplete: progress.percentComplete,
                percentCompleteType: progress.percentCompleteType,
                physicalPercentComplete: progress.physicalPercentComplete,
                actualStart: this.toDateOrNull(progress.actualStart),
                actualFinish: this.toDateOrNull(progress.actualFinish),
                remainingDurationMinutes: progress.remainingDurationMinutes,
                suspendDate: this.toDateOrNull(progress.suspendDate),
                resumeDate: this.toDateOrNull(progress.resumeDate),
                expectedFinish: this.toDateOrNull(progress.expectedFinish),
              }
            : {}),
          ...stamp,
        };
      },
    );
    await this.activities.createMany(activityRows, tx);

    // 4. Dependencies, resolving endpoints to ids, batch-insert (cycle already asserted once above).
    const dependencyRows: Prisma.ActivityDependencyCreateManyInput[] = graph.dependencies.map(
      (dependency) => {
        const predecessorId = activityIdByKey.get(dependency.predecessorKey);
        const successorId = activityIdByKey.get(dependency.successorKey);
        if (!predecessorId || !successorId) {
          // Defensive: the pure pipeline guarantees every endpoint resolves. If it somehow does not,
          // fail loud so the whole transaction rolls back rather than silently dropping an edge.
          throw new ValidationError('The imported schedule references an unknown activity.', {
            reason: INTERCHANGE_ERROR.INCONSISTENT_GRAPH,
          });
        }
        return {
          organizationId,
          planId: plan.id,
          predecessorId,
          successorId,
          type: dependency.type,
          lagMinutes: dependency.lagMinutes,
          ...stamp,
        };
      },
    );
    await this.dependencies.createMany(dependencyRows, tx);

    // 5. Resources — RESOLVE-OR-CREATE, org-scoped (ADR-0039). Resources are an org-scoped LIBRARY the
    // target org may already hold: the active partial-uniques (uq_resources_org_name / uq_resources_org_code)
    // make a blind insert of an already-present resource throw P2002 and abort the whole import. So for
    // each import resource, reuse an existing ACTIVE org resource matched by `code` (when the import
    // carries a code) else by `name`; only the genuinely-new ones are batch-inserted. The full
    // resourceKey → id map (reused + new) resolves the assignments below; only the NEW ids are returned
    // for compensation (a reused row predates this import and is never ours to delete).
    const resourceIdByKey = new Map<string, string>();
    const createdResourceIds: string[] = [];
    const newResourceRows: Prisma.ResourceCreateManyInput[] = [];
    // Resolve every import resource against the org library in ONE indexed query, not a per-resource
    // findFirst — an N+1 inside the commit transaction would serialise a round-trip per resource against
    // the interactive-transaction budget (the rest of persistGraph is deliberately batched for exactly
    // this reason). The match maps (by code, by name) are then consulted purely in memory; newly-created
    // resources are folded into them so two source rows sharing a name/code reuse one row rather than
    // colliding on the org-unique partial-uniques.
    const importCodes = graph.resources.map((r) => r.code).filter((c): c is string => c !== null);
    const importNames = graph.resources.map((r) => r.name);
    const existingResources =
      graph.resources.length === 0
        ? []
        : await tx.resource.findMany({
            where: {
              organizationId,
              deletedAt: null,
              OR: [
                ...(importCodes.length > 0 ? [{ code: { in: importCodes } }] : []),
                { name: { in: importNames } },
              ],
            },
            select: { id: true, code: true, name: true },
          });
    const idByCode = new Map<string, string>();
    const idByName = new Map<string, string>();
    for (const r of existingResources) {
      if (r.code !== null) idByCode.set(r.code, r.id);
      idByName.set(r.name, r.id);
    }
    for (const resource of graph.resources) {
      // Match an existing ACTIVE org resource by `code` (when the import carries one) else by `name`.
      const existingId =
        resource.code !== null ? idByCode.get(resource.code) : idByName.get(resource.name);
      if (existingId !== undefined) {
        resourceIdByKey.set(resource.key, existingId);
        continue;
      }
      const id = randomUUID();
      resourceIdByKey.set(resource.key, id);
      createdResourceIds.push(id);
      // Fold the new row into the match maps so a later source row with the same code/name reuses it.
      if (resource.code !== null) idByCode.set(resource.code, id);
      idByName.set(resource.name, id);
      newResourceRows.push({
        id,
        organizationId,
        name: resource.name,
        code: resource.code,
        kind: resource.kind,
        // A resource's own calendar (ADR-0039): resolve its graph key → created calendar id, null if none.
        calendarId: this.resolveCalendarId(resource.calendarKey, calendarIdByKey),
        costPerUnit: resource.costPerUnit,
        maxUnitsPerHour: resource.maxUnitsPerHour,
        ...stamp,
      });
    }
    await this.resources.createManyForImport(newResourceRows, tx);

    // 6. Assignments (ADR-0039/0040) — resolve activityKey → activity id and resourceKey → resource id,
    // one batched insert. The pure pipeline already guaranteed ≤1 driver/activity, MATERIAL-never-driving
    // and (activity, resource) dedupe, so the partial-uniques won't fire; `curveType` defaults to UNIFORM.
    const assignmentRows: Prisma.ResourceAssignmentCreateManyInput[] = graph.assignments.map(
      (assignment) => ({
        id: randomUUID(),
        organizationId,
        activityId: this.resolveActivityId(assignment.activityKey, activityIdByKey),
        resourceId: this.resolveResourceId(assignment.resourceKey, resourceIdByKey),
        budgetedUnits: assignment.budgetedUnits,
        unitsPerHour: assignment.unitsPerHour,
        isDriving: assignment.isDriving,
        actualUnits: assignment.actualUnits,
        ...stamp,
      }),
    );
    await this.assignments.createManyForImport(assignmentRows, tx);

    return { planId: plan.id, createdCalendarIds, createdResourceIds };
  }

  /**
   * Best-effort compensation for a phase-2 recalc failure (a failure after the graph transaction has
   * committed). Hard-deletes the just-created rows — which no caller has observed (the plan id is only
   * returned on success) — in FK-safe order so the "nothing is created on failure" contract holds. This
   * is cleanup of our own brand-new, not-yet-surfaced data, never a user-facing delete.
   */
  private async compensate(
    planId: string,
    calendarIds: string[],
    resourceIds: string[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Children before parents, resources before their calendars, and the plan before its calendars
      // (assignment → activity/resource, plan/activity/resource → calendar are all RESTRICT).
      // Assignments reference both activities and (import-created) resources, so they go first.
      await tx.resourceAssignment.deleteMany({ where: { activity: { planId } } });
      await tx.activityDependency.deleteMany({ where: { planId } });
      await tx.activity.deleteMany({ where: { planId } });
      // The pen we took for the recalc is released best-effort before this runs; clear any residual
      // lock row too so the plan delete can't FK-fail on plan_lock.
      await tx.planLock.deleteMany({ where: { planId } });
      await tx.plan.deleteMany({ where: { id: planId } });
      // Only the resources THIS import created (never a reused pre-existing one) — before the calendars
      // they may reference.
      if (resourceIds.length > 0) {
        await tx.resource.deleteMany({ where: { id: { in: resourceIds } } });
      }
      if (calendarIds.length > 0) {
        await tx.calendarExceptionWindow.deleteMany({
          where: { exception: { calendarId: { in: calendarIds } } },
        });
        await tx.calendarException.deleteMany({ where: { calendarId: { in: calendarIds } } });
        await tx.calendarShift.deleteMany({ where: { calendarId: { in: calendarIds } } });
        await tx.calendar.deleteMany({ where: { id: { in: calendarIds } } });
      }
    });
  }

  /**
   * Resolve the org scope from the caller's memberships (anti-IDOR), assert `interchange:import`, and load
   * the target project active + in that org. Shared by dry-run and commit so both enforce the exact same
   * authorisation + scoping before touching the file.
   */
  private async resolveTarget(
    principal: Principal,
    orgSlug: string,
    projectId: string,
  ): Promise<{ organization: { id: string }; project: { id: string; organizationId: string } }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, INTERCHANGE_IMPORT, organization.id);

    // Anti-IDOR: the target project must be an active project in the caller's resolved org.
    const project = await this.projects.findActiveByIdInOrg(projectId, organization.id);
    if (!project) throw new NotFoundError('Project not found.');
    return { organization, project };
  }

  /**
   * Validate a file was supplied and hand its untrusted bytes to the pure `importXer` pipeline. Returns
   * the parsed graph + report on success; throws 422 `NO_FILE` when no file is supplied and 422
   * `UNPARSEABLE_FILE` when the bytes are not a parseable schedule file. The byte cap is enforced at the
   * HTTP boundary (the multipart interceptor's `fileSize` limit → 413) and passed here as defence-in-depth.
   */
  private parse(
    file: UploadedInterchangeFile | undefined,
    organizationId: string,
    projectId: string,
    principal: Principal,
  ): { graph: ImportGraph; report: InterchangeReport } {
    if (!file || file.buffer.length === 0) {
      throw new ValidationError('No file was uploaded.', { reason: INTERCHANGE_ERROR.NO_FILE });
    }

    const result = importSchedule({
      content: new Uint8Array(file.buffer),
      filename: file.originalname,
      maxBytes: INTERCHANGE_MAX_UPLOAD_BYTES,
    });

    if (!result.ok) {
      // A structural impossibility (not a recognised XER/MSPDI / malformed / no project). The pure
      // pipeline's code/message
      // are already user-safe (no internals / stack). Surface them as a 422 without leaking the stage.
      this.logger.warn(
        {
          organizationId,
          projectId,
          userId: principal.userId,
          stage: result.error.stage,
          code: result.error.code,
        },
        'interchange rejected an unparseable file',
      );
      throw new ValidationError(result.error.message, {
        reason: INTERCHANGE_ERROR.UNPARSEABLE_FILE,
        code: result.error.code,
      });
    }
    return { graph: result.graph, report: result.report };
  }

  /** Parse an optional `YYYY-MM-DD` graph date to a UTC-midnight `Date`; a null stays null. */
  private toDateOrNull(value: string | null): Date | null {
    return value === null ? null : parseCalendarDate(value);
  }

  /**
   * Resolve an activity import `key` (a dependency endpoint, WBS parent, or the activity's own key) to
   * its pre-generated id. The pure pipeline guarantees every referenced key resolves; a miss is a
   * defensive backstop that fails loud so the whole transaction rolls back.
   */
  private resolveActivityId(key: string, activityIdByKey: Map<string, string>): string {
    const id = activityIdByKey.get(key);
    if (!id) {
      throw new ValidationError('The imported schedule references an unknown activity.', {
        reason: INTERCHANGE_ERROR.INCONSISTENT_GRAPH,
      });
    }
    return id;
  }

  /**
   * Resolve a resource import `key` (an assignment endpoint) to its reused-or-created id. The pure
   * pipeline guarantees every assignment's resource resolves; a miss is a defensive backstop.
   */
  private resolveResourceId(key: string, resourceIdByKey: Map<string, string>): string {
    const id = resourceIdByKey.get(key);
    if (!id) {
      throw new ValidationError('The imported schedule references an unknown resource.', {
        reason: INTERCHANGE_ERROR.INCONSISTENT_GRAPH,
      });
    }
    return id;
  }

  /** Resolve an optional calendar `key` to its created id; a null key inherits (no calendar). */
  private resolveCalendarId(
    key: string | null,
    calendarIdByKey: Map<string, string>,
  ): string | null {
    if (key === null) return null;
    const id = calendarIdByKey.get(key);
    if (!id) {
      // Defensive: the graph guarantees every referenced calendar key exists.
      throw new ValidationError('The imported schedule references an unknown calendar.', {
        reason: INTERCHANGE_ERROR.INCONSISTENT_GRAPH,
      });
    }
    return id;
  }

  /**
   * Derive the calendar module's weekday-mask contract from the graph's intraday shift rows (ADR-0036):
   * a weekday is "worked" iff it carries at least one shift window. This approximates a richer shift
   * calendar to the whole-day weekday pattern the calendar module models in M1 (the loss, if any, is
   * already named in the interchange report's calendar findings).
   */
  private maskFromShifts(shifts: readonly { weekday: number }[]): number {
    const workedWeekdays = [...new Set(shifts.map((s) => s.weekday))];
    return WorkingWeekdays.fromIndices(workedWeekdays);
  }

  private assertCan(principal: Principal, permission: Permission, organizationId: string): void {
    if (!principal.can(permission, organizationId)) {
      this.logger.warn(
        { userId: principal.userId, permission, organizationId },
        'authorisation denied',
      );
      throw new ForbiddenError('You do not have permission to perform this action.');
    }
  }
}
