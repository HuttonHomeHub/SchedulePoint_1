import { applyDecorators, Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import type { GuestPrincipal } from '../../common/auth/guest-principal';
import { CurrentGuest } from '../../common/decorators/current-guest.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Paginated } from '../../common/dto/paginated';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

import { GuestActivityDto } from './dto/guest-activity.dto';
import { GuestDependencyDto } from './dto/guest-dependency.dto';
import { GuestPlanViewDto } from './dto/guest-plan.dto';
import { ShareGuestService } from './share-guest.service';
import { ShareTokenGuard } from './share-token.guard';

/**
 * Guest read surface tighter per-IP rate limit (ADR-0051 §6). The FIRST unauthenticated
 * data-read endpoint in the app is the obvious scrape / token-spray / DoS target, so it runs a
 * limit stricter than the global default (100 / 60 s): 30 requests per 60 s per client IP. It
 * overrides the app-wide `default` throttler for these routes ONLY (the member surface is
 * untouched). `ttl` is milliseconds (matching the global `ThrottlerModule` config).
 */
const GUEST_THROTTLE = { default: { ttl: 60_000, limit: 30 } } as const;

/**
 * The two response headers every guest response carries (ADR-0051 §2/§5): `noindex, nofollow`
 * so the guest surface is never crawled, and `no-referrer` so the share URL (token in its
 * fragment) is never leaked as a referrer to a third-party asset. Applied per handler because
 * `@Header` is method-only in Nest.
 */
const GuestSecurityHeaders = (): MethodDecorator =>
  applyDecorators(
    Header('X-Robots-Tag', 'noindex, nofollow'),
    Header('Referrer-Policy', 'no-referrer'),
  );

/**
 * The session-less **External-Guest READ** surface (ADR-0051 §3–§6, F-M3) — the app's first
 * unauthenticated data-read endpoints. Every route is `@Public()` (it bypasses the global
 * session `AuthenticationGuard`) and instead guarded by the {@link ShareTokenGuard}, which
 * resolves the `Authorization: Bearer sp_share_…` token to a {@link GuestPrincipal} (or a
 * uniform 404). There are NO path/query params that select a plan or org: the TOKEN is the
 * entire scope, so there is nothing for a guest to tamper with (anti-IDOR by construction).
 *
 * Every handler:
 *   - takes ONLY `@CurrentGuest()` — plan + org come from the token, never from input;
 *   - is served `X-Robots-Tag: noindex, nofollow` + `Referrer-Policy: no-referrer` (ADR §2/§5)
 *     so the guest surface is neither crawled nor a referrer-leak source;
 *   - is bounded by the tighter guest rate limit ({@link GUEST_THROTTLE}); a burst → 429.
 *
 * The service reads the PERSISTED CPM columns only (no engine call) and returns field-stripped
 * DTOs that carry no cost / resources / baselines / notes / audit / user identity / token.
 */
@ApiTags('share-guest')
@ApiSecurity('shareToken')
@ApiTooManyRequestsResponse({ description: 'Rate limit exceeded for the guest surface.' })
@Public()
@UseGuards(ShareTokenGuard)
@Throttle(GUEST_THROTTLE)
@Controller({ path: 'share', version: '1' })
export class ShareGuestController {
  constructor(private readonly service: ShareGuestService) {}

  @Get('plan')
  @GuestSecurityHeaders()
  @ApiOperation({
    summary: 'Read the shared plan header, its calendar and schedule summary (guest token).',
    description:
      'Resolves the ONE plan the bearer token grants. Any dead / revoked / expired / deleted-plan ' +
      'token → a uniform 404 (never 401/403), so the endpoint is no oracle for whether a token exists.',
  })
  @ApiOkResponse({ type: GuestPlanViewDto })
  async plan(@CurrentGuest() guest: GuestPrincipal): Promise<GuestPlanViewDto> {
    return this.service.getPlanView(guest);
  }

  @Get('activities')
  @ApiOperation({
    summary: "Read the shared plan's activities, cursor-paginated (guest token).",
    description:
      'A bounded, cursor-paginated read of the plan the token grants — schedule + progress fields ' +
      'only (no cost, resources, notes, audit or user identity).',
  })
  @ApiOkResponse({ type: GuestActivityDto, isArray: true })
  @GuestSecurityHeaders()
  async activities(
    @CurrentGuest() guest: GuestPrincipal,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<GuestActivityDto>> {
    const { items, meta } = await this.service.listActivities(guest, query);
    return new Paginated(items, meta);
  }

  @Get('dependencies')
  @ApiOperation({
    summary: "Read the shared plan's dependency links, cursor-paginated (guest token).",
    description:
      'The logic ties (predecessor/successor ids, type, lag) of the plan the token grants.',
  })
  @ApiOkResponse({ type: GuestDependencyDto, isArray: true })
  @GuestSecurityHeaders()
  async dependencies(
    @CurrentGuest() guest: GuestPrincipal,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<GuestDependencyDto>> {
    const { items, meta } = await this.service.listDependencies(guest, query);
    return new Paginated(items, meta);
  }
}
