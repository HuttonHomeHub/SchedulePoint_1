import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  PlanEditLockActor,
  PlanEditLockErrorDetails,
  PlanEditLockReason,
  PlanEditLockStatus,
} from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { acquirePlanWriteLock } from '../../common/db/plan-advisory-lock';
import {
  ConflictError,
  ForbiddenError,
  LockedError,
  NotFoundError,
} from '../../common/errors/domain-errors';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanRepository } from '../plans/plan.repository';

import {
  canTakeOverNow,
  computeCapabilities,
  deriveLockState,
  graceEndsAt,
  LOCK_TTL_MS,
  type LockPermissions,
  type LockRowView,
} from './plan-lock.policy';
import { PlanLockRepository } from './plan-lock.repository';

/**
 * The plan edit-lock service (ADR-0028) — the "pen" coordination layer above
 * optimistic `version` (409) and the plan advisory lock. It resolves the org from
 * the caller's memberships (anti-IDOR), enforces the lock permissions
 * (deny-by-default), and drives the pure {@link ./plan-lock.policy} state machine.
 *
 * Acquire / request / hand-off / take-over each run under the **existing plan
 * advisory lock** (`acquirePlanWriteLock`), so their read-then-write can't
 * interleave with each other or with a recalc. The heartbeat is the one hot-path
 * exception: an atomic conditional UPDATE with no advisory lock.
 */
