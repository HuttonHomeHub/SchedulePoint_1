import { Injectable } from '@nestjs/common';
import { Prisma, type ResourceAssignment } from '@prisma/client';
import { RESOURCE_ERROR } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { acquireResourceWriteLock } from '../../common/db/resource-advisory-lock';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { resolveTriad } from '../schedule/duration-type/resolve-triad';

import type { CreateAssignmentDto } from './dto/create-assignment.dto';
import type { UpdateAssignmentDto } from './dto/update-assignment.dto';
import {
  ResourceAssignmentRepository,
  type AssignmentPatch,
} from './resource-assignment.repository';
import { ResourceRepository } from './resource.repository';

/** Machine-readable conflict/validation reasons carried in a domain error's `details` (ADR-0039). */
export const ASSIGNMENT_ERROR = {
  /** The (activity, resource) pair already has an active assignment. */
  DUPLICATE_ASSIGNMENT: 'DUPLICATE_ASSIGNMENT',
  /** A MATERIAL resource cannot be the driving resource of an activity. */
  MATERIAL_CANNOT_DRIVE: 'MATERIAL_CANNOT_DRIVE',
  /** A zero rate on a units-driven duration recompute (N20, ADR-0040 §5) — rejected pre-division. */
  UNITS_PER_HOUR_ZERO: 'UNITS_PER_HOUR_ZERO',
} as const;

/** A pending optimistic-locked write of an activity's server-derived duration (ADR-0040 §3). */
interface ActivityDurationUpdate {
  id: string;
  version: number;
  durationMinutes: number;
}

/**
 * Business logic for resource assignments (ADR-0039) — the activity↔resource join. Every
 * action re-resolves the org scope (anti-IDOR) + a `resource:assign`/`resource:read`
 * permission check. The service owns the invariants the DB cannot express (ADR-0039 §b):
 * SAME-ORG (the activity and resource are loaded in the resolved org; the assignment's
 * `organization_id` is COPIED from them, never client input), a MATERIAL resource may
 * never drive, and "set driver" is a MOVE (any other driver is cleared in the same
 * transaction, so the ≤1-driver partial-unique never trips a P2002). A duplicate active
 * `(activity, resource)` maps to DUPLICATE_ASSIGNMENT (409).
 */
