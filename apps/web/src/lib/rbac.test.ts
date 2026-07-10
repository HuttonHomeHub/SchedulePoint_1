import { describe, expect, it } from 'vitest';

import { canManageHierarchy } from './rbac';

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