@Injectable()
export class PlanEditLockService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly plans: PlanRepository,
    private readonly repository: PlanLockRepository,
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(PlanEditLockService.name) private readonly logger: PinoLogger,
  ) {}

  /** Read the plan's lock status (any member — `plan:read`). */
  async status(principal: Principal, orgSlug: string, planId: string): Promise<PlanEditLockStatus> {
    const organizationId = await this.resolvePlanOrg(principal, orgSlug, planId, 'plan:read');
    const now = new Date();
    const row = await this.repository.find(planId, organizationId);
    return this.buildStatus(planId, organizationId, row, now, principal);
  }

  /**
   * Acquire (or renew / reclaim / take over) the lock. `takeover` is only honoured
   * when the caller may override (immediate) or may request-control and the
   * take-over is permitted now (holder inactive, or their request past grace).
   */
  async acquire(
    principal: Principal,
    orgSlug: string,
    planId: string,
    takeover: boolean,
  ): Promise<PlanEditLockStatus> {
    const organizationId = await this.resolvePlanOrg(
      principal,
      orgSlug,
      planId,
      'plan:acquire_lock',
    );

    return this.prisma.$transaction(async (tx) => {
      await acquirePlanWriteLock(tx, planId);
      const now = new Date();
      const row = await this.repository.find(planId, organizationId, tx);
      const state = deriveLockState(row, now, principal.userId);

      if (state === 'FREE' || state === 'EXPIRED') {
        const written = await this.repository.writeLeaseToHolder(tx, {
          planId,
          organizationId,
          holderUserId: principal.userId,
          now,
          expiresAt: this.expiryFrom(now),
        });
        this.audit('acquired', principal, organizationId, planId, { from: state });
        return this.buildStatus(planId, organizationId, written, now, principal, tx);
      }

      if (state === 'HELD_BY_ME') {
        // Re-acquire from another tab — renew, preserving any pending request.
        await this.repository.renewOwnLease(tx, {
          planId,
          organizationId,
          holderUserId: principal.userId,
          now,
          expiresAt: this.expiryFrom(now),
        });
        const refreshed = await this.repository.find(planId, organizationId, tx);
        return this.buildStatus(planId, organizationId, refreshed, now, principal, tx);
      }

      // HELD_BY_OTHER (live lease).
      const row2 = row as NonNullable<typeof row>;
      if (!takeover) {
        await this.throwHeld(row2, 'PLAN_EDIT_LOCK_HELD', tx);
      }
      const perms = this.perms(principal, organizationId);
      if (!perms.override && !perms.request) {
        throw new ForbiddenError('You do not have permission to take over this lock.');
      }
      if (!canTakeOverNow(row2, now, principal.userId, perms)) {
        // Must request first / wait out the grace window.
        await this.throwHeld(row2, 'PLAN_EDIT_LOCK_HELD', tx);
      }
      const stolen = await this.repository.writeLeaseToHolder(tx, {
        planId,
        organizationId,
        holderUserId: principal.userId,
        now,
        expiresAt: this.expiryFrom(now),
      });
      this.audit(
        perms.override ? 'override_takeover' : 'peer_takeover',
        principal,
        organizationId,
        planId,
        {
          previousHolder: row2.holderUserId,
        },
      );
      return this.buildStatus(planId, organizationId, stolen, now, principal, tx);
    });
  }

  /**
   * Renew the caller's lease (holder heartbeat). Atomic conditional UPDATE, no
   * advisory lock. 423 `PLAN_EDIT_LOCK_LOST` when the lease was stolen or expired.
   */
  async heartbeat(
    principal: Principal,
    orgSlug: string,
    planId: string,
  ): Promise<PlanEditLockStatus> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'plan:acquire_lock', organization.id);
    // Hot path: no plan load — the org-scoped conditional UPDATE is the anti-IDOR
    // guard and returns null uniformly for non-holder / expired / absent / wrong-org.
    const now = new Date();
    const row = await this.repository.heartbeat({
      planId,
      organizationId: organization.id,
      holderUserId: principal.userId,
      now,
      expiresAt: this.expiryFrom(now),
    });
    if (!row) {
      throw new LockedError('Your editing control has ended.', {
        reason: 'PLAN_EDIT_LOCK_LOST',
      } satisfies PlanEditLockErrorDetails);
    }
    return this.buildStatus(planId, organization.id, row, now, principal);
  }

  /** Release the lock (holder), or force-release it (override). Idempotent → 204. */
  async release(principal: Principal, orgSlug: string, planId: string): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'plan:acquire_lock', organization.id);
    const force = principal.can('plan:override_lock', organization.id);
    const count = await this.repository.remove({
      planId,
      organizationId: organization.id,
      ...(force ? {} : { holderUserId: principal.userId }),
    });
    if (count > 0) {
      this.audit(force ? 'force_released' : 'released', principal, organization.id, planId);
    }
  }

  /** Register a peer request-control on a live lock held by someone else (Q-A). */
  async request(
    principal: Principal,
    orgSlug: string,
    planId: string,
  ): Promise<PlanEditLockStatus> {
    const organizationId = await this.resolvePlanOrg(
      principal,
      orgSlug,
      planId,
      'plan:request_control',
    );

    return this.prisma.$transaction(async (tx) => {
      await acquirePlanWriteLock(tx, planId);
      const now = new Date();
      const row = await this.repository.find(planId, organizationId, tx);
      const state = deriveLockState(row, now, principal.userId);

      if (state === 'HELD_BY_OTHER') {
        await this.repository.stampRequest(tx, {
          planId,
          organizationId,
          requesterId: principal.userId,
          now,
        });
        this.audit('requested', principal, organizationId, planId, {
          holder: (row as NonNullable<typeof row>).holderUserId,
        });
        const refreshed = await this.repository.find(planId, organizationId, tx);
        return this.buildStatus(planId, organizationId, refreshed, now, principal, tx);
      }
      // FREE / EXPIRED / HELD_BY_ME → nothing to request; return the current status
      // (a benign race — the client reconciles to Start editing / already mine).
      return this.buildStatus(planId, organizationId, row, now, principal, tx);
    });
  }

  /** Hand the pen directly to the pending requester (holder-initiated, graceful). */
  async handoff(
    principal: Principal,
    orgSlug: string,
    planId: string,
  ): Promise<PlanEditLockStatus> {
    const organizationId = await this.resolvePlanOrg(
      principal,
      orgSlug,
      planId,
      'plan:acquire_lock',
    );

    return this.prisma.$transaction(async (tx) => {
      await acquirePlanWriteLock(tx, planId);
      const now = new Date();
      const row = await this.repository.find(planId, organizationId, tx);
      const state = deriveLockState(row, now, principal.userId);

      if (state !== 'HELD_BY_ME') {
        throw new LockedError('You are no longer the editor of this plan.', {
          reason: 'PLAN_EDIT_LOCK_LOST',
        } satisfies PlanEditLockErrorDetails);
      }
      const holderRow = row as NonNullable<typeof row>;
      if (!holderRow.requestedByUserId) {
        throw new ConflictError('No one has requested control of this plan.');
      }
      const newHolder = holderRow.requestedByUserId;
      const handed = await this.repository.writeLeaseToHolder(tx, {
        planId,
        organizationId,
        holderUserId: newHolder,
        now,
        expiresAt: this.expiryFrom(now),
      });
      this.audit('handoff', principal, organizationId, planId, { newHolder });
      return this.buildStatus(planId, organizationId, handed, now, principal, tx);
    });
  }

  /**
   * Assert the principal currently holds the pen on `planId` (ADR-0028 write-gate).
   * Called by structural write services AFTER their scope/permission checks and,
   * for graph writes, INSIDE their advisory-lock transaction (pass `tx`). Throws
   * 423 `PLAN_EDIT_LOCK_REQUIRED` otherwise. Does NOT renew the lease — the hard
   * integrity guarantee stays with the optimistic `version` (409).
   */
  async assertHoldsPen(
    principal: Principal,
    planId: string,
    organizationId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    // Staged rollout (ADR-0028): the gate ships inert so it never breaks the
    // existing (flag-on) activities-table / dependency-editor / recalculate flows,
    // which don't acquire a lock yet. Ops flip PLAN_EDIT_LOCK_ENFORCED on once the
    // front end holds the pen across every editing entry point.
    if (!this.config.planEditLockEnforced) return;
    const now = new Date();
    const row = await this.repository.find(planId, organizationId, tx);
    const state = deriveLockState(row, now, principal.userId);
    if (state === 'HELD_BY_ME') return;
    const holder =
      row && state === 'HELD_BY_OTHER'
        ? this.actor(await this.repository.findActors([row.holderUserId], tx), row.holderUserId)
        : null;
    throw new LockedError('You are not the editor of this plan. Start editing to make changes.', {
      reason: 'PLAN_EDIT_LOCK_REQUIRED',
      holder,
    } satisfies PlanEditLockErrorDetails);
  }

  // --- internals -----------------------------------------------------------

  /** Resolve the org (from memberships), assert `permission`, and 404 an out-of-scope plan. */
  private async resolvePlanOrg(
    principal: Principal,
    orgSlug: string,
    planId: string,
    permission: Permission,
  ): Promise<string> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, permission, organization.id);
    const plan = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!plan) throw new NotFoundError('Plan not found.');
    return organization.id;
  }

  private expiryFrom(now: Date): Date {
    return new Date(now.getTime() + LOCK_TTL_MS);
  }

  private perms(principal: Principal, organizationId: string): LockPermissions {
    return {
      acquire: principal.can('plan:acquire_lock', organizationId),
      request: principal.can('plan:request_control', organizationId),
      override: principal.can('plan:override_lock', organizationId),
    };
  }

  private async throwHeld(
    row: LockRowView,
    reason: PlanEditLockReason,
    tx?: Prisma.TransactionClient,
  ): Promise<never> {
    const holder = this.actor(
      await this.repository.findActors([row.holderUserId], tx),
      row.holderUserId,
    );
    throw new LockedError('Someone else is currently editing this plan.', {
      reason,
      holder,
    } satisfies PlanEditLockErrorDetails);
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

  private actor(actors: Map<string, PlanEditLockActor>, id: string): PlanEditLockActor {
    return actors.get(id) ?? { id, name: 'Unknown user', email: '' };
  }

  /**
   * The caller as an actor from their own session profile (no DB round-trip), or
   * `null` if the principal doesn't carry one (foundation/test path). Lets
   * {@link buildStatus} skip resolving the holder on the hot self/heartbeat path
   * where the holder is always the caller (#26).
   */
  private selfActor(principal: Principal): PlanEditLockActor | null {
    if (principal.name === undefined || principal.email === undefined) return null;
    return { id: principal.userId, name: principal.name, email: principal.email };
  }

  private async buildStatus(
    planId: string,
    organizationId: string,
    row: LockRowView | null,
    now: Date,
    principal: Principal,
    db?: Prisma.TransactionClient,
  ): Promise<PlanEditLockStatus> {
    const state = deriveLockState(row, now, principal.userId);
    const perms = this.perms(principal, organizationId);
    const caps = computeCapabilities(state, row, now, principal.userId, perms);
    const liveHeld = state === 'HELD_BY_ME' || state === 'HELD_BY_OTHER';

    const holderId = row ? row.holderUserId : null;
    const requesterId = liveHeld && row ? row.requestedByUserId : null;

    // The caller's own profile came free with the session, so don't re-fetch it: on
    // the heartbeat/self path the holder IS the caller, and the common case has no
    // pending requester — resolving nothing (#26). Only ids we can't supply locally
    // hit the DB.
    const self = this.selfActor(principal);
    const idsToResolve = [holderId, requesterId].filter(
      (x): x is string => x !== null && !(self !== null && x === principal.userId),
    );
    // `findActors` short-circuits an empty id list to an empty Map (no query), so the
    // common self-holder / no-requester heartbeat issues zero `users` reads.
    const actors = await this.repository.findActors(idsToResolve, db);
    if (self) actors.set(principal.userId, self);

    return {
      planId,
      state,
      holder: holderId ? this.actor(actors, holderId) : null,
      expiresAt: row ? row.expiresAt.toISOString() : null,
      heartbeatAt: row ? row.heartbeatAt.toISOString() : null,
      requestedBy: requesterId ? this.actor(actors, requesterId) : null,
      graceEndsAt: liveHeld ? (graceEndsAt(row)?.toISOString() ?? null) : null,
      ...caps,
    };
  }

  private audit(
    event: string,
    principal: Principal,
    organizationId: string,
    planId: string,
    extra?: Record<string, unknown>,
  ): void {
    this.logger.info(
      {
        event: `plan_edit_lock.${event}`,
        userId: principal.userId,
        organizationId,
        planId,
        ...extra,
      },
      `plan edit-lock ${event}`,
    );
  }
}
