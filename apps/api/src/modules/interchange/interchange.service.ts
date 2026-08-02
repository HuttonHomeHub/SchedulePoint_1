import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  containsCycle,
  importSchedule,
  type ImportCalendarScope,
  type ImportGraph,
  type InterchangeReport,
  type ReportFinding,
  type ResourceCollision,
  type ResourceCollisionResolution,
} from '@repo/interchange';
import { packLanes } from '@repo/layout';
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
import { resolveHoursPerDayMinutes } from '../calendars/hours-per-day';
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
  /**
   * The file names a resource whose name the organisation library already holds, and the commit did
   * not say what to do about it. The dry-run reports every one of these (`report.resourceCollisions`)
   * so the planner can answer before committing; this is what a commit that skipped that step gets.
   *
   * It exists because the alternative was worse in both directions. Reusing the existing row on a
   * name match alone discards the file's rate and calendar for a crew that may not be the same crew;
   * creating a second row splits one crew's demand across two rows that each look half-loaded, which
   * levelling and over-allocation then believe. Neither is a default worth guessing.
   */
  UNRESOLVED_RESOURCE_COLLISIONS: 'UNRESOLVED_RESOURCE_COLLISIONS',
} as const;

/** Caller-supplied import options (the optional multipart body fields). */
export interface InterchangeImportOptions {
  /**
   * Where a source **global** calendar (P6 `CA_Base`) should land (ADR-0053 §5): `PROJECT` (the default)
   * keeps a foreign file out of the shared organisation library; `ORG` is the deliberate opt-in for a
   * planner importing their enterprise calendar set. Everything else is unaffected — a project calendar
   * always lands in the target project, and a calendar an imported resource holds is always forced to
   * `ORG` (a resource is org-global, so it can hold nothing else).
   */
  readonly globalCalendarScope?: ImportCalendarScope;
  /**
   * What to do about each resource-name collision the dry-run reported, keyed by the import graph's
   * `resourceKey`. A key that is not in this map and does not collide is unaffected; a collision with
   * no entry fails the commit with `UNRESOLVED_RESOURCE_COLLISIONS` rather than being guessed.
   */
  readonly resourceResolutions?: Readonly<Record<string, ResourceCollisionResolution>>;
}

/**
 * How an import disambiguates a calendar name the target tier already holds (ADR-0053 §5). An imported
 * calendar is NEVER silently reused: two calendars can share a name and have completely different
 * working weeks, so reusing one by name would silently reschedule every imported activity on it. The
 * import therefore creates its own, suffixed, and says so in the report.
 */
const IMPORTED_NAME_SUFFIX = (date: string, ordinal: number): string =>
  ordinal <= 1 ? `(imported ${date})` : `(imported ${date}) (${ordinal})`;

/** The calendar-name ceiling the calendars API enforces (`CreateCalendarDto`), honoured by the importer. */
const CALENDAR_NAME_MAX_LENGTH = 120;

