import type { Activity, Note, Plan } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ActivityRepository } from '../activities/activity.repository';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { PlanRepository } from '../plans/plan.repository';

import type { NoteRepository } from './note.repository';
import { NotesService } from './notes.service';

const ORG_ID = 'org-1';
const AUTHOR_ID = 'user-author';
const OTHER_ID = 'user-other';
const PLAN_ID = 'plan-1';
const ACTIVITY_ID = 'activity-1';
const NOTE_ID = 'note-1';

function plan(overrides: Partial<Plan> = {}): Plan {
  return { id: PLAN_ID, organizationId: ORG_ID, projectId: 'project-1', ...overrides } as Plan;
}

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: ACTIVITY_ID,
    organizationId: ORG_ID,
    planId: PLAN_ID,
    ...overrides,
  } as Activity;
}

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: NOTE_ID,
    organizationId: ORG_ID,
    entityType: 'PLAN',
    planId: PLAN_ID,
    activityId: null,
    body: 'A note',
    version: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdBy: AUTHOR_ID,
    updatedBy: AUTHOR_ID,
    deletedAt: null,
    deleteBatchId: null,
    ...overrides,
  };
}

function principalWith(permissions: Permission[], userId = AUTHOR_ID): Principal {
  return new Principal(userId, [{ organizationId: ORG_ID, role: 'CONTRIBUTOR', permissions }]);
}

const READ: Permission[] = ['note:read'];
const ALL: Permission[] = ['note:read', 'note:create', 'note:update', 'note:delete'];

