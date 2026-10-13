import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { acquirePlanWriteLocks } from './plan-advisory-lock';

/** Records the plan id each `pg_advisory_xact_lock` template was called with, in call order. */
function recorder() {
  const taken: string[] = [];
  const db = {
    $executeRaw: vi.fn((_strings: TemplateStringsArray, _namespace: string, planId: string) => {
      taken.push(planId);
      return Promise.resolve(0);
    }),
  };
  return { db: db as unknown as Prisma.TransactionClient, taken };
}

describe('acquirePlanWriteLocks', () => {
  it('takes the locks in sorted order whatever order the plans arrive in (#492)', async () => {
    const { db, taken } = recorder();
    await acquirePlanWriteLocks(db, ['c', 'a', 'b']);
    expect(taken).toEqual(['a', 'b', 'c']);
  });

  it('takes a plan once however many times it is named', async () => {
    const { db, taken } = recorder();
    await acquirePlanWriteLocks(db, ['b', 'a', 'b', 'a']);
    expect(taken).toEqual(['a', 'b']);
  });

  it('takes nothing for no plans', async () => {
    const { db, taken } = recorder();
    await acquirePlanWriteLocks(db, []);
    expect(taken).toEqual([]);
  });
});
