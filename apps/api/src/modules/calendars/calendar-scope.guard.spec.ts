import type { Calendar, Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotFoundError, ValidationError } from '../../common/errors/domain-errors';

import { assertCalendarUsableBy } from './calendar-scope.guard';
import type { CalendarRepository } from './calendar.repository';

const ORG_ID = 'org-1';
const PROJECT_A = 'project-a';
const PROJECT_B = 'project-b';

function calendar(overrides: Partial<Calendar> = {}): Calendar {
  return {
    id: 'cal-1',
    organizationId: ORG_ID,
    name: 'Standard',
    description: null,
    scope: 'ORG',
    projectId: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-1',
    updatedBy: 'user-1',
    deletedAt: null,
    deleteBatchId: null,
    ...overrides,
  };
}

/**
 * The truth table for THE shared calendar-scope invariant (ADR-0053 §2), across all three
 * holder shapes: a plan (its own project), an activity (its plan's project) and a resource
 * (org-global ⇒ `projectId: null`). Every seam calls this one function, so proving the table
 * here proves it for every seam; the seams' own specs and the e2e suite then prove they call
 * it (and with which project).
 */
describe('assertCalendarUsableBy', () => {
  let repo: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let tx: { $executeRaw: ReturnType<typeof vi.fn> };

  const run = (projectId: string | null): Promise<Calendar> =>
    assertCalendarUsableBy(
      tx as unknown as Prisma.TransactionClient,
      repo as unknown as CalendarRepository,
      {
        calendarId: 'cal-1',
        organizationId: ORG_ID,
        projectId,
      },
    );

  beforeEach(() => {
    repo = { findActiveByIdInOrg: vi.fn() };
    tx = { $executeRaw: vi.fn() };
  });

  describe('an ORG-scoped calendar', () => {
    beforeEach(() => repo.findActiveByIdInOrg.mockResolvedValue(calendar({ scope: 'ORG' })));

    it.each([
      ['a plan in project A', PROJECT_A],
      ['an activity in project B', PROJECT_B],
      ['an org-global resource', null],
    ])('is usable by %s', async (_label, projectId) => {
      await expect(run(projectId)).resolves.toMatchObject({ id: 'cal-1', scope: 'ORG' });
    });
  });

  describe('a PROJECT-scoped calendar owned by project A', () => {
    beforeEach(() =>
      repo.findActiveByIdInOrg.mockResolvedValue(
        calendar({ scope: 'PROJECT', projectId: PROJECT_A }),
      ),
    );

    it('is usable inside its own project', async () => {
      await expect(run(PROJECT_A)).resolves.toMatchObject({ projectId: PROJECT_A });
    });

    it('is rejected in another project (422 CALENDAR_WRONG_SCOPE, naming the owner)', async () => {
      await expect(run(PROJECT_B)).rejects.toBeInstanceOf(ValidationError);
      await expect(run(PROJECT_B)).rejects.toMatchObject({
        details: { reason: 'CALENDAR_WRONG_SCOPE', projectId: PROJECT_A },
      });
    });

    it('is rejected by an org-global holder (422 RESOURCE_REQUIRES_ORG_CALENDAR)', async () => {
      await expect(run(null)).rejects.toBeInstanceOf(ValidationError);
      await expect(run(null)).rejects.toMatchObject({
        details: { reason: 'RESOURCE_REQUIRES_ORG_CALENDAR', projectId: PROJECT_A },
      });
    });
  });

  describe('a calendar that does not resolve in this org (foreign, deleted or unknown)', () => {
    beforeEach(() => repo.findActiveByIdInOrg.mockResolvedValue(null));

    // 404 for every holder shape — the tier must never become a cross-tenant existence oracle,
    // so "in another org" and "does not exist" are indistinguishable.
    it.each([
      ['a plan', PROJECT_A],
      ['an activity', PROJECT_B],
      ['a resource', null],
    ])('is a 404 for %s, never a scope error', async (_label, projectId) => {
      await expect(run(projectId)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  it('takes the calendar advisory lock BEFORE reading the row (no TOCTOU with a delete)', async () => {
    repo.findActiveByIdInOrg.mockResolvedValue(calendar());
    await run(PROJECT_A);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      repo.findActiveByIdInOrg.mock.invocationCallOrder[0] as number,
    );
  });

  it('scopes the load by organisation (anti-IDOR) and runs inside the caller transaction', async () => {
    repo.findActiveByIdInOrg.mockResolvedValue(calendar());
    await run(PROJECT_A);
    expect(repo.findActiveByIdInOrg).toHaveBeenCalledWith('cal-1', ORG_ID, tx);
  });
});
