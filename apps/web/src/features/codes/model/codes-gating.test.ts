import { describe, expect, it } from 'vitest';

import { deriveCodesGate } from './codes-gating';

describe('deriveCodesGate', () => {
  it('passes the workspace’s gate through and lets a Planner restore', () => {
    expect(deriveCodesGate({ writable: true, reason: null, roleDenied: false })).toEqual({
      writable: true,
      reason: null,
      roleDenied: false,
      canRestore: true,
    });
  });

  it('keeps the restore lists for a Planner who lost the pen: shaded in place, not removed', () => {
    const gate = deriveCodesGate({
      writable: false,
      reason: 'Start editing to change codes.',
      roleDenied: false,
    });
    expect(gate.writable).toBe(false);
    expect(gate.canRestore).toBe(true);
  });

  it('gives a role that can never write no restore list at all', () => {
    const gate = deriveCodesGate({
      writable: false,
      reason: 'Your role cannot change codes.',
      roleDenied: true,
    });
    expect(gate.roleDenied).toBe(true);
    expect(gate.canRestore).toBe(false);
  });
});