describe('NotesService', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let plans: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let activities: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let repo: {
    create: ReturnType<typeof vi.fn>;
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
    listByPlan: ReturnType<typeof vi.fn>;
    listByActivity: ReturnType<typeof vi.fn>;
    countActiveByActivityForPlan: ReturnType<typeof vi.fn>;
    updateIfVersionMatches: ReturnType<typeof vi.fn>;
    softDelete: ReturnType<typeof vi.fn>;
    findAuthorNames: ReturnType<typeof vi.fn>;
  };
  let prisma: { $transaction: ReturnType<typeof vi.fn> };
  let service: NotesService;

  beforeEach(() => {
    organizations = {
      resolveScope: vi
        .fn()
        .mockResolvedValue({ organization: { id: ORG_ID }, role: 'CONTRIBUTOR' }),
    };
    plans = { findActiveByIdInOrg: vi.fn().mockResolvedValue(plan()) };
    activities = { findActiveByIdInOrg: vi.fn().mockResolvedValue(activity()) };
    repo = {
      create: vi.fn((data) => Promise.resolve(note(data))),
      findActiveByIdInOrg: vi.fn().mockResolvedValue(note()),
      listByPlan: vi.fn().mockResolvedValue([]),
      listByActivity: vi.fn().mockResolvedValue([]),
      countActiveByActivityForPlan: vi.fn().mockResolvedValue([]),
      updateIfVersionMatches: vi.fn().mockResolvedValue(1),
      softDelete: vi.fn().mockResolvedValue(1),
      findAuthorNames: vi.fn().mockResolvedValue(new Map([[AUTHOR_ID, 'Ada Author']])),
    };
    const tx = {};
    prisma = { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(tx)) };
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    service = new NotesService(
      organizations as unknown as OrganizationsService,
      plans as unknown as PlanRepository,
      activities as unknown as ActivityRepository,
      repo as unknown as NoteRepository,
      prisma as unknown as PrismaService,
      logger,
    );
  });

  describe('createForPlan', () => {
    it('derives org/entityType/planId from the resolved parent, never from input, and resolves authorName', async () => {
      const result = await service.createForPlan(principalWith(ALL), 'acme', PLAN_ID, {
        body: 'Weekly update',
      });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          entityType: 'PLAN',
          planId: PLAN_ID,
          activityId: null,
          body: 'Weekly update',
          createdBy: AUTHOR_ID,
          updatedBy: AUTHOR_ID,
        }),
      );
      expect(result.authorName).toBe('Ada Author');
    });

    it('trims the body and rejects a whitespace-only body (422)', async () => {
      await service.createForPlan(principalWith(ALL), 'acme', PLAN_ID, { body: '  hi  ' });
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ body: 'hi' }));

      await expect(
        service.createForPlan(principalWith(ALL), 'acme', PLAN_ID, { body: '   ' }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('forbids a caller without note:create (403)', async () => {
      await expect(
        service.createForPlan(principalWith(READ), 'acme', PLAN_ID, { body: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('404s when the parent plan is missing or in another org (anti-IDOR)', async () => {
      plans.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.createForPlan(principalWith(ALL), 'acme', PLAN_ID, { body: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('createForActivity', () => {
    it("copies the activity's planId and sets activityId from the resolved parent", async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(activity({ planId: 'plan-xyz' }));
      await service.createForActivity(principalWith(ALL), 'acme', ACTIVITY_ID, { body: 'note' });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'ACTIVITY',
          planId: 'plan-xyz',
          activityId: ACTIVITY_ID,
        }),
      );
    });

    it('404s when the parent activity is missing or in another org (anti-IDOR)', async () => {
      activities.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.createForActivity(principalWith(ALL), 'acme', ACTIVITY_ID, { body: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('update', () => {
    it('lets the author edit and bumps via optimistic version', async () => {
      repo.findActiveByIdInOrg
        .mockResolvedValueOnce(note())
        .mockResolvedValueOnce(note({ version: 2, body: 'edited' }));
      const result = await service.update(principalWith(ALL), 'acme', NOTE_ID, {
        body: 'edited',
        version: 1,
      });
      expect(repo.updateIfVersionMatches).toHaveBeenCalledWith(
        NOTE_ID,
        1,
        { body: 'edited' },
        AUTHOR_ID,
      );
      expect(result.note.version).toBe(2);
      expect(result.note.body).toBe('edited');
    });

    it("forbids a NON-author from editing another's note (403) even with note:update", async () => {
      repo.findActiveByIdInOrg.mockResolvedValue(note({ createdBy: AUTHOR_ID }));
      await expect(
        service.update(principalWith(ALL, OTHER_ID), 'acme', NOTE_ID, {
          body: 'hijack',
          version: 1,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(repo.updateIfVersionMatches).not.toHaveBeenCalled();
    });

    it('returns 409 on a stale version', async () => {
      repo.updateIfVersionMatches.mockResolvedValue(0);
      await expect(
        service.update(principalWith(ALL), 'acme', NOTE_ID, { body: 'edited', version: 1 }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('rejects a whitespace-only edited body (422)', async () => {
      await expect(
        service.update(principalWith(ALL), 'acme', NOTE_ID, { body: '   ', version: 1 }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(repo.updateIfVersionMatches).not.toHaveBeenCalled();
    });

    it('404s when the note is missing or in another org (anti-IDOR)', async () => {
      repo.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.update(principalWith(ALL), 'acme', NOTE_ID, { body: 'x', version: 1 }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('remove', () => {
    it('lets the author soft-delete their own note', async () => {
      await service.remove(principalWith(ALL), 'acme', NOTE_ID);
      expect(repo.softDelete).toHaveBeenCalledWith(NOTE_ID, AUTHOR_ID, expect.anything());
    });

    it("forbids a NON-author from deleting another's note (403)", async () => {
      repo.findActiveByIdInOrg.mockResolvedValue(note({ createdBy: AUTHOR_ID }));
      await expect(
        service.remove(principalWith(ALL, OTHER_ID), 'acme', NOTE_ID),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(repo.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('lists & counts', () => {
    it('over-fetches by one and returns a cursor when there is a further page', async () => {
      const rows = Array.from({ length: 21 }, (_, i) => note({ id: `note-${i}` }));
      repo.listByPlan.mockResolvedValue(rows);
      const { items, meta } = await service.listByPlan(principalWith(READ), 'acme', PLAN_ID, {
        limit: 20,
      });
      expect(repo.listByPlan).toHaveBeenCalledWith(expect.objectContaining({ take: 21 }));
      expect(items).toHaveLength(20);
      expect(meta.hasMore).toBe(true);
      expect(meta.nextCursor).toBe('note-19');
    });

    it('maps grouped counts through for a plan', async () => {
      repo.countActiveByActivityForPlan.mockResolvedValue([{ activityId: ACTIVITY_ID, count: 3 }]);
      const counts = await service.countByActivityForPlan(principalWith(READ), 'acme', PLAN_ID);
      expect(counts).toEqual([{ activityId: ACTIVITY_ID, count: 3 }]);
    });

    it('forbids listing without note:read (403)', async () => {
      await expect(
        service.listByPlan(principalWith([]), 'acme', PLAN_ID, { limit: 20 }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
