import { DEPENDENCY_CONFLICT_MESSAGES } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { linkIllegalMessage, linkLegality, type LegalityEdge } from './link-legality';

const fs = (predecessorId: string, successorId: string): LegalityEdge => ({
  predecessorId,
  successorId,
  type: 'FS',
});

describe('linkLegality', () => {
  it('allows a fresh link between unrelated activities', () => {
    expect(linkLegality('a', 'b', 'FS', [])).toBeNull();
    expect(linkLegality('a', 'b', 'FS', [fs('c', 'd')])).toBeNull();
  });

  it('rejects a self-link', () => {
    expect(linkLegality('a', 'a', 'FS', [])).toBe('self');
  });

  it('rejects a duplicate of the same (predecessor, successor, type)', () => {
    expect(linkLegality('a', 'b', 'FS', [fs('a', 'b')])).toBe('duplicate');
  });

  it('allows a different type between the same pair (matches the server unique key)', () => {
    expect(linkLegality('a', 'b', 'SS', [fs('a', 'b')])).toBeNull();
  });

  it('rejects a direct back-edge that would form a 2-cycle', () => {
    // a→b exists; drawing b→a closes a cycle.
    expect(linkLegality('b', 'a', 'FS', [fs('a', 'b')])).toBe('cycle');
  });

  it('rejects a transitive back-edge (multi-hop cycle)', () => {
    // a→b→c exists; drawing c→a closes a 3-cycle.
    const edges = [fs('a', 'b'), fs('b', 'c')];
    expect(linkLegality('c', 'a', 'FS', edges)).toBe('cycle');
    // A forward link to a brand-new node stays legal (no path back to the predecessor).
    expect(linkLegality('a', 'd', 'FS', edges)).toBeNull();
  });

  it('allows a forward link that does not close a cycle in a diamond', () => {
    // a→b, a→c, b→d, c→d. Adding b→c is legal (c does not reach b).
    const edges = [fs('a', 'b'), fs('a', 'c'), fs('b', 'd'), fs('c', 'd')];
    expect(linkLegality('b', 'c', 'FS', edges)).toBeNull();
    // Adding d→a would cycle (a reaches d through either branch).
    expect(linkLegality('d', 'a', 'FS', edges)).toBe('cycle');
  });
});

describe('linkIllegalMessage', () => {
  it('returns the shared server strings verbatim (one voice)', () => {
    expect(linkIllegalMessage('self')).toBe(DEPENDENCY_CONFLICT_MESSAGES.SELF);
    expect(linkIllegalMessage('duplicate')).toBe(DEPENDENCY_CONFLICT_MESSAGES.DUPLICATE);
    expect(linkIllegalMessage('cycle')).toBe(DEPENDENCY_CONFLICT_MESSAGES.CYCLE);
  });
});
