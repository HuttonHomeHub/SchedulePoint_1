import { Injectable } from '@nestjs/common';
import type { Activity, Plan } from '@prisma/client';
import { exportXer, type ExportGraph, type InterchangeReport } from '@repo/interchange';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors/domain-errors';
import { formatCalendarDate } from '../../common/validation/calendar-date';
import { ActivityRepository } from '../activities/activity.repository';
import { CalendarRepository, type CalendarWithExceptions } from '../calendars/calendar.repository';
import { DependencyRepository, type ExportEdge } from '../dependencies/dependency.repository';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanRepository } from '../plans/plan.repository';
import { ResourceAssignmentRepository } from '../resources/resource-assignment.repository';
import { ResourceRepository } from '../resources/resource.repository';

import { INTERCHANGE_EXPORT } from './interchange-permissions';

/** Machine-readable reasons carried in an export {@link ValidationError}'s `details.reason`. */
export const EXPORT_ERROR = {
  /** The requested `format` is not one this milestone can export (M4a serialises XER only). */
  UNSUPPORTED_FORMAT: 'EXPORT_UNSUPPORTED_FORMAT',
  /** The plan is past the shared graph-size ceiling (mirrors the import limit). */
  TOO_LARGE: 'EXPORT_TOO_LARGE',
  /** The assembled graph is internally inconsistent. Unreachable for trusted domain data — a defensive
   * backstop that mirrors the import `INCONSISTENT_GRAPH` handling. */
  INCONSISTENT_GRAPH: 'EXPORT_INCONSISTENT_GRAPH',
} as const;

/** The one interchange format M4a can serialise. */
const XER_FORMAT = 'xer';

/** The result of a successful export: the file bytes, a safe download filename, and the honest report. */
export interface ExportResult {
  readonly bytes: Uint8Array;
  readonly filename: string;
  readonly report: InterchangeReport;
}

/**
 * The **read-side of schedule interchange** (ADR-0050 M4a): a thin, READ-ONLY NestJS surface over the pure
 * `@repo/interchange` exporter. It is the mirror of {@link InterchangeService} on the write side, deliberately
 * kept in its own service so the read path (no transaction, no engine, no persistence) never entangles with
 * the transactional import.
 *
 * {@link exportPlan} resolves the org from the caller's own memberships (anti-IDOR), asserts the
 * `interchange:export` capability (held by every member — export reads on-screen-readable schedule data),
 * scopes the target plan to that org (anti-IDOR), reads the plan's **core network** (plan + calendars +
 * activities + dependencies, plus the resources/assignments the exporter reports as out-of-M4a-scope drops)
 * into an {@link ExportGraph}, and hands it to the pure `exportXer`. Nothing is written — the CPM engine and
 * the recalc parity golden suite are untouched.
 */
