import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { acquirePlanWriteLocks } from './plan-advisory-lock';

/** Records the plan-id list each lock statement was handed, one entry per statement issued. */
function recorder() {
  const statements: string[][] = [];
  const db = {
    $executeRaw: vi.fn((_strings: TemplateStringsArray, _namespace: string, ids: string[]) => {
      statements.push(ids);
      return Promise.resolve(0);
    }),
  };
  return { db: db as unknown as Prisma.TransactionClient, statements };
}

describe('acquirePlanWriteLocks', () => {
  it('takes the locks in sorted order whatever order the plans arrive in (#492)', async () => {
    const { db, statements } = recorder();
    await acquirePlanWriteLocks(db, ['c', 'a', 'b']);
    expect(statements).toEqual([['a', 'b', 'c']]);
  });

  it('takes a plan once however many times it is named', async () => {
    const { db, statements } = recorder();
    await acquirePlanWriteLocks(db, ['b', 'a', 'b', 'a']);
    expect(statements).toEqual([['a', 'b']]);
  });

  it('issues one statement however many plans, and none for no plans', async () => {
    const many = recorder();
    await acquirePlanWriteLocks(many.db, ['c', 'a', 'b']);
    expect(many.statements).toHaveLength(1);
    const none = recorder();
    await acquirePlanWriteLocks(none.db, []);
    expect(none.statements).toEqual([]);
  });
});
