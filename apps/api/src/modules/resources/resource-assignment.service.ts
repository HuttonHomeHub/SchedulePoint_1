import { Injectable } from '@nestjs/common';
import { Prisma, type ResourceAssignment } from '@prisma/client';
import { RESOURCE_ERROR } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';

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
} as const;

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

  async list(
    principal: Principal,
    orgSlug: string,
    activityId: string,
  ): Promise<ResourceAssignment[]> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'resource:read', organization.id);
    // 404 if the activity is foreign/deleted (anti-IDOR) before listing its assignments.
    await this.loadActiveActivity(activityId, organization.id);
    return this.assignments.findManyActiveByActivity(activityId, organization.id);
  }

  async create(
    principal: Principal,
    orgSlug: string,
    activityId: string,
    dto: CreateAssignmentDto,
  ): Promise<ResourceAssignment> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'resource:assign', organization.id);

    // Same-org (invariant (a)): both endpoints must be active in the resolved org; a
    // foreign/deleted id reads as 404, leaking nothing.
    const activity = await this.loadActiveActivity(activityId, organization.id);
    const resource = await this.resources.findActiveByIdInOrg(dto.resourceId, organization.id);
    if (!resource) throw new NotFoundError(RESOURCE_ERROR.RESOURCE_NOT_FOUND);

    const isDriving = dto.isDriving ?? false;
    // A MATERIAL resource may never drive (invariant (b)) — the DB cannot read the kind.
    if (isDriving && resource.kind === 'MATERIAL') throw this.materialCannotDriveError();

    try {
      const assignment = await this.prisma.$transaction(async (tx) => {
        // Setting a driver is a MOVE: clear any other driver on this activity first so the
        // ≤1-driver partial-unique never trips a P2002.
        if (isDriving) {
          await this.assignments.clearDrivingForActivity(activityId, principal.userId, tx);
        }
        return this.assignments.create(
          {
            // Copy the org id from the endpoints (both verified in-org), never from input.
            organizationId: activity.organizationId,
            activityId,
            resourceId: resource.id,
            budgetedUnits: dto.budgetedUnits ?? 0,
            isDriving,
            createdBy: principal.userId,
            updatedBy: principal.userId,
          },
          tx,
        );
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
      return assignment;
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
  ): Promise<ResourceAssignment> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'resource:assign', organization.id);

    const existing = await this.assignments.findActiveByIdInOrg(assignmentId, organization.id);
    if (!existing) throw new NotFoundError('Assignment not found.');

    const patch: AssignmentPatch = {};
    if (dto.budgetedUnits !== undefined) patch.budgetedUnits = dto.budgetedUnits;
    if (dto.isDriving !== undefined) patch.isDriving = dto.isDriving;

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
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) throw this.duplicateAssignmentError();
      throw error;
    }

    const updated = await this.assignments.findActiveByIdInOrg(assignmentId, organization.id);
    if (!updated) throw new NotFoundError('Assignment not found.');
    return updated;
  }

  async remove(principal: Principal, orgSlug: string, assignmentId: string): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'resource:assign', organization.id);

    const existing = await this.assignments.findActiveByIdInOrg(assignmentId, organization.id);
    if (!existing) throw new NotFoundError('Assignment not found.');

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
