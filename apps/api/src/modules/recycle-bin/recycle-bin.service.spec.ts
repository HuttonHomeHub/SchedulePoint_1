import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import { ForbiddenError } from '../../common/errors/domain-errors';
import type { OrganizationsService } from '../organizations/organizations.service';

import { decodeDeletedCursor, encodeDeletedCursor } from './recycle-bin.cursor';
import type { DeletedRow } from './recycle-bin.repository';
import { RecycleBinService } from './recycle-bin.service';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
/** Valid uuids — the cursor codec rejects non-uuid ids (defensive). */
const UUID_A = '00000000-0000-4000-8000-000000000000';
const UUID_B = '11111111-1111-4111-8111-111111111111';
const UUID_C = '22222222-2222-4222-8222-222222222222';

function row(overrides: Partial<DeletedRow> = {}): DeletedRow {
  return {
    kind: 'client',
    id: 'c1',
    name: 'Acme',
    deletedAt: new Date('2026-07-10T10:00:00.000Z'),
    parentActive: true,
    ...overrides,
  };
}

function principalWith(permissions: Permission[]): Principal {
  return new Principal(USER_ID, [{ organizationId: ORG_ID, role: 'PLANNER', permissions }]);
}

describe('RecycleBinService', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let repo: { findDeletedPage: ReturnType<typeof vi.fn> };
  let service: RecycleBinService;

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    repo = { findDeletedPage: vi.fn() };
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    service = new RecycleBinService(
      organizations as unknown as OrganizationsService,
      repo as unknown as never,
      logger,
    );
  });

  it('denies a caller without hierarchy read', async () => {
    await expect(service.list(principalWith([]), 'acme', { limit: 20 })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(repo.findDeletedPage).not.toHaveBeenCalled();
  });

  it('merges the three tables newest-deleted first and maps canRestore from parent state', async () => {
    repo.findDeletedPage.mockResolvedValue([
      row({
        kind: 'plan',
        id: 'p1',
        name: 'Baseline',
        deletedAt: new Date('2026-07-10T09:00:00.000Z'),
        parentActive: false,
      }),
      row({
        kind: 'client',
        id: 'c1',
        name: 'Acme',
        deletedAt: new Date('2026-07-10T11:00:00.000Z'),
        parentActive: true,
      }),
      row({
        kind: 'project',
        id: 'pr1',
        name: 'Riverside',
        deletedAt: new Date('2026-07-10T10:00:00.000Z'),
        parentActive: true,
      }),
    ]);

    const { items, meta } = await service.list(principalWith(['client:read']), 'acme', {
      limit: 20,
    });

    expect(items.map((i) => i.id)).toEqual(['c1', 'pr1', 'p1']); // deletedAt desc
    expect(items[0]).toMatchObject({ kind: 'client', name: 'Acme', canRestore: true });
    expect(items[2]).toMatchObject({ kind: 'plan', canRestore: false });
    expect(meta).toEqual({ nextCursor: null, hasMore: false });
  });

  it('over-fetches limit + 1 and returns a cursor for the next page when there is more', async () => {
    const rows: DeletedRow[] = [UUID_A, UUID_B, UUID_C].map((id, i) =>
      row({ id, deletedAt: new Date(Date.UTC(2026, 6, 10, 12 - i)) }),
    );
    repo.findDeletedPage.mockResolvedValue(rows);

    const { items, meta } = await service.list(principalWith(['client:read']), 'acme', {
      limit: 2,
    });

    expect(repo.findDeletedPage).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID, take: 3 }),
    );
    expect(items).toHaveLength(2);
    expect(meta.hasMore).toBe(true);
    expect(meta.nextCursor).not.toBeNull();
    // The cursor points at the last returned row (keyset position).
    expect(decodeDeletedCursor(meta.nextCursor as string)).toEqual({
      deletedAt: rows[1]?.deletedAt,
      id: UUID_B,
    });
  });

  it('passes a decoded cursor through to the repository', async () => {
    repo.findDeletedPage.mockResolvedValue([]);
    const cursor = encodeDeletedCursor({
      deletedAt: new Date('2026-07-10T08:00:00.000Z'),
      id: UUID_A,
    });

    await service.list(principalWith(['client:read']), 'acme', { limit: 20, cursor });

    expect(repo.findDeletedPage).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { deletedAt: new Date('2026-07-10T08:00:00.000Z'), id: UUID_A },
      }),
    );
  });

  it('ignores a malformed cursor rather than failing (degrades to first page)', async () => {
    repo.findDeletedPage.mockResolvedValue([]);

    await service.list(principalWith(['client:read']), 'acme', {
      limit: 20,
      cursor: 'not-a-cursor!!',
    });

    const call = repo.findDeletedPage.mock.calls[0]?.[0] as { cursor?: unknown };
    expect(call.cursor).toBeUndefined();
  });
});

describe('deleted-cursor codec', () => {
  it('round-trips a (deletedAt, id) position', () => {
    const at = new Date('2026-07-10T10:00:00.000Z');
    expect(decodeDeletedCursor(encodeDeletedCursor({ deletedAt: at, id: UUID_A }))).toEqual({
      deletedAt: at,
      id: UUID_A,
    });
  });

  it('rejects malformed input', () => {
    expect(decodeDeletedCursor('')).toBeUndefined();
    expect(decodeDeletedCursor('####')).toBeUndefined();
    expect(
      decodeDeletedCursor(Buffer.from('no-separator', 'utf8').toString('base64url')),
    ).toBeUndefined();
    // Valid timestamp but a non-uuid id → rejected (avoids a downstream DB error).
    expect(
      decodeDeletedCursor(
        Buffer.from('2026-07-10T10:00:00.000Z|not-a-uuid', 'utf8').toString('base64url'),
      ),
    ).toBeUndefined();
    // Valid uuid but an unparseable timestamp → rejected.
    expect(
      decodeDeletedCursor(Buffer.from(`not-a-date|${UUID_A}`, 'utf8').toString('base64url')),
    ).toBeUndefined();
  });
});
