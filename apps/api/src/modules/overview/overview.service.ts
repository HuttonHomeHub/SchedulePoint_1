import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { ForbiddenError } from '../../common/errors/domain-errors';
import { AppConfigService } from '../../config/app-config.service';
import { BaselineRepository } from '../baselines/baseline.repository';
import { OrganizationsService } from '../organizations/organizations.service';
import { EmptyWorkingTimeCalendarError } from '../schedule/engine/errors';
import { buildPlanCalendar } from '../schedule/plan-calendar';

import type {
  AttentionDto,
  HeldLockDto,
  OverviewActor,
  OverviewResponseDto,
  PlanStandingDto,
  RecentPlanDto,
  RecentlyChangedPlanDto,
} from './dto/overview-response.dto';
import { OverviewRepository, type PlanStandingRow } from './overview.repository';
import { baselineMovementOf, flagsOf } from './plan-standing';

/**
 * How many plans "Recently changed" carries. Eight, because the section is a way back into
 * work and not a feed — the ninth entry is what the Project Explorer is for.
 */
const RECENTLY_CHANGED_LIMIT = 8;

/**
 * How many held pens the attention section will list. A planner holding more than this has
 * a different problem, and the list is a prompt rather than an inventory.
 */
const HELD_LOCKS_LIMIT = 10;

/**
 * How far ahead of a retention deadline something counts as "expiring".
 *
 * Seven days, so the warning arrives with a working week left to act in. It is deliberately
 * NOT derived from `retentionHierarchyDays`: a proportion of the period would give a host
 * running a 3,650-day retention a warning window measured in years.
 */
const EXPIRY_WARNING_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The calendar port, named through `buildPlanCalendar`'s own return rather than by importing
 * `WorkingTimeCalendar` from `schedule/engine/`. The type would be harmless at runtime; the import
 * would put the whole engine one autocomplete away in the file whose job is to keep it out.
 */
type PlanCalendarPort = ReturnType<typeof buildPlanCalendar>;

/** All-minutes-work — a plan with no calendar, exactly as a recalculation resolves it (ADR-0024). */
const ALL_MINUTES: PlanCalendarPort = buildPlanCalendar(null);

/**
 * The organisation overview — the first screen after sign-in.
 *
 * **Every read is gated on the caller's own permission BEFORE it is issued**, never issued
 * and then filtered out of the response. Filtering afterwards would be correct and the cost
 * would still be paid, and the next refactor to touch the projection could leak it. So the
 * shape of this service is: resolve the scope, assert the hierarchy read, then decide which
 * of the remaining reads this caller has earned and issue only those.
 *
 * The two attention counts are **omitted** rather than zeroed for readers who may not see
 * them. A zero is a fact about the organisation; an absence is a fact about the reader.
 */
