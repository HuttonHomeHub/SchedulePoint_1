import { describe, expect, it } from 'vitest';

import type { Principal } from '../../common/auth/principal';

import { ActivityHistoryService } from './activity-history.service';

const CREATED = new Date('2026-03-04T05:06:07.000Z');

function build() {
  const prisma = {
    activity: { findFirst: () => Promise.resolve({ createdAt: CREATED }) },
    $queryRaw: () => Promise.resolve([]),
    user: { findMany: () => Promise.resolve([]) },
  };
  const organizations = { resolveScope: () => Promise.resolve({ organization: { id: 'org-1' } }) };
  const logger = { debug: () => undefined, warn: () => undefined };
  return new ActivityHistoryService(organizations as never, prisma as never, logger as never);
}

describe('ActivityHistoryService.list recordingSince', () => {
  it('is the activity’s creation instant: recording began with the activity', async () => {
    const principal = { can: () => true } as unknown as Principal;
    const { meta } = await build().list(principal, 'acme', 'act-1', { limit: 20 });
    expect(meta.recordingSince).toBe(CREATED.toISOString());
    expect(meta).toMatchObject({ hasMore: false, nextCursor: null });
  });
});