@Injectable()
export class ExportService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly plans: PlanRepository,
    private readonly calendars: CalendarRepository,
    private readonly activities: ActivityRepository,
    private readonly dependencies: DependencyRepository,
    private readonly resources: ResourceRepository,
    private readonly assignments: ResourceAssignmentRepository,
    @InjectPinoLogger(ExportService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Export a plan as a foreign schedule file. Throws {@link ValidationError} (422 `EXPORT_UNSUPPORTED_FORMAT`)
   * for a non-XER format, {@link NotFoundError} (404) when the org/plan is not the caller's (anti-IDOR),
   * {@link ForbiddenError} (403) without the capability, and {@link ValidationError} (422) when the pure
   * exporter rejects the assembled graph (size ceiling / defensive inconsistency backstop).
   */
  async exportPlan(
    principal: Principal,
    orgSlug: string,
    planId: string,
    format: string,
  ): Promise<ExportResult> {
    // Only XER for M4a. Reject an unknown format before any read (a cheap, side-effect-free guard).
    if (format !== XER_FORMAT) {
      throw new ValidationError(`Unsupported export format "${format}". Only "xer" is supported.`, {
        reason: EXPORT_ERROR.UNSUPPORTED_FORMAT,
      });
    }

    // Org scope from the caller's OWN memberships (anti-IDOR: a non-member 404s the org).
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, INTERCHANGE_EXPORT, organization.id);

    // Anti-IDOR: the target plan must be an active plan in the caller's resolved org.
    const plan = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!plan) throw new NotFoundError('Plan not found.');

    const graph = await this.readGraph(organization.id, plan);

    const result = exportXer({ graph });
    if (!result.ok) {
      // The graph is assembled from trusted domain rows, so a reject is either the shared size ceiling
      // (a real, user-safe "too large") or the defensive schema backstop (should be unreachable).
      this.logger.warn(
        {
          organizationId: organization.id,
          planId,
          userId: principal.userId,
          stage: result.error.stage,
          code: result.error.code,
        },
        'interchange export rejected the assembled graph',
      );
      throw new ValidationError(result.error.message, {
        reason:
          result.error.stage === 'limit' ? EXPORT_ERROR.TOO_LARGE : EXPORT_ERROR.INCONSISTENT_GRAPH,
        code: result.error.code,
      });
    }

    const filename = `${slugify(plan.name)}.xer`;
    this.logger.info(
      {
        organizationId: organization.id,
        planId,
        userId: principal.userId,
        format,
        mapped: result.report.mapped,
        approximations: result.report.approximations.length,
        repairs: result.report.repairs.length,
        drops: result.report.drops.length,
      },
      'interchange export produced a file',
    );
    return { bytes: result.bytes, filename, report: result.report };
  }

  /**
   * Read a plan's core network into an {@link ExportGraph} — the mirror of the import commit's
   * {@link InterchangeService.persistGraph}. Every read is org-scoped and excludes soft-deletes, and every
   * cross-reference (default calendar, activity/resource calendar, WBS parent, dependency endpoints,
   * assignment endpoints) resolves by domain id, so the exporter needs no database access. Calendars are
   * loaded by the id SET the plan actually uses (plan default + each activity's + each resource's own),
   * batched — never a query-per-calendar. Resources/assignments are read too so the exporter reports them
   * as out-of-M4a-scope drops honestly (their counts feed `report.drops`); constraints, progress and WBS
   * parentage are read from the same activity rows for the same reason.
   */
  private async readGraph(organizationId: string, plan: Plan): Promise<ExportGraph> {
    const [activityRows, dependencyRows, assignmentRows] = await Promise.all([
      this.activities.findAllActiveByPlan(organizationId, plan.id),
      this.dependencies.findAllActiveByPlan(organizationId, plan.id),
      this.assignments.findManyActiveByPlan(organizationId, plan.id),
    ]);

    // Resolve only the resources this plan's assignments reference (batched, org-scoped).
    const resourceIds = [...new Set(assignmentRows.map((a) => a.resourceId))];
    const resourceRows = await this.resources.findActiveByIdsInOrg(resourceIds, organizationId);

    // The calendar id SET the plan uses: its default + every activity's own + every resource's own.
    const calendarIdSet = new Set<string>();
    if (plan.calendarId !== null) calendarIdSet.add(plan.calendarId);
    for (const a of activityRows) if (a.calendarId !== null) calendarIdSet.add(a.calendarId);
    for (const r of resourceRows) if (r.calendarId !== null) calendarIdSet.add(r.calendarId);
    const calendarRows = await this.calendars.findActiveDetailByIdsInOrg(
      [...calendarIdSet],
      organizationId,
    );

    // The ids actually LOADED (a soft-deleted calendar/activity referenced by another row is not in the
    // graph) — so a dangling reference is coerced to null rather than emitted as an unresolvable key.
    const loadedCalendarIds = new Set(calendarRows.map((c) => c.id));
    const activityIds = new Set(activityRows.map((a) => a.id));

    const calendarKeyOrNull = (id: string | null): string | null =>
      id !== null && loadedCalendarIds.has(id) ? id : null;

    return {
      plan: {
        name: plan.name,
        dataDate: formatCalendarDate(plan.plannedStart),
        defaultCalendarKey: calendarKeyOrNull(plan.calendarId),
      },
      calendars: calendarRows.map((c) => this.toExportCalendar(c)),
      activities: activityRows.map((a) => ({
        key: a.id,
        // task_code is mandatory in P6 and the export schema; an activity created directly may carry no
        // code, so fall back to its id (stable, unique) rather than fail the whole export.
        code: a.code !== null && a.code.length > 0 ? a.code : a.id,
        name: a.name,
        type: toExportActivityType(a.type),
        durationMinutes: a.durationMinutes,
        calendarKey: calendarKeyOrNull(a.calendarId),
        // A WBS parent is always a same-plan active activity (the cascade soft-deletes the subtree), so it
        // is in the graph; null out defensively if the referenced row is somehow absent.
        parentKey: a.parentId !== null && activityIds.has(a.parentId) ? a.parentId : null,
        constraintType: a.constraintType,
        constraintDate: dateOrNull(a.constraintDate),
        secondaryConstraintType: a.secondaryConstraintType,
        secondaryConstraintDate: dateOrNull(a.secondaryConstraintDate),
        scheduleAsLateAsPossible: a.scheduleAsLateAsPossible,
        progress: this.toExportProgress(a),
      })),
      dependencies: dependencyRows.map((d: ExportEdge) => ({
        key: d.id,
        predecessorKey: d.predecessorId,
        successorKey: d.successorId,
        type: d.type,
        lagMinutes: d.lagMinutes,
      })),
      resources: resourceRows.map((r) => ({
        key: r.id,
        name: r.name,
        code: r.code,
        kind: r.kind,
        calendarKey: calendarKeyOrNull(r.calendarId),
        costPerUnit: decimalOrNull(r.costPerUnit),
        maxUnitsPerHour: decimalOrNull(r.maxUnitsPerHour),
      })),
      assignments: assignmentRows.map((a) => ({
        key: a.id,
        activityKey: a.activityId,
        resourceKey: a.resourceId,
        budgetedUnits: decimalToNumber(a.budgetedUnits),
        unitsPerHour: decimalOrNull(a.unitsPerHour),
        isDriving: a.isDriving,
        actualUnits: decimalToNumber(a.actualUnits),
      })),
    };
  }

  /** Map a stored calendar (weekday-minute shift rows + dated exception ranges) to an export calendar. */
  private toExportCalendar(calendar: CalendarWithExceptions): ExportGraph['calendars'][number] {
    return {
      key: calendar.id,
      name: calendar.name,
      shifts: calendar.shifts.map((s) => ({
        weekday: s.weekday,
        startMinute: s.startMinute,
        endMinute: s.endMinute,
      })),
      exceptions: calendar.exceptions.map((e) => ({
        startDate: formatCalendarDate(e.startDate),
        endDate: formatCalendarDate(e.endDate),
        label: e.label,
        windows: e.windows.map((w) => ({ startMinute: w.startMinute, endMinute: w.endMinute })),
      })),
    };
  }

  /**
   * Build the export progress object for a progressed activity, or null for an un-progressed one — mirroring
   * the import graph's `progress: null` for a NOT_STARTED activity with no actuals. An activity is treated
   * as progressed iff any progress signal is present (status moved, %-complete, an actual/remaining/
   * suspend/resume/expected date), so the exporter's drop count reflects real progress only.
   */
  private toExportProgress(a: Activity): ExportGraph['activities'][number]['progress'] {
    const hasProgress =
      a.status !== 'NOT_STARTED' ||
      a.percentComplete !== 0 ||
      a.actualStart !== null ||
      a.actualFinish !== null ||
      a.remainingDurationMinutes !== null ||
      a.suspendDate !== null ||
      a.resumeDate !== null ||
      a.expectedFinish !== null;
    if (!hasProgress) return null;
    return {
      status: a.status,
      percentComplete: a.percentComplete,
      percentCompleteType: a.percentCompleteType,
      physicalPercentComplete: a.physicalPercentComplete,
      actualStart: dateOrNull(a.actualStart),
      actualFinish: dateOrNull(a.actualFinish),
      remainingDurationMinutes: a.remainingDurationMinutes,
      suspendDate: dateOrNull(a.suspendDate),
      resumeDate: dateOrNull(a.resumeDate),
      expectedFinish: dateOrNull(a.expectedFinish),
    };
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

/** Prisma `@db.Date` → a `YYYY-MM-DD` string, or null. */
function dateOrNull(value: Date | null): string | null {
  return value === null ? null : formatCalendarDate(value);
}

/** A Prisma `Decimal` (which exposes `toNumber`) → a JS number. */
function decimalToNumber(value: { toNumber(): number }): number {
  return value.toNumber();
}

/** A nullable Prisma `Decimal` → a JS number, or null. */
function decimalOrNull(value: { toNumber(): number } | null): number | null {
  return value === null ? null : value.toNumber();
}

/**
 * Map a stored `ActivityType` to the export-graph vocabulary. HAMMOCK / LEVEL_OF_EFFORT are not part of the
 * interchange activity set (M4a) — the exporter serialises the five supported kinds — so they are coerced to
 * the nearest supported type (`TASK`), matching how the import adapter coerces the same two kinds.
 */
function toExportActivityType(type: Activity['type']): ExportGraph['activities'][number]['type'] {
  switch (type) {
    case 'START_MILESTONE':
    case 'FINISH_MILESTONE':
    case 'WBS_SUMMARY':
    case 'RESOURCE_DEPENDENT':
      return type;
    case 'TASK':
    case 'HAMMOCK':
    case 'LEVEL_OF_EFFORT':
    default:
      return 'TASK';
  }
}

/**
 * Derive a safe download filename stem from the plan name: lowercase, non-alphanumerics → `-`, collapsed
 * repeats, trimmed, with a `plan` fallback for an empty result. NEVER built from client input — the plan
 * name is trusted domain data, but slugifying still guards the `Content-Disposition` header.
 */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'plan';
}