@Injectable()
export class OverviewService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly repo: OverviewRepository,
    /**
     * **Not a third copy of the calendar projection.** Two byte-identical loaders already exist
     * (`ScheduleRepository.loadPlanCalendar` and this one, whose own comment says so), and a third
     * written for this screen would be free to drift in exactly the way ADR-0065 and ADR-0121
     * record: each looks right alone, and only somebody comparing the landing's movement against
     * the revision panel's would ever see one is wrong. `BaselinesModule` is imported rather than
     * `ScheduleModule` for two reasons — it exports the repository ALONE (least privilege, §14,
     * where `ScheduleModule` would also put `ScheduleService` in reach), and this frame IS the
     * revision comparison's frame, so reading it through the baselines loader is reading the same
     * rows the number it must agree with was derived from.
     */
    private readonly baselines: BaselineRepository,
    private readonly appConfig: AppConfigService,
    @InjectPinoLogger(OverviewService.name) private readonly logger: PinoLogger,
  ) {}

  async get(
    principal: Principal,
    orgSlug: string,
    recentPlanIds: readonly string[] = [],
  ): Promise<OverviewResponseDto> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);

    // The representative hierarchy read, matching the recycle bin: any member who can
    // browse the tree can see where the work is.
    this.assertCan(principal, 'client:read', organization.id);

    const mayReadInvitations = principal.can('invitation:read', organization.id);
    // "Writer" for the expiring-deleted count is the permission that would let them do
    // something about it — a reader who cannot restore has no action behind the number.
    const mayRestore = principal.can('plan:delete', organization.id);
    // **Gated before the read is issued, not after it returns.** Issuing and then filtering would
    // be correct today and would still pay the cost, and the next refactor to touch the projection
    // could leak it — the shape this whole service is built to avoid (ADR-0098).
    const mayReadSchedule = principal.can('schedule:read', organization.id);
    const retentionArmed = this.appConfig.retentionHierarchyEnabled;

    const expiryCutoff = new Date(
      Date.now() - (this.appConfig.retentionHierarchyDays - EXPIRY_WARNING_DAYS) * MS_PER_DAY,
    );

    const [
      recentlyChanged,
      heldLocks,
      hasClients,
      hasPlans,
      invitationCounts,
      expiringDeleted,
      recentPlanRows,
    ] = await Promise.all([
      this.repo.findRecentlyChanged({
        organizationId: organization.id,
        take: RECENTLY_CHANGED_LIMIT,
      }),
      this.repo.findHeldLocks({
        organizationId: organization.id,
        userId: principal.userId,
        take: HELD_LOCKS_LIMIT,
      }),
      this.repo.hasActiveClients(organization.id),
      this.repo.hasActivePlans(organization.id),
      mayReadInvitations ? this.repo.countInvitations(organization.id) : Promise.resolve(null),
      mayRestore && retentionArmed
        ? this.repo.countExpiringDeleted({
            organizationId: organization.id,
            before: expiryCutoff,
          })
        : Promise.resolve(null),
      // Rides on the request the screen is already making — the constraint that made this
      // section acceptable on the coldest path in the product (ADR-0098 §4.9). It is gated on
      // the same `client:read` asserted above: the ids name plans, and a member who can browse
      // the tree can see a plan's name.
      this.repo.resolveRecentPlans({
        organizationId: organization.id,
        planIds: recentPlanIds,
      }),
    ]);

    // One batched resolution for every actor id on the page — the changed-by of each plan
    // and the requester of each held pen — so the number of round trips does not grow with
    // the number of rows.
    const actorIds = [
      ...recentlyChanged.map((row) => row.changedByUserId),
      ...heldLocks.map((lock) => lock.requestedByUserId),
    ].filter((id): id is string => id !== null);

    // **In the same wave as the name resolution, which was already serial.** The standing read
    // needs the recently-changed ids, so it cannot join the first `Promise.all` — but it can share
    // the second, which makes it cost no extra round trip of latency rather than one.
    const [names, standingRows] = await Promise.all([
      this.repo.resolveMemberNames({
        organizationId: organization.id,
        userIds: actorIds,
      }),
      mayReadSchedule
        ? this.repo.findPlanStanding({
            organizationId: organization.id,
            planIds: recentlyChanged.map((row) => row.planId),
          })
        : Promise.resolve(null),
    ]);

    /**
     * **In "Recently changed"'s order, not the database's.**
     *
     * `findPlanStanding` filters on `id = ANY(...)` with no `ORDER BY`, so its order is whatever
     * the plan happens to produce — and Postgres makes no promise it is stable between two
     * executions of the same query. Left alone, this section would reshuffle on reload for no
     * visible reason, which is the defect `resolveRecentPlans` already carries a comment about one
     * section down.
     *
     * Ordering it by the recently-changed list rather than by anything of its own is the stronger
     * choice: the reader has just read that order, the two sections are about the same plans, and a
     * second ordering rule would be a second opinion about which work matters most.
     */
    const standingById = new Map((standingRows ?? []).map((row) => [row.planId, row]));
    const orderedStanding = recentlyChanged
      .map((row) => standingById.get(row.planId))
      .filter((row): row is PlanStandingRow => row !== undefined);

    const planStanding =
      standingRows === null ? null : await this.toStanding(organization.id, orderedStanding);

    const attention: AttentionDto = {
      heldLocks: heldLocks
        .map((lock): HeldLockDto => ({
          planId: lock.planId,
          planName: lock.planName,
          requestedBy:
            lock.requestedByUserId === null ? null : this.toActor(lock.requestedByUserId, names),
        }))
        // A pen somebody is waiting for outranks one nobody has asked about — that is the
        // only item on this screen with another person blocked behind it.
        .sort((a, b) => Number(b.requestedBy !== null) - Number(a.requestedBy !== null)),
      // **Both fields appear together or neither does.** They are one permission and one read, so
      // emitting one without the other would let a reader see "3 have expired" with no idea whether
      // any are live — a fact that reads as worse news than it is. ADR-0098's omit-never-zero rule
      // applies to the PAIR, which is why this is one spread rather than two.
      ...(invitationCounts !== null
        ? {
            liveInvitationCount: invitationCounts.live,
            expiredInvitationCount: invitationCounts.expired,
          }
        : {}),
      ...(expiringDeleted !== null ? { expiringDeletedCount: expiringDeleted } : {}),
    };

    // **The caller's order, not the database's.** The order is the browser's own recency, which
    // the server has no basis to improve on — and `findMany` makes no promise about the order of
    // an `IN`, so leaving it would produce a list that reshuffles for no visible reason.
    const byId = new Map(recentPlanRows.map((row) => [row.planId, row]));
    const recentPlans: RecentPlanDto[] = recentPlanIds
      .map((id) => byId.get(id))
      .filter((row): row is RecentPlanDto => row !== undefined);

    return {
      organisationName: organization.name,
      isNewOrganisation: !hasClients,
      hasPlans,
      recentlyChanged: recentlyChanged.map((row): RecentlyChangedPlanDto => ({
        planId: row.planId,
        planName: row.planName,
        projectId: row.projectId,
        projectName: row.projectName,
        clientName: row.clientName,
        status: row.status,
        changedAt: row.changedAt.toISOString(),
        scheduleComputedAt: row.scheduleComputedAt?.toISOString() ?? null,
        editedSinceCalculated: row.editedSinceCalculated,
        changedBy: this.toActor(row.changedByUserId, names),
      })),
      recentPlans,
      attention,
      // **Omitted for a reader who may not have it, present-and-possibly-empty for one who may.**
      // The two states are different facts — "you cannot see this" and "there is nothing to see" —
      // and an empty array collapses the first into the second (ADR-0098's omit-never-zero rule,
      // at section granularity).
      ...(planStanding !== null ? { planStanding } : {}),
    };
  }

  /**
   * Compose each plan's standing, resolving every distinct calendar ONCE.
   *
   * Eight plans on this screen, and measured against the deployed database seven distinct calendars
   * serve 4,032 plans — so the dedupe is the difference between a handful of reads and one per row.
   * That was measured before this frame was committed to, against the 156.8 ms of headroom M0
   * recorded at the worst shape (M0-T6).
   *
   * **What each remaining read costs was understated here, and the M6 backend review corrected it.**
   * This said "an index scan on the primary key (0.06 ms) plus a four-page scan of a hundred-row
   * table (0.11 ms)" — two reads. `loadPlanCalendar` is a Prisma `findFirst` with nested selects on
   * shifts and on exceptions (which themselves nest windows), and `schema.prisma` enables no
   * `relationJoins` preview feature, so Prisma's default strategy issues it as **three to four
   * small queries per calendar**, not two. The conclusion is unchanged — they are bounded by the
   * number of DISTINCT calendars rather than by rows, capped at eight, and run in parallel — but
   * the figure was a floor presented as the whole cost.
   */
  private async toStanding(
    organizationId: string,
    rows: readonly PlanStandingRow[],
  ): Promise<PlanStandingDto[]> {
    const calendarIds = [
      ...new Set(rows.map((row) => row.planCalendarId).filter((id): id is string => id !== null)),
    ];

    const ports = new Map<string, PlanCalendarPort | null>();
    await Promise.all(
      calendarIds.map(async (calendarId) => {
        ports.set(calendarId, await this.loadCalendarPort(organizationId, calendarId));
      }),
    );

    return rows.map((row): PlanStandingDto => {
      return {
        planId: row.planId,
        planName: row.planName,
        projectName: row.projectName,
        clientName: row.clientName,
        status: row.status,
        activityCount: row.activityCount,
        projectFinish: row.projectFinish,
        scheduleComputedAt: row.scheduleComputedAt?.toISOString() ?? null,
        editedSinceCalculated: row.editedSinceCalculated,
        baselineMovement: baselineMovementOf(row, this.frameFor(row, ports)),
        flags: flagsOf(row),
      };
    });
  }

  /**
   * One plan's measurement frame — **the revision comparison's frame, not a second one**: working
   * time on the PLAN's calendar divided by the BASELINE's frozen hours-per-day factor
   * (`schedule.service.ts:1758-1761`, ADR-0125 D4 and ADR-0068). Two numbers on one product derived
   * on different calendars is a worse defect than any residual in either, so this is the same
   * arithmetic rather than an equivalent-looking one.
   *
   * It returns `null` — never a number in some other frame — whenever it cannot measure: the
   * calendar would not build, the walk exceeded the engine's horizon, or the baseline froze no
   * usable factor. The alternative shapes were both worse, and the reasoning is at the call site in
   * `plan-standing.ts`.
   */
  private frameFor(
    row: PlanStandingRow,
    ports: ReadonlyMap<string, PlanCalendarPort | null>,
  ): (from: string, to: string) => number | null {
    // A plan with no calendar schedules on all-minutes-work, exactly as a recalculation does — the
    // legitimate fallback, not an unusable calendar.
    const port =
      row.planCalendarId === null ? ALL_MINUTES : (ports.get(row.planCalendarId) ?? null);
    const factor = row.baselineHoursPerDayMinutes;

    if (port === null || factor === null || factor <= 0) return () => null;

    return (from, to) => {
      try {
        return Math.round(port.workingTimeBetween(from, to) / factor);
      } catch {
        // `WorkingTimeHorizonExceededError` — a calendar with working time placed where the walk
        // cannot reach it (`docs/TECH_DEBT.md` #205(b)). Swallowed HERE, per plan, because the
        // alternative is that one plan of eight takes down the first screen after sign-in.
        return null;
      }
    };
  }

  /**
   * Build one calendar's port, or `null` if it cannot be built.
   *
   * **The `try`/`catch` is the load-bearing part**, and it is what keeps a per-row fault per-row:
   * `buildWorkingTimeCalendar` throws when a calendar has no working minute at all, which is
   * reachable from ordinary input (`docs/TECH_DEBT.md` #79 — a window-only base week is accepted at
   * the DTO), and without the catch one plan among eight on an emptied calendar answers the
   * organisation's landing — the first screen after sign-in, for every member — with a 500.
   * Verified by removing it: the case below goes red with `EmptyWorkingTimeCalendarError`.
   *
   * `buildPlanCalendar` rather than `buildPlanCalendarOrReject` is the smaller half, and the honest
   * note is that **it is not what prevents the 422**: swapping the rejecting wrapper back in leaves
   * every test here green, because this catch swallows its `ValidationError` too. What the plain
   * builder buys is not constructing an error this code would immediately discard, and saying at
   * the call site that no 422 is intended. The wrapper is right where it is used — a planner
   * recalculating THAT plan should be told which calendar to fix.
   */
  private async loadCalendarPort(
    organizationId: string,
    calendarId: string,
  ): Promise<PlanCalendarPort | null> {
    const calendar = await this.baselines.loadPlanCalendar(organizationId, calendarId);
    try {
      // A missing or soft-deleted calendar reads `null` and falls back to all-minutes-work, which
      // is what every other seam does with it.
      return buildPlanCalendar(calendar);
    } catch (error) {
      // **Everything is caught and the MESSAGE is what narrows, not the catch.** Rethrowing
      // anything unrecognised would 500 the first screen after sign-in over one plan's calendar,
      // which is the trade this whole path exists to refuse — so the availability guarantee is
      // kept. What the bare version got wrong is that it asserted a diagnosis: every failure was
      // logged as "has no working time", including one that is not that, which would send a reader
      // of the logs to the wrong place. `EmptyWorkingTimeCalendarError` is the documented case
      // (TECH_DEBT #79's window-only base week); anything else is a real defect and now says so at
      // a level that matches. Raised by the M6 backend review.
      const expected = error instanceof EmptyWorkingTimeCalendarError;
      const context = { organizationId, calendarId, err: error };
      if (expected) {
        this.logger.warn(context, 'plan calendar has no working time; movement not assessable');
      } else {
        this.logger.error(context, 'plan calendar could not be built; movement not assessable');
      }
      return null;
    }
  }

  /**
   * Three outcomes, kept apart on purpose: a name we resolved, an id that is nobody in this
   * organisation's current membership, and no id at all. Collapsing the last two into a
   * nullable name would give the reader an absence they cannot tell from a defect.
   */
  private toActor(userId: string | null, names: Map<string, string>): OverviewActor {
    if (userId === null) return { kind: 'UNKNOWN' };
    const name = names.get(userId);
    return name === undefined ? { kind: 'FORMER_MEMBER' } : { kind: 'MEMBER', name };
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