@Injectable()
export class ResourceAssignmentService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly resources: ResourceRepository,
    private readonly assignments: ResourceAssignmentRepository,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(ResourceAssignmentService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * List one activity's active assignments — deliberately unpaginated (bounded-list exemption):
   * the count is capped by how many resources a single activity carries (a handful in practice),
   * the same rationale the per-plan dependency/baseline lists use. This is always activity-scoped;
   * org-wide assignments are never listed in one call.
   */
  async list(
    principal: Principal,
    orgSlug: string,
    activityId: string,
  ): Promise<{ items: ResourceAssignment[]; canReadCost: boolean }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'resource:read', organization.id);
    // Org-scoped cost:read (EV4a, ADR-0042) on the SAME resolved org — never `canAnywhere`. Threaded to
    // the response DTO so the money budgeted/actual cost is gated per role (fail-closed for a non-reader).
    const canReadCost = principal.can('cost:read', organization.id);
    // 404 if the activity is foreign/deleted (anti-IDOR) before listing its assignments.
    await this.loadActiveActivity(activityId, organization.id);
    const items = await this.assignments.findManyActiveByActivity(activityId, organization.id);
    return { items, canReadCost };
  }

  async create(
    principal: Principal,
    orgSlug: string,
    activityId: string,
    dto: CreateAssignmentDto,
  ): Promise<{ assignment: ResourceAssignment; canReadCost: boolean }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'resource:assign', organization.id);
    const canReadCost = principal.can('cost:read', organization.id);

    // Same-org (invariant (a)): both endpoints must be active in the resolved org; a
    // foreign/deleted id reads as 404, leaking nothing.
    const activity = await this.loadActiveActivity(activityId, organization.id);
    const resource = await this.resources.findActiveByIdInOrg(dto.resourceId, organization.id);
    if (!resource) throw new NotFoundError(RESOURCE_ERROR.RESOURCE_NOT_FOUND);

    const isDriving = dto.isDriving ?? false;
    // A MATERIAL resource may never drive (invariant (b)) — the DB cannot read the kind.
    if (isDriving && resource.kind === 'MATERIAL') throw this.materialCannotDriveError();

    // Duration-type triad recompute (ADR-0040 §3): only a DRIVING assignment with a rate and a
    // declared edited field participates. Resolved BEFORE the tx (pure); the resolved units/rate are
    // stored and a derived duration (a units-driven type) is persisted on the activity in the same tx.
    const budgetedUnits = dto.budgetedUnits ?? 0;
    const unitsPerHour = dto.unitsPerHour ?? null;
    let storedUnits = budgetedUnits;
    let storedRate = unitsPerHour;
    let activityDurationUpdate: ActivityDurationUpdate | null = null;
    if (dto.editedField && isDriving && unitsPerHour !== null) {
      const resolved = resolveTriad(activity.durationType, dto.editedField, {
        durationMinutes: activity.durationMinutes,
        budgetedUnits,
        unitsPerHour,
      });
      if (!resolved.ok) throw this.unitsPerHourZeroError();
      // The derived field is server-computed (invariant (d)); the client's value for it is ignored.
      storedUnits = resolved.budgetedUnits;
      storedRate = resolved.unitsPerHour;
      if (resolved.durationMinutes !== activity.durationMinutes) {
        activityDurationUpdate = {
          id: activity.id,
          version: activity.version,
          durationMinutes: resolved.durationMinutes,
        };
      }
    }

    try {
      const assignment = await this.prisma.$transaction(async (tx) => {
        // Serialise against a concurrent resource delete (RESOURCE_IN_USE guard, ADR-0039
        // invariant (c)): take the resource lock the delete also holds, then re-confirm the
        // resource is still active inside it, so this assign can never land against a resource
        // being soft-deleted (which a pre-transaction check alone would not prevent).
        await acquireResourceWriteLock(tx, resource.id);
        if (!(await this.resources.findActiveByIdInOrg(resource.id, organization.id, tx))) {
          throw new NotFoundError(RESOURCE_ERROR.RESOURCE_NOT_FOUND);
        }
        // Setting a driver is a MOVE: clear any other driver on this activity first so the
        // ≤1-driver partial-unique never trips a P2002.
        if (isDriving) {
          await this.assignments.clearDrivingForActivity(activityId, principal.userId, tx);
        }
        const created = await this.assignments.create(
          {
            // Copy the org id from the endpoints (both verified in-org), never from input.
            organizationId: activity.organizationId,
            activityId,
            resourceId: resource.id,
            budgetedUnits: storedUnits,
            unitsPerHour: storedRate,
            isDriving,
            // Earned-Value cost inputs (EV1, ADR-0042): passthrough only, no derivation (that is EV2b).
            // budgetedCost null/omitted = derive at read time; actualCost/actualUnits default 0.
            budgetedCost: dto.budgetedCost ?? null,
            actualCost: dto.actualCost ?? 0,
            actualUnits: dto.actualUnits ?? 0,
            createdBy: principal.userId,
            updatedBy: principal.userId,
          },
          tx,
        );
        // Persist a units-driven derived duration on the activity (optimistic-locked in the same tx).
        await this.persistActivityDuration(tx, activityDurationUpdate, principal.userId);
        return created;
      });
      this.logger.info(
        {
          organizationId: organization.id,
          activityId,
          resourceId: resource.id,
          assignmentId: assignment.id,
          userId: principal.userId,
        },
        'resource assigned',
      );
      return { assignment, canReadCost };
    } catch (error) {
      if (this.isUniqueViolation(error)) throw this.duplicateAssignmentError();
      throw error;
    }
  }

  async update(
    principal: Principal,
    orgSlug: string,
    assignmentId: string,
    dto: UpdateAssignmentDto,
  ): Promise<{ assignment: ResourceAssignment; canReadCost: boolean }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'resource:assign', organization.id);
    const canReadCost = principal.can('cost:read', organization.id);

    const existing = await this.assignments.findActiveByIdInOrg(assignmentId, organization.id);
    if (!existing) throw new NotFoundError(RESOURCE_ERROR.ASSIGNMENT_NOT_FOUND);

    const patch: AssignmentPatch = {};
    if (dto.budgetedUnits !== undefined) patch.budgetedUnits = dto.budgetedUnits;
    if (dto.unitsPerHour !== undefined) patch.unitsPerHour = dto.unitsPerHour;
    if (dto.isDriving !== undefined) patch.isDriving = dto.isDriving;
    // Earned-Value cost inputs (EV1, ADR-0042): passthrough only. budgetedCost null clears to
    // derive-at-read; actualCost/actualUnits are NOT NULL, so no clearing. No derivation here (EV2b).
    if (dto.budgetedCost !== undefined) patch.budgetedCost = dto.budgetedCost;
    if (dto.actualCost !== undefined) patch.actualCost = dto.actualCost;
    if (dto.actualUnits !== undefined) patch.actualUnits = dto.actualUnits;

    // A MATERIAL resource may never drive (invariant (b)): re-check the resource's kind
    // when this update sets the driver on.
    if (dto.isDriving === true) {
      const resource = await this.resources.findActiveByIdInOrg(
        existing.resourceId,
        organization.id,
      );
      if (!resource) throw new NotFoundError(RESOURCE_ERROR.RESOURCE_NOT_FOUND);
      if (resource.kind === 'MATERIAL') throw this.materialCannotDriveError();
    }

    // Duration-type triad recompute (ADR-0040 §3): only the DRIVING assignment participates
    // (invariant (c)), and only when a rate is present and an edited field is declared. The edited
    // field is HELD and its post-edit value is taken from the client; the dependent is recomputed
    // (invariant (d)) — either the same-row Units/Rate, or the activity's duration (a units-driven
    // type). Resolved BEFORE the tx (pure); N20 zero-rate rejects (422) before any write.
    const effectiveDriving = dto.isDriving ?? existing.isDriving;
    const effectiveUnits = dto.budgetedUnits ?? existing.budgetedUnits.toNumber();
    const effectiveRate =
      dto.unitsPerHour !== undefined
        ? dto.unitsPerHour
        : existing.unitsPerHour === null
          ? null
          : existing.unitsPerHour.toNumber();

    let activityDurationUpdate: ActivityDurationUpdate | null = null;
    if (dto.editedField && effectiveDriving && effectiveRate !== null) {
      const activity = await this.loadActiveActivity(existing.activityId, organization.id);
      const resolved = resolveTriad(activity.durationType, dto.editedField, {
        durationMinutes: activity.durationMinutes,
        budgetedUnits: effectiveUnits,
        unitsPerHour: effectiveRate,
      });
      if (!resolved.ok) throw this.unitsPerHourZeroError();
      // The derived field is server-computed and overwrites any client value (invariant (d)).
      patch.budgetedUnits = resolved.budgetedUnits;
      patch.unitsPerHour = resolved.unitsPerHour;
      if (resolved.durationMinutes !== activity.durationMinutes) {
        activityDurationUpdate = {
          id: activity.id,
          version: activity.version,
          durationMinutes: resolved.durationMinutes,
        };
      }
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // "Set driver" is a MOVE: clear every OTHER driver on this activity first.
        if (dto.isDriving === true) {
          await this.assignments.clearDrivingForActivity(
            existing.activityId,
            principal.userId,
            tx,
            assignmentId,
          );
        }
        const changed = await this.assignments.updateIfVersionMatches(
          assignmentId,
          dto.version,
          patch,
          principal.userId,
          tx,
        );
        if (changed === 0) {
          throw new ConflictError('This assignment was changed elsewhere. Refresh and try again.');
        }
        // Persist a units-driven derived duration on the activity — same tx, optimistic-locked, so a
        // stale version on EITHER row rolls the whole write back (409).
        await this.persistActivityDuration(tx, activityDurationUpdate, principal.userId);
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) throw this.duplicateAssignmentError();
      throw error;
    }

    const updated = await this.assignments.findActiveByIdInOrg(assignmentId, organization.id);
    if (!updated) throw new NotFoundError(RESOURCE_ERROR.ASSIGNMENT_NOT_FOUND);
    return { assignment: updated, canReadCost };
  }

  async remove(principal: Principal, orgSlug: string, assignmentId: string): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'resource:assign', organization.id);

    const existing = await this.assignments.findActiveByIdInOrg(assignmentId, organization.id);
    if (!existing) throw new NotFoundError(RESOURCE_ERROR.ASSIGNMENT_NOT_FOUND);

    await this.assignments.softDelete(assignmentId, principal.userId);
    this.logger.info(
      { organizationId: organization.id, assignmentId, userId: principal.userId },
      'resource unassigned',
    );
  }

  /**
   * Load an activity active + in the caller's org, or 404 (anti-IDOR). Read via Prisma
   * directly (rather than importing ActivitiesModule) so the resources module stays free
   * of a module cycle through activities → calendars → resources.
   */
  private async loadActiveActivity(activityId: string, organizationId: string) {
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, organizationId, deletedAt: null },
    });
    if (!activity) throw new NotFoundError('Activity not found.');
    return activity;
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private duplicateAssignmentError(): ConflictError {
    return new ConflictError(RESOURCE_ERROR.DUPLICATE_ASSIGNMENT, {
      reason: ASSIGNMENT_ERROR.DUPLICATE_ASSIGNMENT,
    });
  }

  private materialCannotDriveError(): ValidationError {
    return new ValidationError(RESOURCE_ERROR.MATERIAL_CANNOT_DRIVE, {
      reason: ASSIGNMENT_ERROR.MATERIAL_CANNOT_DRIVE,
    });
  }

  /** N20 (ADR-0040 §5): a zero rate on a units-driven duration recompute → 422 (nothing written). */
  private unitsPerHourZeroError(): ValidationError {
    return new ValidationError(RESOURCE_ERROR.UNITS_PER_HOUR_ZERO, {
      reason: ASSIGNMENT_ERROR.UNITS_PER_HOUR_ZERO,
    });
  }

  /**
   * Persist a units-driven derived `durationMinutes` on the owning activity (ADR-0040 §3), inside
   * the assignment write transaction and optimistic-locked on the activity's pre-read version — a
   * stale row (count 0) rolls the whole write back (409). A no-op when the recompute produced no
   * duration change (a same-row Units/Rate dependent, or the parity no-op).
   */
  private async persistActivityDuration(
    tx: Prisma.TransactionClient,
    update: ActivityDurationUpdate | null,
    userId: string,
  ): Promise<void> {
    if (!update) return;
    const result = await tx.activity.updateMany({
      where: { id: update.id, version: update.version, deletedAt: null },
      data: {
        durationMinutes: update.durationMinutes,
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new ConflictError('This activity was changed elsewhere. Refresh and try again.');
    }
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
