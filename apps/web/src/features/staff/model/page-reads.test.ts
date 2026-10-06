import { describe, expect, it } from 'vitest';

import { STAFF_PAGE_READS } from './page-reads';

describe('STAFF_PAGE_READS', () => {
  // The audit cost of a Refresh is this list's length, so it is pinned (SC-5): the day it is six
  // and a seventh read is added, this fails and somebody states the new cost.
  it('is the six reads a page load makes, each once', () => {
    expect(STAFF_PAGE_READS).toHaveLength(6);
    expect(new Set(STAFF_PAGE_READS.map((key) => key.join('/'))).size).toBe(6);
  });

  // Diagnostics is press-only by ADR-0140: it reads customer tables, so a refresh must not run it.
  it('excludes diagnostics', () => {
    for (const key of STAFF_PAGE_READS) {
      expect(key.join('/')).not.toContain('diagnostics');
    }
  });

  it('lists every read by its full key, never by the shared prefix', () => {
    for (const key of STAFF_PAGE_READS) expect(key.length).toBeGreaterThan(1);
  });
});
