import { describe, expect, it } from 'vitest';

import { dismiss, forgetDismissalsForUser, isDismissed } from './dismissal';

/**
 * A `Storage` built on a `Map` — a **conforming** implementation rather than a stand-in for
 * `localStorage`.
 *
 * That distinction is the point, and `recent-plans.ts` records the bug it catches: a sweep written
 * with `Object.keys(storage)` works on a real `localStorage`, because the Web Storage API happens
 * to expose stored keys as own enumerable properties, and silently finds nothing here, because this
 * one exposes its method names instead. The interface promises `length` and `key(i)`; only those
 * are safe.
 */
function mapStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  };
}

/** A store that throws on every operation — a private window, or blocked site data. */
function hostileStorage(): Storage {
  const boom = () => {
    throw new DOMException('blocked');
  };
  return {
    get length(): number {
      throw new DOMException('blocked');
    },
    key: boom,
    getItem: boom,
    setItem: boom,
    removeItem: boom,
    clear: boom,
  };
}

describe('the placement-migration notice dismissal', () => {
  it('is not dismissed until it is', () => {
    const storage = mapStorage();

    expect(isDismissed(storage, 'user-1', 'plan-1')).toBe(false);
    dismiss(storage, 'user-1', 'plan-1');
    expect(isDismissed(storage, 'user-1', 'plan-1')).toBe(true);
  });

  /**
   * **Per plan**, because the notice reports what happened to *that* plan. Dismissing one says
   * nothing about another, and a planner who opens a second migrated programme has not yet been
   * told anything about it.
   */
  it('does not carry a dismissal across plans', () => {
    const storage = mapStorage();
    dismiss(storage, 'user-1', 'plan-1');

    expect(isDismissed(storage, 'user-1', 'plan-2')).toBe(false);
  });

  /**
   * **Per user**, because a shared machine must not carry one person's dismissals into the next
   * person's session — the defect `docs/TECH_DEBT.md` #171 records the active-org hint having.
   */
  it('does not carry a dismissal across accounts', () => {
    const storage = mapStorage();
    dismiss(storage, 'user-1', 'plan-1');

    expect(isDismissed(storage, 'user-2', 'plan-1')).toBe(false);
  });

  it('forgets every plan for one account at sign-out, and leaves the other account alone', () => {
    const storage = mapStorage();
    dismiss(storage, 'user-1', 'plan-1');
    dismiss(storage, 'user-1', 'plan-2');
    dismiss(storage, 'user-2', 'plan-1');

    forgetDismissalsForUser(storage, 'user-1');

    expect(isDismissed(storage, 'user-1', 'plan-1')).toBe(false);
    expect(isDismissed(storage, 'user-1', 'plan-2')).toBe(false);
    expect(isDismissed(storage, 'user-2', 'plan-1')).toBe(true);
  });

  /**
   * **Removing shifts every later index**, so the sweep must collect its keys before it deletes
   * any. Written with three dismissals precisely because two is the smallest number that hides the
   * bug: an index-shifting sweep over two keys deletes the first and skips the second, which looks
   * like a partial failure; over three it is unmistakable.
   */
  it('removes every key, not every other one', () => {
    const storage = mapStorage();
    for (const plan of ['a', 'b', 'c', 'd', 'e']) dismiss(storage, 'user-1', plan);

    forgetDismissalsForUser(storage, 'user-1');

    expect(storage.length).toBe(0);
  });

  /**
   * **A store that throws leaves the notice showing**, which is the right way round: a notice shown
   * twice is a nuisance, and one silently suppressed is the absence this milestone exists to
   * remove. None of the three may propagate — they sit on the path to the canvas.
   */
  it('degrades to "not dismissed" when the store throws, and never propagates', () => {
    const storage = hostileStorage();

    expect(isDismissed(storage, 'user-1', 'plan-1')).toBe(false);
    expect(() => dismiss(storage, 'user-1', 'plan-1')).not.toThrow();
    expect(() => forgetDismissalsForUser(storage, 'user-1')).not.toThrow();
  });
});
