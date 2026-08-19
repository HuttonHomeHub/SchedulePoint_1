import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { ForbiddenError } from '../../common/errors/domain-errors';
import { AppConfigService } from '../../config/app-config.service';
import { OrganizationsService } from '../organizations/organizations.service';

import type {
  AttentionDto,
  HeldLockDto,
  OverviewActor,
  OverviewResponseDto,
  RecentPlanDto,
  RecentlyChangedPlanDto,
} from './dto/overview-response.dto';
import { OverviewRepository } from './overview.repository';

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
    const retentionArmed = this.appConfig.retentionHierarchyEnabled;

    const expiryCutoff = new Date(
      Date.now() - (this.appConfig.retentionHierarchyDays - EXPIRY_WARNING_DAYS) * MS_PER_DAY,
    );

    const [
      recentlyChanged,
      heldLocks,
      hasClients,
      hasPlans,
      pendingInvitations,
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
      mayReadInvitations
        ? this.repo.countPendingInvitations(organization.id)
        : Promise.resolve(null),
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

    const names = await this.repo.resolveMemberNames({
      organizationId: organization.id,
      userIds: actorIds,
    });

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
      ...(pendingInvitations !== null ? { pendingInvitationCount: pendingInvitations } : {}),
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
        changedBy: this.toActor(row.changedByUserId, names),
      })),
      recentPlans,
      attention,
    };
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
