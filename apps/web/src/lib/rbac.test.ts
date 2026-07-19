import { describe, expect, it } from 'vitest';

import { canManageHierarchy, canWriteNotes } from './rbac';

describe('canManageHierarchy', () => {
  it('allows writers (Planner, Org Admin)', () => {
    expect(canManageHierarchy('PLANNER')).toBe(true);
    expect(canManageHierarchy('ORG_ADMIN')).toBe(true);
  });

  it('denies readers and the absent role', () => {
    expect(canManageHierarchy('VIEWER')).toBe(false);
    expect(canManageHierarchy('CONTRIBUTOR')).toBe(false);
    expect(canManageHierarchy(undefined)).toBe(false);
  });
});

describe('canWriteNotes', () => {
  it('allows Contributor upward (notes are collaborative — the lowest write role can annotate)', () => {
    expect(canWriteNotes('CONTRIBUTOR')).toBe(true);
    expect(canWriteNotes('PLANNER')).toBe(true);
    expect(canWriteNotes('ORG_ADMIN')).toBe(true);
  });

  it('denies the Viewer (read-only) and the absent role', () => {
    expect(canWriteNotes('VIEWER')).toBe(false);
    expect(canWriteNotes(undefined)).toBe(false);
  });
});
