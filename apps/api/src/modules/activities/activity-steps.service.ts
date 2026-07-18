import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { type ActivityStep } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';

import { ActivityStepRepository } from './activity-step.repository';
import type { ReplaceStepsDto } from './dto/replace-steps.dto';

/**
 * Business logic for activity steps (M7 rung 5, ADR-0044 §2) — the weighted progress checklist that
 * hangs off an activity, feeding the `PHYSICAL` Earned-Value measure (steps win over the manual field;
 * ADR-0035 §33). A reference-template child sub-resource: every action re-resolves the org scope from
 * the caller's own memberships (anti-IDOR) paired with a permission check, and the `organization_id` is
 * COPIED from the parent activity, never client input. Reading needs `activity:read`; the bulk replace
 * is an activity-write (`activity:update`, no new permission — a step IS activity data). The **N28**
 * out-of-range and negative-`weight` rejects are DTO-boundary (422); the DB CHECKs backstop them.
 */
@Injectable()
export class ActivityStepsService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly steps: ActivityStepRepository,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(ActivityStepsService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * List one activity's active steps, seq-ordered — deliberately unpaginated (bounded-list exemption):
   * a checklist carries a handful of rows, the same rationale the per-activity assignment list uses.
   */
  async list(principal: Principal, orgSlug: string, activityId: string): Promise<ActivityStep[]> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'activity:read', organization.id);
    // 404 if the activity is foreign/deleted (anti-IDOR) before listing its steps.
    await this.loadActiveActivity(activityId, organization.id);
    return this.steps.findManyActiveByActivity(activityId, organization.id);
  }

  /**
   * Bulk-replace an activity's steps (Q3 default): reconcile the persisted active set to the desired
   * ordered list in one transaction. Retained positions are updated in place, new ones appended, and the
   * removed tail soft-deleted under one `delete_batch_id`; `seq` is assigned contiguously (1-based) so
   * the client never sets it. The parent activity's `version` is bumped and optimistic-locked, so a
   * stale read 409s and nothing changes. `seq` never collides on the partial unique because retained
   * rows keep their seq, appends use seq > the old max, and deletes only shrink the tail.
   */
  async replace(
    principal: Principal,
    orgSlug: string,
    activityId: string,
    dto: ReplaceStepsDto,
  ): Promise<ActivityStep[]> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'activity:update', organization.id);

    const activity = await this.loadActiveActivity(activityId, organization.id);

    await this.prisma.$transaction(async (tx) => {
      // Optimistic lock the parent activity FIRST: a stale version rolls the whole replace back (409),
      // and the version bump makes the step edit visible to the activity's own concurrency (the row
      // whose physical % these steps drive). Never touches an engine-owned column.
      const bumped = await tx.activity.updateMany({
        where: { id: activityId, version: dto.version, deletedAt: null },
        data: { updatedBy: principal.userId, version: { increment: 1 } },
      });
      if (bumped.count === 0) {
        throw new ConflictError('This activity was changed elsewhere. Refresh and try again.');
      }

      const existing = await this.steps.findManyActiveByActivity(activityId, organization.id, tx);
      const desired = dto.steps;
      const shared = Math.min(existing.length, desired.length);

      // Retained positions (1..shared): overwrite the mutable fields in place, keeping the row id.
      for (let i = 0; i < shared; i += 1) {
        const step = desired[i]!;
        await this.steps.updateFields(
          existing[i]!.id,
          {
            seq: i + 1,
            name: step.name,
            weight: step.weight,
            percentComplete: step.percentComplete,
          },
          principal.userId,
          tx,
        );
      }
      // New tail (shared..desired.length): append with seq past the old max, so no active seq collision.
      for (let i = shared; i < desired.length; i += 1) {
        const step = desired[i]!;
        await this.steps.create(
          {
            // Copy the org id from the parent activity, never from input.
            organizationId: activity.organizationId,
            activityId,
            seq: i + 1,
            name: step.name,
            weight: step.weight,
            percentComplete: step.percentComplete,
            createdBy: principal.userId,
            updatedBy: principal.userId,
          },
          tx,
        );
      }
      // Removed tail (desired.length..existing.length): soft-delete together under one batch id.
      if (existing.length > desired.length) {
        const batchId = randomUUID();
        const removedIds = existing.slice(desired.length).map((s) => s.id);
        await this.steps.softDeleteMany(removedIds, batchId, principal.userId, tx);
      }
    });

    this.logger.info(
      {
        organizationId: organization.id,
        activityId,
        userId: principal.userId,
        count: dto.steps.length,
      },
      'activity steps replaced',
    );
    return this.steps.findManyActiveByActivity(activityId, organization.id);
  }

  /**
   * Load an activity active + in the caller's org, or 404 (anti-IDOR). Read via Prisma directly (like
   * ResourceAssignmentService) so the steps sub-resource stays free of an activities-service cycle.
   */
  private async loadActiveActivity(activityId: string, organizationId: string) {
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, organizationId, deletedAt: null },
    });
    if (!activity) throw new NotFoundError('Activity not found.');
    return activity;
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
