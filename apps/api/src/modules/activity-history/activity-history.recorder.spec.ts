import type { Prisma } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import { MAX_KEYED_ITEMS_PER_ENTRY } from './activity-history.constants';
import { linkItem, linkKey, linkState } from './activity-history.diff';
import { ActivityHistoryRecorder } from './activity-history.recorder';
import type { StoredChanges } from './activity-history.types';

const recorder = () => new ActivityHistoryRecorder({ debug: vi.fn() } as unknown as PinoLogger);

describe('ActivityHistoryRecorder guards', () => {
  it('refuses a client that is not a transaction, because the lock would not hold', async () => {
    const root = { $transaction: vi.fn() } as unknown as Prisma.TransactionClient;
    await expect(
      recorder().record(root, { actorUserId: 'u', scope: 'DEFINITION', writes: [] }),
    ).rejects.toThrow(/transaction client/);
  });

  it('refuses a single write carrying more keyed items than an entry may hold', async () => {
    const tx = {} as unknown as Prisma.TransactionClient;
    const changes: StoredChanges = {};
    for (let i = 0; i <= MAX_KEYED_ITEMS_PER_ENTRY; i += 1) {
      changes[linkKey(`l${i}`)] = linkItem(
        'IN',
        { id: 'o', code: null, name: 'Other' },
        null,
        linkState({ type: 'FS', lagMinutes: 0, lagCalendar: 'PROJECT_DEFAULT' }),
      );
    }
    await expect(
      recorder().record(tx, {
        actorUserId: 'u',
        scope: 'LOGIC',
        writes: [{ activityId: 'a', planId: 'p', changes }],
      }),
    ).rejects.toThrow(/exceeds/);
  });

  it('refuses a second call in one transaction', async () => {
    const tx = {} as unknown as Prisma.TransactionClient;
    const r = recorder();
    await r.record(tx, { actorUserId: 'u', scope: 'DEFINITION', writes: [] });
    await expect(
      r.record(tx, { actorUserId: 'u', scope: 'DEFINITION', writes: [] }),
    ).rejects.toThrow(/twice/);
  });
});
