import { describe, expect, it } from 'vitest';

import { freshnessOf, type ReadFacts } from './freshness';

const read = (over: Partial<ReadFacts>): ReadFacts => ({
  dataUpdatedAt: 1_000,
  isError: false,
  isPending: false,
  ...over,
});

describe('freshnessOf', () => {
  it('reports the OLDEST read, so it never claims more freshness than the stalest box has', () => {
    const result = freshnessOf([read({ dataUpdatedAt: 5_000 }), read({ dataUpdatedAt: 2_000 })]);
    expect(result.readAt?.getTime()).toBe(2_000);
    expect(result.settled).toBe(true);
    expect(result.unreadable).toBe(0);
  });

  it('is not settled while any read is pending, and has no time yet', () => {
    const result = freshnessOf([
      read({ dataUpdatedAt: 0, isPending: true }),
      read({ dataUpdatedAt: 0, isPending: true }),
    ]);
    expect(result.settled).toBe(false);
    expect(result.readAt).toBeNull();
  });

  // A failed read's old data is not a reading of now: it is counted, and it does not set the time.
  it('counts a failed read and ignores its old time', () => {
    const result = freshnessOf([
      read({ dataUpdatedAt: 9_000 }),
      read({ dataUpdatedAt: 100, isError: true }),
    ]);
    expect(result.unreadable).toBe(1);
    expect(result.readAt?.getTime()).toBe(9_000);
  });

  it('has no time when every read failed', () => {
    const result = freshnessOf([read({ isError: true }), read({ isError: true })]);
    expect(result.readAt).toBeNull();
    expect(result.unreadable).toBe(2);
    expect(result.settled).toBe(true);
  });
});
