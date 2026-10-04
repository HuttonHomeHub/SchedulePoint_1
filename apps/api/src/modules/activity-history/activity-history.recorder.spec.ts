import type { Prisma } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import { MAX_KEYED_ITEMS_PER_ENTRY } from './activity-history.constants';
import { linkItem, linkKey, linkState } from './activity-history.diff';
import {
  combineChanges,
  fixedChanges,
  noChanges,
  type ResolvedNames,
} from './activity-history.pending';
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
        writes: [{ activityId: 'a', planId: 'p', changes: fixedChanges(changes) }],
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

describe('the pending builders', () => {
  const names = (over: Partial<ResolvedNames> = {}): ResolvedNames => ({
    calendars: new Map(),
    parents: new Map(),
    resources: new Map(),
    activities: new Map(),
    ...over,
  });
  const lag = { type: 'FS', lagMinutes: 0, lagCalendar: 'PROJECT_DEFAULT' } as const;

  it('knows an unchanged link has nothing to record without any name', () => {
    const writes = recorder().linkWrites({
      id: 'l',
      planId: 'p',
      predecessorId: 'a',
      successorId: 'b',
      before: lag,
      after: { ...lag },
    });
    expect(writes).toEqual([]);
  });

  it('writes both ends of a link, each naming the OTHER end from the probed activities', () => {
    const [out, into] = recorder().linkWrites({
      id: 'l',
      planId: 'p',
      predecessorId: 'a',
      successorId: 'b',
      before: null,
      after: lag,
    });
    const probed = names({
      activities: new Map([
        ['a', { id: 'a', code: 'A', name: 'Excavate' }],
        ['b', { id: 'b', code: null, name: 'Pour slab' }],
      ]),
    });
    expect(out?.changes.keys).toEqual([linkKey('l')]);
    expect(out?.changes.build(probed)[linkKey('l')]).toMatchObject({
      dir: 'OUT',
      other: { id: 'b', name: 'Pour slab' },
    });
    expect(into?.changes.build(probed)[linkKey('l')]).toMatchObject({
      dir: 'IN',
      other: { id: 'a', name: 'Excavate' },
    });
    expect(() => out?.changes.build(names())).toThrow(/endpoint of link l is gone/);
  });

  it('asks for the names of a changed reference only, and reports no key when nothing changed', () => {
    const row = {
      calendarId: 'c1',
      parentId: null,
    } as unknown as Parameters<ActivityHistoryRecorder['activityFieldChanges']>[0];
    const unchanged = recorder().activityFieldChanges(row, row);
    expect(unchanged.keys).toEqual([]);
    expect(unchanged.refs.calendarIds).toEqual([]);
  });

  it('combines parts: keys and refs are unions, and every part builds', () => {
    const combined = combineChanges(
      fixedChanges({ durationMinutes: { from: 1, to: 2 } }),
      noChanges(),
      fixedChanges({ name: { from: 'a', to: 'b' } }),
    );
    expect(combined.keys).toEqual(['durationMinutes', 'name']);
    expect(Object.keys(combined.build(names()))).toEqual(['durationMinutes', 'name']);
  });
});
