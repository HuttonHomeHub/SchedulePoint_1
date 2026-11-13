import { describe, expect, it } from 'vitest';

import {
  DISMISSED_IDS_CAP,
  DISMISSED_PLANS_CAP,
  pruneDismissed,
  readDismissed,
  rememberDismissed,
} from './follow-plan-dismissals';

/** A `Storage` backed by a map, so the store cannot quietly acquire a dependency on `window`. */
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

const KEY = 'schedulepoint:follow-plan-dismissed:u1';
const WHO = { userId: 'u1', planId: 'p1' };

describe('follow plan dismissals', () => {
  it('remembers bars and reads them back', () => {
    const storage = memoryStorage();
    rememberDismissed(storage, { ...WHO, ids: ['a', 'b'], at: 1 });
    rememberDismissed(storage, { ...WHO, ids: ['b', 'c'], at: 2 });
    expect(readDismissed(storage, WHO)).toEqual(['a', 'b', 'c']);
  });

  it('leaves other plans and other people untouched', () => {
    const storage = memoryStorage();
    rememberDismissed(storage, { ...WHO, ids: ['a'], at: 1 });
    rememberDismissed(storage, { userId: 'u1', planId: 'p2', ids: ['x'], at: 2 });
    rememberDismissed(storage, { userId: 'u2', planId: 'p1', ids: ['y'], at: 3 });
    expect(readDismissed(storage, WHO)).toEqual(['a']);
    expect(readDismissed(storage, { userId: 'u1', planId: 'p2' })).toEqual(['x']);
    expect(readDismissed(storage, { userId: 'u2', planId: 'p1' })).toEqual(['y']);
    expect(readDismissed(storage, { userId: 'u3', planId: 'p1' })).toEqual([]);
  });

  it('drops the least recently written plan past the plan cap', () => {
    const storage = memoryStorage();
    for (let i = 0; i < DISMISSED_PLANS_CAP + 1; i += 1) {
      rememberDismissed(storage, { userId: 'u1', planId: `p${String(i)}`, ids: ['a'], at: i });
    }
    expect(readDismissed(storage, { userId: 'u1', planId: 'p0' })).toEqual([]);
    expect(readDismissed(storage, { userId: 'u1', planId: 'p1' })).toEqual(['a']);
    expect(
      readDismissed(storage, { userId: 'u1', planId: `p${String(DISMISSED_PLANS_CAP)}` }),
    ).toEqual(['a']);
  });

  it('keeps the newest ids past the per-plan cap', () => {
    const storage = memoryStorage();
    const ids = Array.from({ length: DISMISSED_IDS_CAP + 5 }, (_, i) => `id${String(i)}`);
    rememberDismissed(storage, { ...WHO, ids, at: 1 });
    const kept = readDismissed(storage, WHO);
    expect(kept).toHaveLength(DISMISSED_IDS_CAP);
    expect(kept[0]).toBe('id5');
    expect(kept.at(-1)).toBe(`id${String(DISMISSED_IDS_CAP + 4)}`);
  });

  it.each([
    ['corrupt JSON', '{nope'],
    ['a wrong version', JSON.stringify({ v: 2, plans: { p1: { at: 1, ids: ['a'] } } })],
    ['ids that are not an array', JSON.stringify({ v: 1, plans: { p1: { at: 1, ids: 'a' } } })],
    ['ids that are not strings', JSON.stringify({ v: 1, plans: { p1: { at: 1, ids: [1] } } })],
    ['a non-object', '42'],
  ])('reads %s as empty', (_name, raw) => {
    expect(readDismissed(memoryStorage({ [KEY]: raw }), WHO)).toEqual([]);
  });

  it('swallows a blocked store on every call', () => {
    const storage = hostileStorage();
    expect(() => rememberDismissed(storage, { ...WHO, ids: ['a'], at: 1 })).not.toThrow();
    expect(readDismissed(storage, WHO)).toEqual([]);
    expect(() => pruneDismissed(storage, { ...WHO, keep: new Set() })).not.toThrow();
  });

  it('swallows a quota error on write', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    expect(() => rememberDismissed(storage, { ...WHO, ids: ['a'], at: 1 })).not.toThrow();
  });

  it('prunes to the bars kept, and writes only when something was dropped', () => {
    const storage = memoryStorage();
    rememberDismissed(storage, { ...WHO, ids: ['a', 'b'], at: 1 });
    let writes = 0;
    const setItem = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
      writes += 1;
      setItem(key, value);
    };
    pruneDismissed(storage, { ...WHO, keep: new Set(['a', 'b', 'z']) });
    expect(writes).toBe(0);
    pruneDismissed(storage, { ...WHO, keep: new Set(['a']) });
    expect(writes).toBe(1);
    expect(readDismissed(storage, WHO)).toEqual(['a']);
  });
});
