import type { Prisma } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import type { StampedLink } from '../../common/hierarchy/hierarchy-lifecycle.service';

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
    plans: new Map(),
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

describe('the batch path', () => {
  const NOW = new Date('2026-10-04T10:00:00.000Z');
  const probeRow = (activityId: string, extra: Record<string, unknown> = {}) => ({
    activityId,
    organizationId: 'org',
    planId: 'plan',
    now: NOW,
    entryId: null,
    actorUserId: null,
    scope: null,
    firstRecordedAt: null,
    lastRecordedAt: null,
    editCount: null,
    batchId: null,
    changes: null,
    code: null,
    name: activityId,
    planName: 'Baseline',
    names: null,
    ...extra,
  });
  const fakeTx = (rows: unknown[]) => {
    const executed: unknown[][] = [];
    const tx = {
      $executeRaw: vi.fn((...args: unknown[]) => {
        executed.push(args);
        return Promise.resolve(0);
      }),
      $queryRaw: vi.fn().mockResolvedValue(rows),
    };
    return { tx: tx as unknown as Prisma.TransactionClient, executed };
  };
  const stamped = (id: string, predecessorId: string, successorId: string): StampedLink => ({
    id,
    planId: 'plan',
    predecessorId,
    successorId,
    type: 'FS',
    lagMinutes: 0,
    lagCalendar: 'PROJECT_DEFAULT',
  });

  it('takes the plan lock exclusively and no activity lock, whatever the number of rows', async () => {
    const { tx, executed } = fakeTx([probeRow('a'), probeRow('b')]);
    await recorder().record(tx, {
      actorUserId: 'u',
      scope: 'PLACEMENT',
      batch: {},
      writes: [
        {
          activityId: 'a',
          planId: 'plan',
          changes: fixedChanges({
            laneIndex: { from: 0, to: 1 },
            visualStart: { from: null, to: '2026-01-01' },
          }),
        },
        {
          activityId: 'b',
          planId: 'plan',
          changes: fixedChanges({ visualStart: { from: null, to: '2026-01-01' } }),
        },
      ],
    });
    const lock = executed[0] as unknown[];
    expect(lock).toContain('exclusive');
    // Plans only: the lock statement's activity array is empty.
    expect(lock.slice(1).filter((v) => Array.isArray(v))).toEqual([['plan'], []]);
    expect(executed).toHaveLength(2);
  });

  it('writes one entry per activity sharing a batch id, and counts the entries as its size', async () => {
    const { tx, executed } = fakeTx([probeRow('a'), probeRow('b')]);
    await recorder().record(tx, {
      actorUserId: 'u',
      scope: 'PLACEMENT',
      batch: { origin: 'SUMMARY_DISSOLVED' },
      writes: ['a', 'b'].map((id) => ({
        activityId: id,
        planId: 'plan',
        changes: fixedChanges({ visualStart: { from: null, to: '2026-01-01' } }),
      })),
    });
    const flush = (executed[1] as unknown[]).slice(1);
    expect(flush).toContain(2);
    expect(flush).toContain('SUMMARY_DISSOLVED');
    const id = flush.find((v) => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v));
    expect(id).toBeDefined();
  });

  it('does not merge into the latest entry even when the same person made it a second ago', async () => {
    const recent = new Date(NOW.getTime() - 1000);
    const { tx, executed } = fakeTx([
      probeRow('a', {
        entryId: 'e1',
        actorUserId: 'u',
        scope: 'PLACEMENT',
        firstRecordedAt: recent,
        lastRecordedAt: recent,
        editCount: 1,
        changes: { visualStart: { from: null, to: '2026-01-01' } },
      }),
    ]);
    await recorder().record(tx, {
      actorUserId: 'u',
      scope: 'PLACEMENT',
      batch: {},
      writes: [
        {
          activityId: 'a',
          planId: 'plan',
          changes: fixedChanges({ visualStart: { from: '2026-01-01', to: '2026-02-01' } }),
        },
      ],
    });
    const flush = (executed[1] as unknown[]).slice(1);
    const arrays = flush.filter((v): v is unknown[] => Array.isArray(v));
    // The merge arrays (the second group) are empty; the one entry is an insert.
    expect(arrays.filter((a) => a.length > 0).every((a) => a.length === 1)).toBe(true);
    expect(arrays.some((a) => a.includes('e1'))).toBe(false);
  });

  it('splits a survivor with more than sixteen lost links into chunks of sixteen', async () => {
    const links = Array.from({ length: 17 }, (_, i) => stamped(`l${i}`, `gone${i}`, 'hub'));
    const r = recorder();
    const writes = r.knockOnLinkWrites(
      links,
      new Set(links.map((l) => l.predecessorId)),
      'removed',
    );
    expect(writes).toHaveLength(1);
    const names = {
      calendars: new Map(),
      parents: new Map(),
      resources: new Map(),
      activities: new Map(
        links.map((l) => [
          l.predecessorId,
          { id: l.predecessorId, code: null, name: l.predecessorId },
        ]),
      ),
      plans: new Map(),
    };
    expect(writes[0]?.changes.refs.activityIds).toHaveLength(17);
    const built = writes[0]?.changes.build(names) as Record<string, unknown>;
    expect(Object.keys(built)).toHaveLength(17);

    const { tx, executed } = fakeTx([
      probeRow('hub', {
        names: {
          calendars: {},
          parents: {},
          resources: {},
          others: Object.fromEntries(
            links.map((l) => [l.predecessorId, { code: null, name: l.predecessorId }]),
          ),
        },
      }),
    ]);
    await r.record(tx, {
      actorUserId: 'u',
      scope: 'LOGIC',
      batch: { origin: 'ACTIVITY_DELETED' },
      writes,
    });
    const flush = (executed[1] as unknown[]).slice(1);
    const chunkDocs = flush.find(
      (v): v is string[] =>
        Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && v[0].startsWith('{'),
    );
    expect(chunkDocs).toBeDefined();
    expect((chunkDocs ?? []).map((d) => Object.keys(JSON.parse(d) as object).length)).toEqual([
      16, 1,
    ]);
    expect(flush).toContain(2);
  });
});

