import { describe, expect, it } from 'vitest';

import {
  canExportOrganization,
  canExportSchedule,
  canManageHierarchy,
  canWriteNotes,
} from './rbac';

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

describe('canExportSchedule', () => {
  it('allows any defined member role (export is a read-egress every member holds)', () => {
    expect(canExportSchedule('VIEWER')).toBe(true);
  });

  it('denies the absent (signed-out / unknown) role', () => {
    expect(canExportSchedule(undefined)).toBe(false);
  });
});

describe('canExportOrganization', () => {
  it('allows the Org Admin only (the export carries cost and every member’s email)', () => {
    expect(canExportOrganization('ORG_ADMIN')).toBe(true);
    for (const role of ['PLANNER', 'CONTRIBUTOR', 'VIEWER'] as const) {
      expect(canExportOrganization(role)).toBe(false);
    }
  });

  it('denies the absent role, so a still-loading role never shows the link', () => {
    expect(canExportOrganization(undefined)).toBe(false);
  });
});
