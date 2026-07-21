import { Injectable } from '@nestjs/common';
import type { PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { GuestPrincipal } from '../../common/auth/guest-principal';
import { NotFoundError } from '../../common/errors/domain-errors';
import { ActivityRepository } from '../activities/activity.repository';
import { CalendarRepository } from '../calendars/calendar.repository';
import { DependencyRepository } from '../dependencies/dependency.repository';
import { PlanRepository } from '../plans/plan.repository';
import { ScheduleRepository } from '../schedule/schedule.repository';

import { GuestActivityDto } from './dto/guest-activity.dto';
import { GuestDependencyDto } from './dto/guest-dependency.dto';
import { GuestPlanViewDto } from './dto/guest-plan.dto';
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

    this.touchAccess(guest.shareId);
    return GuestPlanViewDto.from({ plan, calendar, aggregate });
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
    this.touchAccess(guest.shareId);
    return { items: items.map((row) => GuestActivityDto.from(row)), meta };
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
    this.touchAccess(guest.shareId);
    return { items: items.map((row) => GuestDependencyDto.from(row)), meta };
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
