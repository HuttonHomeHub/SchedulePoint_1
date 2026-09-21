import type { PlacementMigration } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import { ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { PlanRepository } from '../plans/plan.repository';

import type { PlacementMigrationRepository } from './placement-migration.repository';
import { PlacementMigrationService } from './placement-migration.service';

const ORG_ID = 'org-1';
const OTHER_ORG = 'org-2';
const PLAN_ID = 'plan-1';
const SLUG = 'acme';

const MEMBER: Permission[] = ['plan:read', 'activity:read'];

function principal(permissions: Permission[], organizationId = ORG_ID): Principal {
  return new Principal('user-me', [{ organizationId, role: 'VIEWER', permissions }]);
}

function row(overrides: Partial<PlacementMigration> = {}): PlacementMigration {
  return {
    id: 'row-1',
    organizationId: ORG_ID,
    planId: PLAN_ID,
    activityId: 'act-1',
    activityCode: 'A100',
    activityName: 'Pour slab',
    priorConstraintType: 'SNET',
    priorConstraintDate: new Date('2026-03-04T00:00:00.000Z'),
    priorVisualStart: null,
    migratedAt: new Date('2026-09-21T09:00:00.000Z'),
    ...overrides,
  };
}

describe('PlacementMigrationService', () => {
  let repository: { findForPlan: ReturnType<typeof vi.fn> };
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let plans: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let service: PlacementMigrationService;

  beforeEach(() => {
    repository = { findForPlan: vi.fn().mockResolvedValue([]) };
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID, slug: SLUG } }),
    };
    plans = { findActiveByIdInOrg: vi.fn().mockResolvedValue({ id: PLAN_ID }) };
    service = new PlacementMigrationService(
      repository as unknown as PlacementMigrationRepository,
      organizations as unknown as OrganizationsService,
      plans as unknown as PlanRepository,
    );
  });

  it('projects a row, with the date columns as calendar days and the instant as ISO', async () => {
    repository.findForPlan.mockResolvedValue([row()]);

    const report = await service.report(principal(MEMBER), SLUG, PLAN_ID);

    expect(report).toEqual({
      planId: PLAN_ID,
      count: 1,
      rows: [
        {
          id: 'row-1',
          activityId: 'act-1',
          activityCode: 'A100',
          activityName: 'Pour slab',
          priorConstraintType: 'SNET',
          priorConstraintDate: '2026-03-04',
          priorVisualStart: null,
          migratedAt: '2026-09-21T09:00:00.000Z',
        },
      ],
    });
  });

  /**
   * **`priorVisualStart` is a finding, not a datum** — the migration excludes an activity that
   * already carries a `visualStart`, so a value here means that exclusion failed and a
   * hand-placement was overwritten. The projection must carry it through rather than drop it as
   * "the column that is always null"; the whole reason the column exists is that the one failure
   * mode nobody would otherwise be able to reconstruct leaves its evidence in it.
   */
  it('carries a non-null priorVisualStart through rather than dropping it', async () => {
    repository.findForPlan.mockResolvedValue([
      row({ priorVisualStart: new Date('2026-02-01T00:00:00.000Z') }),
    ]);

    const report = await service.report(principal(MEMBER), SLUG, PLAN_ID);

    expect(report.rows[0]?.priorVisualStart).toBe('2026-02-01');
  });

  /** A plan the migration changed nothing on is an empty report, never an absent one. */
  it('reports zero for a plan with no converted constraints', async () => {
    const report = await service.report(principal(MEMBER), SLUG, PLAN_ID);

    expect(report).toEqual({ planId: PLAN_ID, count: 0, rows: [] });
  });

  it('counts what it returns', async () => {
    repository.findForPlan.mockResolvedValue([row(), row({ id: 'row-2' }), row({ id: 'row-3' })]);

    const report = await service.report(principal(MEMBER), SLUG, PLAN_ID);

    expect(report.count).toBe(3);
    expect(report.rows).toHaveLength(3);
  });

  it('refuses a caller without plan:read', async () => {
    await expect(service.report(principal([]), SLUG, PLAN_ID)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(repository.findForPlan).not.toHaveBeenCalled();
  });

  /**
   * A plan that is not in the resolved organisation is an indistinguishable 404 — the uniform
   * anti-IDOR answer every plan-nested read gives, so this route is not an existence oracle for
   * another tenant's plan ids.
   */
  it('404s a plan outside the resolved organisation', async () => {
    plans.findActiveByIdInOrg.mockResolvedValue(null);

    await expect(service.report(principal(MEMBER), SLUG, PLAN_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(repository.findForPlan).not.toHaveBeenCalled();
  });

  /**
   * The repository is asked for the pair, never for the plan alone. `organization_id` on the row
   * is denormalised from the plan, so a mismatched pair cannot exist — which is exactly why the
   * predicate is worth passing: a repository that CAN be called with one should return nothing.
   */
  it('scopes the read by organisation as well as plan', async () => {
    await service.report(principal(MEMBER), SLUG, PLAN_ID);

    expect(repository.findForPlan).toHaveBeenCalledWith(PLAN_ID, ORG_ID);
  });

  it('does not let a member of another organisation read through a slug they do not hold', async () => {
    await expect(
      service.report(principal(MEMBER, OTHER_ORG), SLUG, PLAN_ID),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  /**
   * **Both permissions are asserted, not either**, and each half has its own case because a single
   * `||` is satisfied by whichever one the test happens to withhold. They are granted to the same
   * set today, so this guards a future narrowing rather than a present hole — the rule this epic's
   * own `cross-plan-revision-compare.controller.ts:94-96` states, applied here.
   */
  it('refuses a caller holding plan:read but not activity:read', async () => {
    await expect(service.report(principal(['plan:read']), SLUG, PLAN_ID)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(repository.findForPlan).not.toHaveBeenCalled();
  });

  it('refuses a caller holding activity:read but not plan:read', async () => {
    await expect(
      service.report(principal(['activity:read']), SLUG, PLAN_ID),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repository.findForPlan).not.toHaveBeenCalled();
  });
});
