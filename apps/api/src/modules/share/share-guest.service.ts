import { Injectable } from '@nestjs/common';
import type { Plan } from '@prisma/client';
import type { ActivitySwimlaneLaneSummary, PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { GuestPrincipal } from '../../common/auth/guest-principal';
import { NotFoundError } from '../../common/errors/domain-errors';
import { ActivityRepository } from '../activities/activity.repository';
import { attachDayFactors } from '../activities/day-factor';
import { toDrivingCalendarMap } from '../activities/driving-calendars';
import { CalendarRepository } from '../calendars/calendar.repository';
import { CodeTypeRepository } from '../codes/code-type.repository';
import { CodeValueRepository } from '../codes/code-value.repository';
import { DependencyRepository } from '../dependencies/dependency.repository';
import { attachLagDayFactors } from '../dependencies/lag-day-factor';
import { PlanRepository } from '../plans/plan.repository';
import { ScheduleRepository } from '../schedule/schedule.repository';
import { SwimlaneRepository } from '../swimlanes/swimlane.repository';

import { GuestActivityDto } from './dto/guest-activity.dto';
import { GuestDependencyDto } from './dto/guest-dependency.dto';
import { GuestPlanViewDto } from './dto/guest-plan.dto';
import { GuestCodeRepository } from './guest-code.repository';
import {
  guestCodePlacement,
  guestCodeSwimlaneList,
  guestSwimlaneList,
  guestSwimlanePlacement,
  type GuestSwimlaneEntry,
} from './guest-swimlanes';
import { PlanShareRepository } from './plan-share.repository';

/**
 * How often the coalesced `last_accessed_at` telemetry may be written per link (ADR-0051 §7):
 * at most once per this interval. A bursty guest (or scraper) therefore causes ONE write per
 * window, not one per read.
 */
export const GUEST_ACCESS_TOUCH_STALE_MS = 5 * 60 * 1000; // 5 minutes

/** A page of guest DTOs with cursor meta — the shape the controller wraps in `Paginated`. */
export interface GuestPage<T> {
  items: T[];
  meta: PageMeta;
}

/**
 * The session-less External-Guest READ service (ADR-0051 §3/§4, F-M3) — the app's FIRST
 * unauthenticated data-read surface. It reads EXACTLY ONE plan (the token's plan) via the
 * existing org-scoped domain repositories, mapping every row to a field-stripped guest DTO.
 *
 * ANTI-IDOR BY CONSTRUCTION: every method takes ONLY the {@link GuestPrincipal} the
 * `ShareTokenGuard` resolved from the bearer token. The plan id and organisation id come
 * SOLELY from that principal (`guest.planId` / `guest.organizationId`) — never from a request
 * param, query, or body (there are none). There is no code path where caller input selects the
 * plan or org, so a guest can never reach another plan or tenant. Reads re-assert the org+plan
 * scope on every repository call (defence in depth behind the guard).
 *
 * READ-ONLY, NO ENGINE: it reads the PERSISTED CPM columns only (never invokes the CPM engine),
 * so the recalc parity gate is untouched. The single write it performs is a best-effort,
 * COALESCED `last_accessed_at` telemetry touch, fired-and-forgotten so it never blocks — or
 * fails — a read.
 */
@Injectable()
export class ShareGuestService {
  constructor(
    private readonly plans: PlanRepository,
    private readonly calendars: CalendarRepository,
    private readonly activities: ActivityRepository,
    private readonly dependencies: DependencyRepository,
    private readonly schedule: ScheduleRepository,
    private readonly swimlanes: SwimlaneRepository,
    private readonly codeTypes: CodeTypeRepository,
    private readonly codeValues: CodeValueRepository,
    private readonly guestCodes: GuestCodeRepository,
    private readonly shares: PlanShareRepository,
    @InjectPinoLogger(ShareGuestService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * The plan view: header + calendar (for the time axis) + persisted schedule summary. The plan
   * is re-loaded scoped by the token's org+plan (a uniform 404 if it is gone — defence in depth
   * behind the guard's own live-plan re-check). The calendar is loaded only when the plan has one.
   * The summary is a pure aggregate over the persisted engine columns — no recompute.
   */
  async getPlanView(guest: GuestPrincipal): Promise<GuestPlanViewDto> {
    const plan = await this.plans.findActiveByIdInOrg(guest.planId, guest.organizationId);
    if (!plan) throw this.notFound();

    const calendar = plan.calendarId
      ? await this.calendars.findActiveDetailByIdInOrg(plan.calendarId, guest.organizationId)
      : null;
    const aggregate = await this.schedule.summarise(guest.organizationId, guest.planId);
    const { entries: swimlanes, noneName } = await this.liveSwimlanes(guest, plan);

    this.touchAccess(guest.shareId);
    return GuestPlanViewDto.from({
      plan,
      calendar,
      aggregate,
      swimlanes,
      ...(noneName === null ? {} : { noSwimlaneName: noneName }),
    });
  }

  /** A cursor-paginated page of the plan's activities, stripped to the guest scope. */
  async listActivities(
    guest: GuestPrincipal,
    query: { limit: number; cursor?: string },
  ): Promise<GuestPage<GuestActivityDto>> {
    const rows = await this.activities.findManyActiveByPlan({
      organizationId: guest.organizationId,
      planId: guest.planId,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    const { items, meta } = this.paginate(rows, query.limit);
    // Swimlane membership is DERIVED here and never copied (ADR-0051 §4 as amended): the plan's live
    // list decides which swimlane a member is in, and the stored lane is the row for that basis.
    const plan = await this.plans.findActiveByIdInOrg(guest.planId, guest.organizationId);
    if (!plan) throw this.notFound();
    const { entries: live, codeTypeId } = await this.liveSwimlanes(guest, plan);
    const known = new Set(live.map((swimlane) => swimlane.id));
    const scope = { organizationId: guest.organizationId, planId: guest.planId };
    // Under a code source the placement reads are the page's own: each activity's live value of the
    // type and its lane at that basis. Elsewhere the member's lane rows are read, as ever.
    const codePage =
      codeTypeId !== null && known.size > 0
        ? await this.guestCodes.findPlacements(
            scope,
            codeTypeId,
            items.map((row) => row.id),
          )
        : null;
    const lanes =
      known.size > 0 && codePage === null
        ? await this.swimlanes.findLanesForActivities(items)
        : new Map<string, ActivitySwimlaneLaneSummary[]>();
    // Day-denominated fields are measured on each activity's effective calendar (ADR-0068), so a
    // guest reads the same durations a member does. The plan's calendar is one lookup for the page;
    // a per-activity calendar resolves itself.
    const planCalendarIds = new Map<string, string | null>(
      (await this.plans.findCalendarIds([guest.planId])).map((p) => [p.id, p.calendarId]),
    );
    const decorated = await attachDayFactors(
      this.calendars,
      items,
      planCalendarIds,
      // CQ-4: a guest adopts the corrected factor. The duration is a property of the work, and
      // withholding the correction would have a guest and a member read different numbers off the
      // same bar. The resource itself stays invisible — only the frame changes (#86).
      items.some((row) => row.type === 'RESOURCE_DEPENDENT')
        ? toDrivingCalendarMap(
            await this.schedule.loadDrivingResourceCalendars(guest.organizationId, guest.planId),
          )
        : new Map(),
    );
    this.touchAccess(guest.shareId);
    return {
      items: decorated.map((row) =>
        GuestActivityDto.from(
          row,
          codePage === null
            ? guestSwimlanePlacement(known, row, lanes.get(row.id) ?? [])
            : guestCodePlacement(
                known,
                row,
                codePage.values.get(row.id),
                codePage.lanes.get(row.id) ?? [],
              ),
        ),
      ),
      meta,
    };
  }

  /** A cursor-paginated page of the plan's dependency edges, stripped to the guest scope. */
  async listDependencies(
    guest: GuestPrincipal,
    query: { limit: number; cursor?: string },
  ): Promise<GuestPage<GuestDependencyDto>> {
    const rows = await this.dependencies.findManyActiveByPlan({
      organizationId: guest.organizationId,
      planId: guest.planId,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    const { items, meta } = this.paginate(rows, query.limit);
    // A relationship's lag is measured on its OWN `lagCalendar` (ADR-0068 §4), never on a
    // hard-pinned 1440 — the member read's rule, applied here through the SAME helper
    // (`attachLagDayFactors`) rather than a second copy of it (`docs/TECH_DEBT.md` #316). The
    // plan's calendar is one lookup for the page; a per-activity calendar resolves itself.
    const planCalendarId =
      (await this.plans.findCalendarIds([guest.planId]))[0]?.calendarId ?? null;
    const decorated = await attachLagDayFactors(
      this.calendars,
      items,
      planCalendarId,
      // Asked of THIS PAGE's endpoints, not of the plan (`docs/TECH_DEBT.md` #86): a page with no
      // RESOURCE_DEPENDENT endpoint needs no driver read at all.
      items.some(
        (row) =>
          row.predecessor.type === 'RESOURCE_DEPENDENT' ||
          row.successor.type === 'RESOURCE_DEPENDENT',
      )
        ? toDrivingCalendarMap(
            await this.schedule.loadDrivingResourceCalendars(guest.organizationId, guest.planId),
          )
        : new Map(),
    );
    this.touchAccess(guest.shareId);
    return { items: decorated.map((row) => GuestDependencyDto.from(row)), meta };
  }

  /**
   * The bands a guest is shown, and what the last one is called: the plan's hand-made swimlanes under
   * `MANUAL` (no name for the none band, which the web words "No swimlane" as ever), the values in
   * use of the plan's type under a code source (the none band is "No <type>", owner answer 3 of
   * p6-activity-codes M4 — the type's name, as a member's picture reads it), and nothing otherwise.
   * `codeTypeId` is for the caller's page reads and is never serialised.
   */
  private async liveSwimlanes(
    guest: GuestPrincipal,
    plan: Pick<Plan, 'swimlaneSource' | 'swimlaneCodeTypeId'>,
  ): Promise<{
    entries: GuestSwimlaneEntry[];
    noneName: string | null;
    codeTypeId: string | null;
  }> {
    if (plan.swimlaneSource === 'ACTIVITY_CODE' && plan.swimlaneCodeTypeId !== null) {
      const type = await this.codeTypes.findActiveInPlan(
        plan.swimlaneCodeTypeId,
        guest.planId,
        guest.organizationId,
      );
      // A deleted type draws no swimlanes for a member either.
      if (type === null) return { entries: [], noneName: null, codeTypeId: null };
      const [values, carriers] = await Promise.all([
        this.codeValues.findManyActiveByTypes(guest.organizationId, [type.id]),
        this.guestCodes.findCarriers(
          { organizationId: guest.organizationId, planId: guest.planId },
          type.id,
        ),
      ]);
      return {
        entries: guestCodeSwimlaneList(values, carriers),
        noneName: `No ${type.name}`,
        codeTypeId: type.id,
      };
    }
    if (plan.swimlaneSource !== 'MANUAL') return { entries: [], noneName: null, codeTypeId: null };
    return {
      entries: guestSwimlaneList(
        plan.swimlaneSource,
        await this.swimlanes.findAllActiveByPlan(guest.organizationId, guest.planId),
      ),
      noneName: null,
      codeTypeId: null,
    };
  }

  /** Keyset page helper (id cursor) — the member list convention (take limit+1, peek for hasMore). */
  private paginate<T extends { id: string }>(
    rows: T[],
    limit: number,
  ): { items: T[]; meta: PageMeta } {
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;
    return { items, meta: { nextCursor, hasMore } };
  }

  /**
   * Best-effort COALESCED `last_accessed_at` telemetry (ADR-0051 §7): fire-and-forget, so it
   * never blocks the response and a failed write is logged, never surfaced. Coalesced to at most
   * one write per {@link GUEST_ACCESS_TOUCH_STALE_MS} per link by the repository predicate.
   */
  private touchAccess(shareId: string): void {
    void this.shares
      .touchLastAccessedIfStale(shareId, GUEST_ACCESS_TOUCH_STALE_MS)
      .catch((error: unknown) => {
        // Telemetry is best-effort; a failure must never affect the guest read.
        this.logger.warn({ err: error, shareId }, 'guest last-accessed touch failed');
      });
  }

  /** The single uniform failure — indistinguishable from the guard's 404 (no oracle, ADR-0051 §5). */
  private notFound(): NotFoundError {
    return new NotFoundError('This share link is no longer available.');
  }
}