describe('the knock-on and batch builders', () => {
  const link = (id: string, predecessorId: string, successorId: string): StampedLink => ({
    id,
    planId: 'plan',
    predecessorId,
    successorId,
    type: 'SS',
    lagMinutes: 480,
    lagCalendar: 'TWENTY_FOUR_HOUR',
  });
  const names = (): ResolvedNames => ({
    calendars: new Map(),
    parents: new Map([['s', 'Phase']]),
    resources: new Map(),
    activities: new Map([
      ['gone', { id: 'gone', code: '10', name: 'Dig' }],
      ['kept', { id: 'kept', code: null, name: 'Pour' }],
    ]),
    plans: new Map(),
  });

  it('writes one item per link to each SURVIVING end only, as removed or as restored', () => {
    const r = recorder();
    const removed = r.knockOnLinkWrites([link('l1', 'gone', 'kept')], new Set(['gone']), 'removed');
    expect(removed.map((w) => w.activityId)).toEqual(['kept']);
    expect(removed[0]?.changes.build(names())[linkKey('l1')]).toEqual({
      dir: 'IN',
      other: { id: 'gone', code: '10', name: 'Dig' },
      from: { type: 'SS', lagMinutes: 480, lagCalendar: 'TWENTY_FOUR_HOUR' },
      to: null,
    });
    const restored = r.knockOnLinkWrites(
      [link('l1', 'kept', 'gone')],
      new Set(['gone']),
      'restored',
    );
    expect(restored[0]?.changes.build(names())[linkKey('l1')]).toMatchObject({
      dir: 'OUT',
      from: null,
      to: { type: 'SS' },
    });
  });

  it('writes nothing for a link whose both ends are gone, or for no link', () => {
    const r = recorder();
    expect(r.knockOnLinkWrites([link('l1', 'a', 'b')], new Set(['a', 'b']), 'removed')).toEqual([]);
    expect(r.knockOnLinkWrites([], new Set(), 'removed')).toEqual([]);
  });

  it('groups several links to one survivor into one write', () => {
    const writes = recorder().knockOnLinkWrites(
      [link('l1', 'g1', 'kept'), link('l2', 'g2', 'kept')],
      new Set(['g1', 'g2']),
      'removed',
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]?.changes.keys).toEqual([linkKey('l1'), linkKey('l2')]);
  });

  it('records a placement only where it changed, and a lane-less move as no lane item', () => {
    const base = {
      constraintType: null,
      constraintDate: null,
      visualStart: null,
      laneIndex: 2,
    } as const;
    const writes = recorder().placementWrites('plan', [
      {
        id: 'moved',
        before: base,
        after: { ...base, visualStart: new Date('2026-02-02T00:00:00Z') },
      },
      { id: 'still', before: base, after: { ...base } },
    ]);
    expect(writes[0]?.changes.keys).toEqual(['visualStart']);
    expect(writes[1]?.changes.keys).toEqual([]);
  });

  it('names both WBS parents from the probe, and none for an unchanged parent', () => {
    const writes = recorder().parentWrites('plan', [
      { id: 'a', before: null, after: 's' },
      { id: 'b', before: 's', after: 's' },
    ]);
    expect(writes[0]?.changes.build(names())).toEqual({
      parentId: { from: null, to: { id: 's', name: 'Phase' } },
    });
    expect(writes[1]?.changes.keys).toEqual([]);
    expect(writes[0]?.changes.refs.parentIds).toEqual(['s']);
  });

  it('names a cross-plan link end with its plan, keyed xlink', () => {
    const [out, into] = recorder().crossPlanLinkWrites({
      id: 'x',
      predecessorId: 'p',
      successorId: 's',
      predecessorPlanId: 'plan-1',
      successorPlanId: 'plan-2',
      before: null,
      after: { type: 'FS', lagMinutes: 0, lagCalendar: 'PROJECT_DEFAULT' },
    });
    const probed: ResolvedNames = {
      ...names(),
      activities: new Map([
        ['p', { id: 'p', code: null, name: 'Dig' }],
        ['s', { id: 's', code: null, name: 'Fit out' }],
      ]),
      plans: new Map([
        ['p', { id: 'plan-1', name: 'Phase 1' }],
        ['s', { id: 'plan-2', name: 'Phase 2' }],
      ]),
    };
    expect(out?.planId).toBe('plan-1');
    expect(into?.planId).toBe('plan-2');
    expect(out?.changes.build(probed)['xlink:x']).toMatchObject({
      dir: 'OUT',
      other: { id: 's', name: 'Fit out', planId: 'plan-2', planName: 'Phase 2' },
      from: null,
    });
    expect(into?.changes.build(probed)['xlink:x']).toMatchObject({
      dir: 'IN',
      other: { id: 'p', planName: 'Phase 1' },
    });
  });
});