/** The resource-name ceiling the resources API enforces (`CreateResourceDto`), honoured by the importer. */
const RESOURCE_NAME_MAX_LENGTH = 200;

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
    options: InterchangeImportOptions = {},
  ): Promise<InterchangeReport> {
    const { organization, project } = await this.resolveTarget(principal, orgSlug, projectId);
    const { graph, report } = this.parse(file, organization.id, projectId, principal, options);

    // Probe the calendar names the target tiers already hold, so the REVIEWED report already names any
    // suffix-disambiguation the commit will apply (ADR-0053 §5). Read-only, outside any transaction —
    // the commit re-probes inside its own transaction, which is the authoritative pass.
    const { findings } = await this.resolveImportCalendarNames(this.prisma, project, graph);
    report.repairs.push(...findings);

    // Resource-name collisions are a QUESTION, not a finding, so they ride their own field — see
    // `ResourceCollision`. Reported here so the planner answers before committing rather than
    // discovering it as a conflict at the one moment the whole graph is about to be written.
    const resourceCollisions = await this.findResourceCollisions(
      this.prisma,
      organization.id,
      graph,
    );
    if (resourceCollisions.length > 0) report.resourceCollisions = resourceCollisions;

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
        resourceCollisions: resourceCollisions.length,
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
    options: InterchangeImportOptions = {},
  ): Promise<{ planId: string; report: InterchangeReport }> {
    const { organization, project } = await this.resolveTarget(principal, orgSlug, projectId);
    const { graph, report } = this.parse(file, organization.id, projectId, principal, options);

    // Phase 1 — persist the whole graph atomically via the existing repositories (each accepts `tx`),
    // mirroring how the domain services compose repository writes inside a single `$transaction`.
    const {
      planId,
      createdCalendarIds,
      createdResourceIds,
      unarchivedResources,
      calendarFindings,
      resourceFindings,
    } = await this.prisma.$transaction((tx) =>
      this.persistGraph(tx, principal, project, graph, options),
    );

    // Calendar names the target tier already held, disambiguated rather than reused (ADR-0053 §5).
    report.repairs.push(...calendarFindings);

    // The resource-name collisions the planner answered, and which way. Recorded so the post-commit
    // report says what the answers actually did — "reuse" silently dropped the file's own rate and
    // calendar for that resource, and "separate copy" created a row under a different name.
    report.repairs.push(...resourceFindings);

    // CQ-4 (ADR-0053 §4): a source row that matched an ARCHIVED library row is matched and the row
    // auto-unarchived — never silently. Recorded as a `repair` finding, the ADR-0050 class for "a
    // structural fix that kept the graph valid": without it the import would create assignments to
    // an archived resource, which the RESOURCE_ARCHIVED rule forbids everywhere else. Pushed onto
    // the report the caller receives, so the post-commit report is honest about a change the
    // importer made to shared tenant state it did not create.
    for (const resource of unarchivedResources) {
      report.repairs.push({
        kind: 'repair',
        entity: 'resource',
        sourceRef: resource.code ?? resource.name,
        detail: `matched the archived resource “${resource.name}” and unarchived it`,
        reason:
          'An archived resource keeps its name and code, so a matching import row would otherwise ' +
          'collide with it; leaving it archived would create assignments to an archived resource.',
      });
    }

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

    // Phase 3 — lay the imported programme out in lanes (ADR-0069).
    //
    // Deliberately AFTER the recalc, because the packer needs computed dates: it packs by time, and
    // before phase 2 an imported activity has none. Deliberately INSIDE the pen window, because
    // writing `lane_index` is an ordinary plan mutation and takes the same gate every other one does.
    //
    // Best-effort by design, and the asymmetry with phase 2 is the point. A recalc failure means the
    // plan's dates are wrong, so the import is rolled back; a layout failure means the plan is
    // correct but arranged badly, which a planner fixes with one press of Auto-arrange. Rolling back
    // a valid import over cosmetics would be the worse trade.
    try {
      await this.packImportedLanes(principal, organization.id, planId);
    } catch (error) {
      this.logger.warn(
        { organizationId: organization.id, planId, err: error },
        'interchange commit could not lay out lanes — plan kept, lanes left in source order',
      );
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
    options: InterchangeImportOptions,
  ): Promise<{
    planId: string;
    createdCalendarIds: string[];
    createdResourceIds: string[];
    /** Archived library resources this import matched and auto-unarchived (CQ-4, ADR-0053 §4). */
    unarchivedResources: { id: string; name: string; code: string | null }[];
    /** Calendar names the target tier already held, suffix-disambiguated (ADR-0053 §5). */
    calendarFindings: ReportFinding[];
    /** Resource-name collisions the planner answered, and how — one `repair` finding each. */
    resourceFindings: ReportFinding[];
  }> {
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
    //
    // TIER (ADR-0053 §5): each calendar lands where the pure mapper decided — `PROJECT`, pinned to the
    // import's TARGET PROJECT (the default, so a foreign file no longer writes shared tenant state and
    // its calendars are deleted with the project), or `ORG` for the shared library. Names the target
    // tier already holds are suffixed rather than reused, so a repeat import cannot abort on the
    // per-tier unique.
    const { nameByKey, findings: calendarFindings } = await this.resolveImportCalendarNames(
      tx,
      project,
      graph,
    );
    const calendarIdByKey = new Map<string, string>();
    const calendarScopeByKey = new Map<string, ImportCalendarScope>();
    const createdCalendarIds: string[] = [];
    const calendarInputs: ImportCalendarBatchInput[] = graph.calendars.map((calendar) => {
      const id = randomUUID();
      calendarIdByKey.set(calendar.key, id);
      calendarScopeByKey.set(calendar.key, calendar.scope);
      createdCalendarIds.push(id);
      return {
        id,
        organizationId,
        name: nameByKey.get(calendar.key) ?? calendar.name,
        scope: calendar.scope,
        // The CHECK partner of `scope`: a PROJECT calendar belongs to the import's target project, an
        // ORG one to no project at all (ck_calendars_scope_parent, ADR-0053 §1).
        projectId: calendar.scope === 'PROJECT' ? project.id : null,
        // The file's own weekly periods, verbatim — no longer flattened to a weekday mask.
        shifts: calendar.shifts,
        // The file's own standard working day (P6 `day_hr_cnt`, ADR-0068), falling back to the
        // derivation from the pattern just written. Resolved through the SAME helper the calendars
        // API uses, so an imported calendar and a hand-authored one cannot disagree about the factor.
        hoursPerDayMinutes: resolveHoursPerDayMinutes({
          ...(calendar.hoursPerDay === undefined ? {} : { hoursPerDay: calendar.hoursPerDay }),
          shifts: calendar.shifts,
        }),
        exceptions: calendar.exceptions.map((exception) => ({
          id: randomUUID(),
          // The mapper emits single-day exceptions (startDate == endDate).
          date: parseCalendarDate(exception.startDate),
          windows: exception.windows,
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
            // `archivedAt` rides along so the CQ-4 unarchive-and-report path needs no second query.
            select: { id: true, code: true, name: true, archivedAt: true },
          });
    // The LIBRARY's handles are kept separate from the decisions this import makes, because the two
    // mean different things. A library name match is the ambiguous case the planner must answer; a
    // name this import has already decided about is the SAME source crew appearing twice, which needs
    // no second question. Folding both into one map (as this once did) makes the second source row
    // indistinguishable from a fresh collision.
    const libraryIdByCode = new Map<string, string>();
    const libraryIdByName = new Map<string, string>();
    for (const r of existingResources) {
      if (r.code !== null) libraryIdByCode.set(r.code, r.id);
      libraryIdByName.set(r.name, r.id);
    }
    const resolvedIdByCode = new Map<string, string>();
    const resolvedIdByName = new Map<string, string>();
    // An ARCHIVED row is still an ACTIVE row (archive is orthogonal to soft delete, ADR-0053 §4),
    // so `existingResources` above already matched archived resources — and it must: an archived
    // row keeps its name and code (the partial uniques are predicated on `deleted_at` alone), so
    // refusing to match would hard-fail the import on a P2002 it could never resolve. CQ-4's
    // answer is therefore MATCH + AUTO-UNARCHIVE + REPORT: leaving it archived would have the
    // import create assignments to an archived resource, contradicting the RESOURCE_ARCHIVED rule
    // that the very same commit enforces everywhere else.
    const archivedById = new Map(
      existingResources.filter((r) => r.archivedAt !== null).map((r) => [r.id, r]),
    );
    const unarchivedResources: { id: string; name: string; code: string | null }[] = [];
    const resourceFindings: ReportFinding[] = [];

    // The planner's answers from the dry-run, and the free copy-names a `CREATE_COPY` will need. Both
    // are prepared BEFORE the loop so the loop itself does no I/O — the rest of `persistGraph` is
    // batched for exactly that reason (the interactive-transaction budget).
    const resolutions = options.resourceResolutions ?? {};
    const collisions = this.findGraphResourceCollisions(graph, existingResources);
    const unresolved = collisions.filter((c) => resolutions[c.resourceKey] === undefined);
    if (unresolved.length > 0) {
      // Fail the WHOLE import rather than guess. Reuse silently discards the file's rate and calendar
      // for a crew that may not be the same crew; a silent duplicate splits one crew's demand across
      // two rows that levelling, over-allocation and Earned Value all believe. The dry-run named every
      // one of these; this is the path a commit that skipped it takes.
      throw new ValidationError(
        unresolved.length === 1
          ? `The resource “${unresolved[0]!.name}” already exists in this organisation. Choose whether to reuse it or import a separate copy.`
          : `${unresolved.length} imported resources already exist in this organisation. Choose whether to reuse each one or import a separate copy.`,
        { reason: INTERCHANGE_ERROR.UNRESOLVED_RESOURCE_COLLISIONS, collisions: unresolved },
      );
    }
    const copyNameByKey = await this.resolveImportResourceCopyNames(
      tx,
      organizationId,
      collisions.filter((c) => resolutions[c.resourceKey] === 'CREATE_COPY'),
    );

    for (const resource of graph.resources) {
      // (a) CODE IS IDENTITY. A code match — in the library, or on a row this import already made —
      // is not a guess, so it never asks a question.
      const codeMatch =
        resource.code !== null
          ? (resolvedIdByCode.get(resource.code) ?? libraryIdByCode.get(resource.code))
          : undefined;
      // (b) A name this import already decided about: the same source crew appearing twice.
      const existingId = codeMatch ?? resolvedIdByName.get(resource.name);
      if (existingId !== undefined) {
        resourceIdByKey.set(resource.key, existingId);
        if (resource.code !== null) resolvedIdByCode.set(resource.code, existingId);
        resolvedIdByName.set(resource.name, existingId);
        const archived = archivedById.get(existingId);
        if (archived !== undefined) {
          archivedById.delete(existingId); // report each row once, however many source rows hit it
          unarchivedResources.push({ id: archived.id, name: archived.name, code: archived.code });
        }
        continue;
      }

      // (c) The LIBRARY holds this name and nothing identified the row — the ambiguous case, which
      // the planner has already answered (an unanswered one threw above).
      const libraryMatch = libraryIdByName.get(resource.name);
      let name = resource.name;
      if (libraryMatch !== undefined) {
        if (resolutions[resource.key] === 'REUSE_EXISTING') {
          resourceIdByKey.set(resource.key, libraryMatch);
          if (resource.code !== null) resolvedIdByCode.set(resource.code, libraryMatch);
          resolvedIdByName.set(resource.name, libraryMatch);
          const archived = archivedById.get(libraryMatch);
          if (archived !== undefined) {
            archivedById.delete(libraryMatch);
            unarchivedResources.push({ id: archived.id, name: archived.name, code: archived.code });
          }
          resourceFindings.push({
            kind: 'repair',
            entity: 'resource',
            sourceRef: resource.code ?? resource.key,
            detail: `resource “${resource.name}” was matched to the existing library resource`,
            reason:
              'you chose to reuse the existing resource, so the file’s own rate and calendar for ' +
              'it were not imported',
          });
          continue;
        }
        // CREATE_COPY — a new row under a name the org-unique will accept.
        name = copyNameByKey.get(resource.key) ?? resource.name;
        resourceFindings.push({
          kind: 'repair',
          entity: 'resource',
          sourceRef: resource.code ?? resource.key,
          detail: `resource “${resource.name}” was created as “${name}”`,
          reason:
            'a resource of that name already exists here and you chose to import a separate copy; ' +
            'the library name is unique per organisation, so the copy was renamed',
        });
      }

      const id = randomUUID();
      resourceIdByKey.set(resource.key, id);
      createdResourceIds.push(id);
      // Fold the new row in so a later source row naming the same crew reuses it rather than
      // colliding on the org-unique partial-uniques.
      if (resource.code !== null) resolvedIdByCode.set(resource.code, id);
      resolvedIdByName.set(resource.name, id);
      // A resource is ORG-GLOBAL, so it may only hold an ORG calendar (ADR-0053 §2 — the
      // `assertCalendarUsableBy` seam rejects anything else with RESOURCE_REQUIRES_ORG_CALENDAR). The
      // mapper guarantees this by forcing every resource-held calendar to ORG; re-assert it here so a
      // regression FAILS THE TRANSACTION (nothing created) rather than quietly writing a row the rest
      // of the domain would refuse — the import must never be the one path that bypasses the tier.
      this.assertResourceCalendarIsOrgScoped(resource.calendarKey, calendarScopeByKey);
      newResourceRows.push({
        id,
        organizationId,
        // `name`, not `resource.name`: a CREATE_COPY answer renamed it above so the org-unique accepts it.
        name,
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

    // Auto-unarchive every matched archived resource, in ONE batched update inside the same
    // transaction — so either the whole graph and the unarchives land, or neither does. The
    // version is bumped like any other write; this is deliberately NOT version-gated, because the
    // importer never read a version to gate on and an import must not fail on a concurrent edit
    // to an unrelated library row.
    if (unarchivedResources.length > 0) {
      await this.resources.unarchiveManyForImport(
        { ids: unarchivedResources.map((r) => r.id), organizationId },
        principal.userId,
        tx,
      );
    }

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
        // Always 0 today — no parser reads a join lag (ADR-0071 §5) — but written from the graph
        // rather than left to the column default, so the day a parser does read one it arrives here
        // with no second change needed and no seam left silently ignoring it.
        lagMinutes: assignment.lagMinutes,
        ...stamp,
      }),
    );
    await this.assignments.createManyForImport(assignmentRows, tx);

    return {
      planId: plan.id,
      createdCalendarIds,
      createdResourceIds,
      unarchivedResources,
      calendarFindings,
      resourceFindings,
    };
  }

  /**
   * Resolve the NAME each imported calendar will be created under, disambiguating any the target tier
   * already holds (ADR-0053 §5, US-9). Returns the key → final-name map plus one `repair` finding per
   * renamed calendar.
   *
   * **An import never reuses an existing calendar.** That is the deliberate decision, not an omission:
   * two calendars can share a name and have completely different working weeks, so matching by name
   * would silently reschedule every imported activity onto someone else's calendar — the one failure an
   * import must never make quietly. (This is also why calendars have no unarchive-on-match rule, unlike
   * resources' CQ-4: with no match path there is nothing to unarchive. An archived calendar still holds
   * its name — archiving deliberately does not free it — so it is disambiguated around like any other.)
   *
   * Names are checked **per tier**, because uniqueness is per tier: `uq_calendars_org_name` for `ORG`,
   * `uq_calendars_project_name` for `PROJECT`. One indexed query per tier present in the graph, plus
   * in-memory bookkeeping — so two source calendars sharing a name inside ONE file also disambiguate
   * against each other rather than colliding at insert time.
   */
  /**
   * The resource-name collisions this graph would hit, so the dry-run can ask before the commit runs.
   *
   * Identity is **code first**: a source resource whose `code` matches a library row is that row, and
   * reusing it needs no question — a code is an identifier, and matching one is not a guess. The
   * collision case is narrower and is what used to fail: the code matches nothing (or the file has
   * none) while the **name** is already taken. That is genuinely ambiguous — a "Supervisor" on a
   * 4-day specialist calendar is not necessarily your "Supervisor" — and it is exactly the shape the
   * org-unique `uq_resources_org_name` refuses at insert.
   *
   * Archived rows count. Archive is orthogonal to soft delete (ADR-0053 §4), so an archived row still
   * holds its name against the unique index; omitting it here would report no collision and then fail
   * the commit anyway, which is the behaviour this method exists to remove.
   *
   * One indexed query, mirroring `resolveImportCalendarNames`: the dry-run probes outside any
   * transaction and the commit re-probes inside its own, which is the authoritative pass.
   */
  private async findResourceCollisions(
    db: Prisma.TransactionClient,
    organizationId: string,
    graph: ImportGraph,
  ): Promise<ResourceCollision[]> {
    if (graph.resources.length === 0) return [];
    const codes = graph.resources.map((r) => r.code).filter((c): c is string => c !== null);
    const names = graph.resources.map((r) => r.name);
    const existing = await db.resource.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [...(codes.length > 0 ? [{ code: { in: codes } }] : []), { name: { in: names } }],
      },
      select: { id: true, code: true, name: true, archivedAt: true },
    });
    return this.findGraphResourceCollisions(graph, existing);
  }

  /**
   * The pure half of {@link findResourceCollisions}: given the library rows that could possibly match,
   * which source rows are genuinely ambiguous. **The commit calls this too**, against its own in-transaction
   * probe — one function, so the set of questions the dry-run asks and the set the commit demands answers
   * for cannot drift apart. (Two implementations of "is this a collision" would disagree in exactly one
   * place: a commit refusing a resolution the planner was never shown.)
   */
  private findGraphResourceCollisions(
    graph: ImportGraph,
    existing: readonly { id: string; code: string | null; name: string; archivedAt: Date | null }[],
  ): ResourceCollision[] {
    const byCode = new Map(
      existing.filter((r) => r.code !== null).map((r) => [r.code as string, r] as const),
    );
    const byName = new Map(existing.map((r) => [r.name, r] as const));

    const collisions: ResourceCollision[] = [];
    // Names claimed by earlier source rows in THIS file, so two source resources sharing a name do not
    // both report a collision against the library and then collide with each other on insert. The
    // commit's loop mirrors this with `resolvedIdByName`.
    const claimed = new Set<string>();
    for (const resource of graph.resources) {
      if (resource.code !== null && byCode.has(resource.code)) {
        claimed.add(resource.name); // identity match — no question, but the name is now spoken for
        continue;
      }
      if (claimed.has(resource.name)) continue; // this file already decided about this name
      claimed.add(resource.name);
      const clash = byName.get(resource.name);
      if (clash === undefined) continue;
      collisions.push({
        resourceKey: resource.key,
        name: resource.name,
        code: resource.code,
        existing: {
          id: clash.id,
          name: clash.name,
          code: clash.code,
          archived: clash.archivedAt !== null,
        },
      });
    }
    return collisions;
  }

  /**
   * A free name for each `CREATE_COPY` answer — the name the copy is actually created under.
   *
   * The probe is by PREFIX, not by the base names, because the case that matters is the same file
   * imported twice on the same day: the base name is taken by the library AND the first candidate is
   * taken by the previous copy. Probing base names alone would return a candidate that already exists
   * and abort the whole transaction on a `P2002` the import could never resolve.
   */
  private async resolveImportResourceCopyNames(
    db: Prisma.TransactionClient,
    organizationId: string,
    copies: readonly ResourceCollision[],
  ): Promise<Map<string, string>> {
    const nameByKey = new Map<string, string>();
    if (copies.length === 0) return nameByKey;
    const taken = await this.resources.findTakenNamesWithPrefixes(
      { organizationId, prefixes: [...new Set(copies.map((c) => c.name))] },
      db,
    );
    const today = new Date().toISOString().slice(0, 10);
    for (const copy of copies) {
      const name = this.disambiguateImportedName(copy.name, taken, today, RESOURCE_NAME_MAX_LENGTH);
      taken.add(name); // claim it, so two copies of one name get different variants
      nameByKey.set(copy.resourceKey, name);
    }
    return nameByKey;
  }

  private async resolveImportCalendarNames(
    db: Prisma.TransactionClient,
    project: { id: string; organizationId: string },
    graph: ImportGraph,
  ): Promise<{ nameByKey: Map<string, string>; findings: ReportFinding[] }> {
    const nameByKey = new Map<string, string>();
    const findings: ReportFinding[] = [];
    if (graph.calendars.length === 0) return { nameByKey, findings };

    // The names already taken, per tier — one query per tier actually present in the graph.
    const takenByScope = new Map<ImportCalendarScope, Set<string>>();
    for (const scope of ['ORG', 'PROJECT'] as const) {
      const names = graph.calendars.filter((c) => c.scope === scope).map((c) => c.name);
      if (names.length === 0) continue;
      takenByScope.set(
        scope,
        await this.calendars.findTakenNames(
          {
            organizationId: project.organizationId,
            scope,
            projectId: scope === 'PROJECT' ? project.id : null,
            names,
          },
          db,
        ),
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    for (const calendar of graph.calendars) {
      const taken = takenByScope.get(calendar.scope) ?? new Set<string>();
      const name = this.disambiguateCalendarName(calendar.name, taken, today);
      // Claim it, so a second source calendar with the same name gets the next free variant.
      taken.add(name);
      takenByScope.set(calendar.scope, taken);
      nameByKey.set(calendar.key, name);
      if (name !== calendar.name) {
        findings.push({
          kind: 'repair',
          entity: 'calendar',
          sourceRef: calendar.key,
          detail: `calendar “${calendar.name}” was created as “${name}”`,
          reason:
            'a calendar of that name already exists here; an import never reuses one, because two ' +
            'calendars sharing a name can have different working weeks (ADR-0053 §5)',
        });
      }
    }
    return { nameByKey, findings };
  }

  /**
   * The first free variant of `name` in `taken`: the name itself, else `"<name> (imported <date>)"`,
   * else the same with an incrementing ordinal. Bounded by the candidate count, and each candidate is
   * clipped to the calendars API's own name ceiling (the suffix is preserved — it is what makes the
   * name unique — so the BASE is what gives way).
   */
  private disambiguateCalendarName(
    name: string,
    taken: ReadonlySet<string>,
    today: string,
  ): string {
    return this.disambiguateImportedName(name, taken, today, CALENDAR_NAME_MAX_LENGTH);
  }

  /**
   * Shared by the calendar path (always disambiguates — an import never reuses a calendar) and the
   * resource `CREATE_COPY` path (disambiguates only when the planner asked for a separate copy).
   */
  private disambiguateImportedName(
    name: string,
    taken: ReadonlySet<string>,
    today: string,
    maxLength: number,
  ): string {
    if (!taken.has(name)) return name;
    // One attempt per already-taken name, plus one — so a free variant is always reachable.
    for (let ordinal = 1; ordinal <= taken.size + 1; ordinal += 1) {
      const suffix = IMPORTED_NAME_SUFFIX(today, ordinal);
      const room = maxLength - suffix.length - 1;
      const base = room > 0 ? name.slice(0, room).trimEnd() : '';
      const candidate = base.length > 0 ? `${base} ${suffix}` : suffix;
      if (!taken.has(candidate)) return candidate;
    }
    // Unreachable (the loop tries more variants than there are taken names); fail loud rather than
    // insert a name that would abort the whole transaction on the unique index.
    throw new ConflictError('Could not find a free name for an imported record.', {
      reason: INTERCHANGE_ERROR.INCONSISTENT_GRAPH,
    });
  }

  /**
   * Defence-in-depth for the ADR-0053 §2 resource rule: a resource may only hold an ORG calendar. The
   * pure mapper forces every resource-held calendar to ORG, so this can only fire on a regression —
   * and when it does, it must roll the whole transaction back rather than create a resource bound to a
   * project calendar (a row `assertCalendarUsableBy` would refuse at every other seam).
   */
  private assertResourceCalendarIsOrgScoped(
    calendarKey: string | null,
    calendarScopeByKey: ReadonlyMap<string, ImportCalendarScope>,
  ): void {
    if (calendarKey === null) return;
    if (calendarScopeByKey.get(calendarKey) === 'ORG') return;
    throw new ValidationError(
      'An imported resource references a project-scoped calendar, which a resource cannot hold.',
      { reason: INTERCHANGE_ERROR.INCONSISTENT_GRAPH },
    );
  }

  /**
   * Best-effort compensation for a phase-2 recalc failure (a failure after the graph transaction has
   * committed). Hard-deletes the just-created rows — which no caller has observed (the plan id is only
   * returned on success) — in FK-safe order so the "nothing is created on failure" contract holds. This
   * is cleanup of our own brand-new, not-yet-surfaced data, never a user-facing delete.
   */
  /**
   * Lay the freshly-imported plan out in lanes, using the SAME packer the canvas's Auto-arrange uses
   * (`packLanes`, `@repo/layout`).
   *
   * **The defect this closes.** An import assigned `laneIndex` = the activity's position in the
   * source file, so a 500-activity programme opened as 500 lanes holding one bar each. Nothing was
   * wrong with the data; the picture was simply unreadable, on the one screen that forms a planner's
   * first impression of a schedule they have just brought over from P6.
   *
   * **Why the shared packer rather than a server-side one.** A second implementation would agree
   * with the canvas on the day it was written and drift afterwards, and the drift would be invisible
   * — each diagram looks plausible alone, and only someone comparing an imported plan against the
   * same plan after pressing Auto-arrange would ever see them disagree. Sharing it also means the
   * predecessor hint (which keeps a logic line from running twelve lanes up the screen and back
   * down) applies to imports for free, which is the shape a programme most needs it in.
   *
   * Activities with no computed dates are **skipped, not packed into lane 0**: an uncalculated
   * activity is not drawn, so it has no span to pack, and collapsing them all into one lane would
   * invent an overlap the moment they gained dates.
   */
  private async packImportedLanes(
    principal: Principal,
    organizationId: string,
    planId: string,
  ): Promise<void> {
    const [activities, dependencies] = await Promise.all([
      this.activities.findLayoutRowsForPlan(organizationId, planId),
      this.dependencies.findEdgesForPlan(organizationId, planId),
    ]);

    // Day offsets about an arbitrary but FIXED origin. The packer only ever compares offsets to each
    // other, so the origin cancels — what matters is that both ends of every span use the same one.
    const DAY_MS = 86_400_000;
    const items = activities.flatMap((activity) =>
      activity.earlyStart === null || activity.earlyFinish === null
        ? []
        : [
            {
              id: activity.id,
              startDay: Math.round(activity.earlyStart.getTime() / DAY_MS),
              endDay: Math.round(activity.earlyFinish.getTime() / DAY_MS),
              laneIndex: activity.laneIndex,
            },
          ],
    );
    if (items.length === 0) return;

    const predecessorsOf = new Map<string, string[]>();
    for (const edge of dependencies) {
      const existing = predecessorsOf.get(edge.successorId);
      if (existing === undefined) predecessorsOf.set(edge.successorId, [edge.predecessorId]);
      else existing.push(edge.predecessorId);
    }

    const versionOf = new Map(activities.map((a) => [a.id, a.version] as const));
    const positions = packLanes(items, predecessorsOf).flatMap((change) => {
      const version = versionOf.get(change.id);
      return version === undefined ? [] : [{ ...change, version }];
    });
    if (positions.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      const moved = await this.activities.updateLanePositions(
        organizationId,
        planId,
        positions,
        principal.userId,
        tx,
      );
      // Same all-or-nothing rule the positions endpoint uses: a partial move is a half-laid-out
      // diagram, which is harder to read than the source order it replaced.
      if (moved !== positions.length) {
        throw new Error(
          `lane layout wrote ${String(moved)} of ${String(positions.length)} rows — rolled back`,
        );
      }
    });

    this.logger.info(
      { organizationId, planId, activities: items.length, moved: positions.length },
      'interchange commit laid out lanes',
    );
  }

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
    options: InterchangeImportOptions = {},
  ): { graph: ImportGraph; report: InterchangeReport } {
    if (!file || file.buffer.length === 0) {
      throw new ValidationError('No file was uploaded.', { reason: INTERCHANGE_ERROR.NO_FILE });
    }

    const result = importSchedule({
      content: new Uint8Array(file.buffer),
      filename: file.originalname,
      maxBytes: INTERCHANGE_MAX_UPLOAD_BYTES,
      // The pure mapper decides each calendar's TIER; this is the caller's one lever over it (ADR-0053 §5).
      ...(options.globalCalendarScope === undefined
        ? {}
        : { globalCalendarScope: options.globalCalendarScope }),
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
