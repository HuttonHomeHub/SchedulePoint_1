import { describe, expect, it } from 'vitest';

import {
  RECENT_PLANS_CAP,
  forgetAllForUser,
  prunePlans,
  readRecentPlanIds,
  rememberPlan,
} from './recent-plans';

/**
 * A `Storage` backed by a map, so these run without a browser and the model cannot quietly acquire
 * a dependency on `window`.
 */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  };
}

/** Private mode, a disabled store, a full quota: every method throws. */
function hostileStorage(): Storage {
  const throwing = (): never => {
    throw new DOMException('denied');
  };
  return {
    get length(): number {
      return throwing();
    },
    clear: throwing,
    getItem: throwing,
    key: throwing,
    removeItem: throwing,
    setItem: throwing,
  };
}

const WHO = { userId: 'u1', orgSlug: 'acme' };

describe('recent plans', () => {
  it('remembers a plan and reads it back', () => {
    const storage = memoryStorage();
    rememberPlan(storage, { ...WHO, planId: 'p1', at: 1 });
    expect(readRecentPlanIds(storage, WHO)).toEqual(['p1']);
  });

  it('puts the most recent first', () => {
    const storage = memoryStorage();
    rememberPlan(storage, { ...WHO, planId: 'p1', at: 1 });
    rememberPlan(storage, { ...WHO, planId: 'p2', at: 2 });
    expect(readRecentPlanIds(storage, WHO)).toEqual(['p2', 'p1']);
  });

  it('moves a re-opened plan rather than listing it twice', () => {
    const storage = memoryStorage();
    rememberPlan(storage, { ...WHO, planId: 'p1', at: 1 });
    rememberPlan(storage, { ...WHO, planId: 'p2', at: 2 });
    rememberPlan(storage, { ...WHO, planId: 'p1', at: 3 });
    expect(readRecentPlanIds(storage, WHO)).toEqual(['p1', 'p2']);
  });

  it(`keeps at most ${RECENT_PLANS_CAP}, dropping the oldest`, () => {
    const storage = memoryStorage();
    for (let i = 0; i < RECENT_PLANS_CAP + 3; i += 1) {
      rememberPlan(storage, { ...WHO, planId: `p${i}`, at: i });
    }
    const ids = readRecentPlanIds(storage, WHO);
    expect(ids).toHaveLength(RECENT_PLANS_CAP);
    expect(ids[0]).toBe(`p${RECENT_PLANS_CAP + 2}`);
    expect(ids).not.toContain('p0');
  });

  it('never persists a plan name — only an id and a time', () => {
    // The load-bearing assertion of the whole model (§4.9 D10b). If a name ever lands in here, a
    // rename stops correcting itself and a stale name becomes displayable.
    const storage = memoryStorage();
    rememberPlan(storage, { ...WHO, planId: 'p1', at: 1 });
    const raw = storage.getItem('schedulepoint-recent-plans:u1:acme');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as Record<string, unknown>[];
    expect(Object.keys(parsed[0]!).sort()).toEqual(['at', 'id']);
  });

  it('keeps two accounts on one browser apart', () => {
    const storage = memoryStorage();
    rememberPlan(storage, { userId: 'u1', orgSlug: 'acme', planId: 'p1', at: 1 });
    rememberPlan(storage, { userId: 'u2', orgSlug: 'acme', planId: 'p2', at: 2 });
    expect(readRecentPlanIds(storage, { userId: 'u1', orgSlug: 'acme' })).toEqual(['p1']);
    expect(readRecentPlanIds(storage, { userId: 'u2', orgSlug: 'acme' })).toEqual(['p2']);
  });

  it('keeps two organisations apart for one account', () => {
    const storage = memoryStorage();
    rememberPlan(storage, { userId: 'u1', orgSlug: 'acme', planId: 'p1', at: 1 });
    rememberPlan(storage, { userId: 'u1', orgSlug: 'beta', planId: 'p2', at: 2 });
    expect(readRecentPlanIds(storage, { userId: 'u1', orgSlug: 'acme' })).toEqual(['p1']);
  });

  it('drops ids the server did not return, and leaves the rest', () => {
    const storage = memoryStorage();
    rememberPlan(storage, { ...WHO, planId: 'p1', at: 1 });
    rememberPlan(storage, { ...WHO, planId: 'p2', at: 2 });
    prunePlans(storage, { ...WHO, keep: ['p2'] });
    expect(readRecentPlanIds(storage, WHO)).toEqual(['p2']);
  });

  it('does not rewrite the store when nothing was pruned', () => {
    const storage = memoryStorage();
    rememberPlan(storage, { ...WHO, planId: 'p1', at: 1 });
    const before = storage.getItem('schedulepoint-recent-plans:u1:acme');
    prunePlans(storage, { ...WHO, keep: ['p1'] });
    expect(storage.getItem('schedulepoint-recent-plans:u1:acme')).toBe(before);
  });

  it('forgets every organisation for one account, and nobody else’s', () => {
    const storage = memoryStorage();
    rememberPlan(storage, { userId: 'u1', orgSlug: 'acme', planId: 'p1', at: 1 });
    rememberPlan(storage, { userId: 'u1', orgSlug: 'beta', planId: 'p2', at: 2 });
    rememberPlan(storage, { userId: 'u2', orgSlug: 'acme', planId: 'p3', at: 3 });
    forgetAllForUser(storage, 'u1');
    expect(readRecentPlanIds(storage, { userId: 'u1', orgSlug: 'acme' })).toEqual([]);
    expect(readRecentPlanIds(storage, { userId: 'u1', orgSlug: 'beta' })).toEqual([]);
    expect(readRecentPlanIds(storage, { userId: 'u2', orgSlug: 'acme' })).toEqual(['p3']);
  });

  it('does not forget an account whose id is a prefix of another', () => {
    // `u1` and `u12` share a prefix; the separator in the key is what keeps them apart, and this
    // is the test that says so rather than leaving it to whoever next edits `keyFor`.
    const storage = memoryStorage();
    rememberPlan(storage, { userId: 'u1', orgSlug: 'acme', planId: 'p1', at: 1 });
    rememberPlan(storage, { userId: 'u12', orgSlug: 'acme', planId: 'p2', at: 2 });
    forgetAllForUser(storage, 'u1');
    expect(readRecentPlanIds(storage, { userId: 'u12', orgSlug: 'acme' })).toEqual(['p2']);
  });
});

describe('recent plans without a usable store', () => {
  it('reads as empty rather than throwing', () => {
    expect(readRecentPlanIds(hostileStorage(), WHO)).toEqual([]);
  });

  it('swallows a failed write — the section is simply absent', () => {
    expect(() => rememberPlan(hostileStorage(), { ...WHO, planId: 'p1', at: 1 })).not.toThrow();
  });

  it('swallows a failed prune and a failed sign-out sweep', () => {
    expect(() => prunePlans(hostileStorage(), { ...WHO, keep: [] })).not.toThrow();
    expect(() => forgetAllForUser(hostileStorage(), 'u1')).not.toThrow();
  });

  it('treats someone else’s data at our key as nothing', () => {
    const storage = memoryStorage({ 'schedulepoint-recent-plans:u1:acme': 'not json' });
    expect(readRecentPlanIds(storage, WHO)).toEqual([]);
  });

  it('discards entries of the wrong shape rather than rendering them', () => {
    const storage = memoryStorage({
      'schedulepoint-recent-plans:u1:acme': JSON.stringify([{ id: 'p1', at: 1 }, { id: 7 }, null]),
    });
    expect(readRecentPlanIds(storage, WHO)).toEqual(['p1']);
  });
});
