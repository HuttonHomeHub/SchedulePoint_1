import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { importXer, type ImportGraph, type InterchangeReport } from '@repo/interchange';
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
import { CalendarRepository } from '../calendars/calendar.repository';
import { wouldCreateCycle } from '../dependencies/cycle-detector';
import { DependencyRepository } from '../dependencies/dependency.repository';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanRepository } from '../plans/plan.repository';
import { ProjectRepository } from '../projects/project.repository';
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
    private readonly schedule: ScheduleService,
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
    const { planId, createdCalendarIds } = await this.prisma.$transaction((tx) =>
      this.persistGraph(tx, principal, project, graph),
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
      },
      'interchange commit persisted a plan',
    );

    // Phase 2 — recalculate the new plan (ADR-0022; ScheduleService owns its own transaction + engine).
    // A recalc failure on a freshly-created, valid, acyclic graph is not expected, but honour the
    // "nothing is created on failure" contract by compensating: hard-delete the just-created rows (which
    // no caller has seen — the id is returned only on success), then rethrow.
    try {
      await this.schedule.recalculate(principal, orgSlug, planId);
    } catch (error) {
      await this.compensate(planId, createdCalendarIds);
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

    this.logger.info(
      { organizationId: organization.id, projectId: project.id, planId, userId: principal.userId },
      'interchange commit succeeded',
    );
    return { planId, report };
  }

  /**
   * Persist one import graph as a new plan inside the caller's transaction. Order is calendars →
   * plan → activities → dependencies so every foreign key resolves as it is written:
   * - **Calendars** first, materialising each source-derived `key` → the created id, so the plan default
   *   and per-activity calendars resolve. Each calendar's intraday shift windows are approximated to the
   *   calendar module's weekday-mask contract (a weekday is worked iff it has ≥1 window — richer shift
   *   calendars are not API-modelled in M1); each exception maps to a whole-day working/non-working day.
   * - The **plan**, with `plannedStart` = the source data date and its default calendar resolved.
   * - **Activities**, resolving each activity's `calendarKey` → id and assigning a **deterministic
   *   `laneIndex` = its 0-based position in the graph's activity list** (source order). This is a simple,
   *   stable M1 lane assignment; an auto-arrange pass can refine it later.
   * - **Dependencies**, resolving `predecessorKey` / `successorKey` → activity ids. The graph is already
   *   acyclic + de-duped, but the incremental `wouldCreateCycle` guard and the DB uniqueness constraint
   *   still run (defence-in-depth) — a rejection rolls the whole transaction back.
   *
   * Returns the new plan id and the created calendar ids (for the phase-2 recalc-failure compensation).
   */
  private async persistGraph(
    tx: Prisma.TransactionClient,
    principal: Principal,
    project: { id: string; organizationId: string },
    graph: ImportGraph,
  ): Promise<{ planId: string; createdCalendarIds: string[] }> {
    const stamp = { createdBy: principal.userId, updatedBy: principal.userId };
    const organizationId = project.organizationId;

    // 1. Calendars (+ their whole-day exceptions), mapping source key → created id.
    const calendarIdByKey = new Map<string, string>();
    const createdCalendarIds: string[] = [];
    for (const calendar of graph.calendars) {
      const created = await this.calendars.create(
        {
          organizationId,
          name: calendar.name,
          workingWeekdays: this.maskFromShifts(calendar.shifts),
          description: null,
          ...stamp,
        },
        tx,
      );
      calendarIdByKey.set(calendar.key, created.id);
      createdCalendarIds.push(created.id);
      for (const exception of calendar.exceptions) {
        await this.calendars.createException(
          {
            organizationId,
            calendarId: created.id,
            // The mapper emits single-day exceptions (startDate == endDate); the calendar module
            // stores a whole-day working/non-working exception (a window present ⇒ a worked day).
            date: parseCalendarDate(exception.startDate),
            isWorking: exception.windows.length > 0,
            label: exception.label,
            ...stamp,
          },
          tx,
        );
      }
    }

    // 2. The plan, with its default calendar resolved from the graph's default key.
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

    // 3. Activities, mapping source key → created id and assigning a deterministic lane per source order.
    const activityIdByKey = new Map<string, string>();
    let laneIndex = 0;
    for (const activity of graph.activities) {
      const created = await this.activities.create(
        {
          organizationId,
          planId: plan.id,
          code: activity.code,
          name: activity.name,
          type: activity.type,
          // Durations arrive as working-minutes (ADR-0036); a milestone is 0 (already normalised).
          durationMinutes: activity.durationMinutes,
          calendarId: this.resolveCalendarId(activity.calendarKey, calendarIdByKey),
          laneIndex,
          ...stamp,
        },
        tx,
      );
      activityIdByKey.set(activity.key, created.id);
      laneIndex += 1;
    }

    // 4. Dependencies, resolving endpoints and running the acyclicity guard incrementally.
    const edges: { predecessorId: string; successorId: string }[] = [];
    for (const dependency of graph.dependencies) {
      const predecessorId = activityIdByKey.get(dependency.predecessorKey);
      const successorId = activityIdByKey.get(dependency.successorKey);
      if (!predecessorId || !successorId) {
        // Defensive: the pure pipeline guarantees every endpoint resolves. If it somehow does not,
        // fail loud so the whole transaction rolls back rather than silently dropping an edge.
        throw new ValidationError('The imported schedule references an unknown activity.', {
          reason: INTERCHANGE_ERROR.INCONSISTENT_GRAPH,
        });
      }
      if (wouldCreateCycle(edges, predecessorId, successorId)) {
        // Defensive: the graph is guaranteed acyclic (Task 1.3). If a cycle slipped through, reject
        // and roll back rather than persist a graph that would break the DAG invariant (ADR-0021).
        throw new ConflictError('The imported schedule contains a dependency cycle.', {
          reason: INTERCHANGE_ERROR.INCONSISTENT_GRAPH,
        });
      }
      await this.dependencies.create(
        {
          organizationId,
          planId: plan.id,
          predecessorId,
          successorId,
          type: dependency.type,
          lagMinutes: dependency.lagMinutes,
          ...stamp,
        },
        tx,
      );
      edges.push({ predecessorId, successorId });
    }

    return { planId: plan.id, createdCalendarIds };
  }

  /**
   * Best-effort compensation for a phase-2 recalc failure (a failure after the graph transaction has
   * committed). Hard-deletes the just-created rows — which no caller has observed (the plan id is only
   * returned on success) — in FK-safe order so the "nothing is created on failure" contract holds. This
   * is cleanup of our own brand-new, not-yet-surfaced data, never a user-facing delete.
   */
  private async compensate(planId: string, calendarIds: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Children before parents, and the plan before its calendars (plan/activity → calendar is RESTRICT).
      await tx.activityDependency.deleteMany({ where: { planId } });
      await tx.activity.deleteMany({ where: { planId } });
      await tx.plan.deleteMany({ where: { id: planId } });
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

    const result = importXer({
      content: new Uint8Array(file.buffer),
      filename: file.originalname,
      caps: { maxBytes: INTERCHANGE_MAX_UPLOAD_BYTES },
    });

    if (!result.ok) {
      // A structural impossibility (not XER / malformed / no PROJECT). The pure pipeline's code/message
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
