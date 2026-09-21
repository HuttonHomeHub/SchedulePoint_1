import { Injectable } from '@nestjs/common';
import type { PlacementMigrationReport } from '@repo/types';

import type { Principal } from '../../common/auth/principal';
import { ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanRepository } from '../plans/plan.repository';

import { PlacementMigrationRepository } from './placement-migration.repository';

/** `YYYY-MM-DD` from a `@db.Date` column, which Prisma hands back as a UTC-midnight `Date`. */
function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * The placement-migration report (one-planning-surface M-I).
 *
 * **This service exists so `placement_migrations` is not a write-only table.** FC-10's rails argue
 * that the record's second job is diagnostic — "it is how anybody finds out the strip did something
 * nobody predicted" — and a record nothing can read does not have that job. This is the read.
 *
 * **It rides on `plan:read` and adds no permission**, on the ADR-0028 precedent quoted in
 * `org-permissions.ts`: reading the lock's status "needs no new code — it rides on `plan:read`,
 * held by every member". The rows carry activity codes, names and dates, all of which every member
 * already sees on the activities table; there is no cost, no rate and no actor, so there is nothing
 * here that `cost:read` or a staff gate exists to hold back.
 */
@Injectable()
export class PlacementMigrationService {
  constructor(
    private readonly repository: PlacementMigrationRepository,
    private readonly organizations: OrganizationsService,
    private readonly plans: PlanRepository,
  ) {}

  async report(
    principal: Principal,
    orgSlug: string,
    planId: string,
  ): Promise<PlacementMigrationReport> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    // **Both permissions, not either.** They are granted to the same set today (`HIERARCHY_READ`
    // bundles them), so this asserts nothing extra now — which is the point: narrowing either later
    // cannot silently leave this route open on the strength of the other. It is the rule this
    // epic's own `cross-plan-revision-compare.controller.ts:94-96` states in as many words, applied
    // here for the same reason. `activity:read` belongs because every field this route returns is
    // an activity's — its code, its name, and a date that was on it.
    if (
      !principal.can('plan:read', organization.id) ||
      !principal.can('activity:read', organization.id)
    ) {
      throw new ForbiddenError('You do not have permission to read plans in this organisation.');
    }
    const plan = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!plan) throw new NotFoundError('Plan not found.');

    const rows = await this.repository.findForPlan(planId, organization.id);

    return {
      planId,
      count: rows.length,
      rows: rows.map((row) => ({
        id: row.id,
        activityId: row.activityId,
        activityCode: row.activityCode,
        activityName: row.activityName,
        priorConstraintType: row.priorConstraintType,
        priorConstraintDate: isoDate(row.priorConstraintDate),
        priorVisualStart: row.priorVisualStart === null ? null : isoDate(row.priorVisualStart),
        migratedAt: row.migratedAt.toISOString(),
      })),
    };
  }
}
