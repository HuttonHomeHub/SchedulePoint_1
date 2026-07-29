import { describe, expect, it } from 'vitest';

import {
  deriveActivityEditorGating,
  type ActivityEditorGatingInput,
  type ActivityWritePath,
} from './activity-editor-gating';

/**
 * The full gating matrix (ADR-0060 §6). Written as a table because the interesting property is not
 * any single cell — it is that the three write paths stay *different*: definition scopes need the
 * pen, progress never does, and steps joined the pen side in M0. A regression that fused them
 * would pass a spot-check of one scope and fail here.
 */

/** Role capability sets, named as the roles that produce them. */
const ROLES = {
  viewer: { canWrite: false, canProgress: false, canReadCost: false },
  contributor: { canWrite: false, canProgress: true, canReadCost: false },
  planner: { canWrite: true, canProgress: true, canReadCost: true },
  orgAdmin: { canWrite: true, canProgress: true, canReadCost: true },
} as const;

const PEN = {
  held: { penManaged: true, holdsPen: true },
  notHeld: { penManaged: true, holdsPen: false },
  layerOff: { penManaged: false, holdsPen: false },
} as const;

function gate(
  role: keyof typeof ROLES,
  pen: keyof typeof PEN,
): ReturnType<typeof deriveActivityEditorGating> {
  const input: ActivityEditorGatingInput = { ...ROLES[role], ...PEN[pen] };
  return deriveActivityEditorGating(input);
}

const DEFINITION_PATHS: ActivityWritePath[] = ['general', 'scheduling', 'measure', 'cost'];

describe('deriveActivityEditorGating — definition scopes', () => {
  it.each(['planner', 'orgAdmin'] as const)(
    'lets %s write every definition scope while holding the pen',
    (role) => {
      const g = gate(role, 'held');
      for (const path of DEFINITION_PATHS) {
        expect(g[path].writable).toBe(true);
        expect(g[path].reason).toBeNull();
      }
    },
  );

  it.each(['planner', 'orgAdmin'] as const)(
    'blocks %s on every definition scope without the pen, with the take-over sentence',
    (role) => {
      const g = gate(role, 'notHeld');
      for (const path of DEFINITION_PATHS) {
        expect(g[path].writable).toBe(false);
        expect(g[path].reason).toMatch(/edit lock/i);
      }
    },
  );

  it('falls back to role alone when the pen layer is off (byte-for-byte today’s behaviour)', () => {
    const g = gate('planner', 'layerOff');
    for (const path of DEFINITION_PATHS) expect(g[path].writable).toBe(true);
  });

  it.each(['viewer', 'contributor'] as const)(
    'blocks %s on definition scopes for role, whatever the pen says',
    (role) => {
      for (const pen of ['held', 'notHeld', 'layerOff'] as const) {
        const g = gate(role, pen);
        expect(g.general.writable).toBe(false);
        expect(g.general.reason).toMatch(/role/i);
      }
    },
  );
});

describe('deriveActivityEditorGating — progress is never pen-gated', () => {
  it('lets a Contributor report progress while someone else holds the pen', () => {
    const g = gate('contributor', 'notHeld');
    expect(g.progress.writable).toBe(true);
    expect(g.progress.reason).toBeNull();
    // …while every definition scope beside it stays closed. This contrast is the reason the
    // Progress tab carries more than one Save.
    expect(g.general.writable).toBe(false);
    expect(g.measure.writable).toBe(false);
  });

  it.each(['held', 'notHeld', 'layerOff'] as const)(
    'keeps progress writable for a Planner with pen state %s',
    (pen) => {
      expect(gate('planner', pen).progress.writable).toBe(true);
    },
  );

  it('blocks a Viewer from progress, for role', () => {
    const g = gate('viewer', 'held');
    expect(g.progress.writable).toBe(false);
    expect(g.progress.reason).toMatch(/role/i);
  });
});

describe('deriveActivityEditorGating — steps follow the pen (ADR-0060 §5)', () => {
  it('needs the pen, unlike progress beside it', () => {
    const g = gate('planner', 'notHeld');
    expect(g.steps.writable).toBe(false);
    expect(g.progress.writable).toBe(true);
  });

  it('opens with the pen held', () => {
    expect(gate('planner', 'held').steps.writable).toBe(true);
  });

  it('blocks a Contributor for role — steps are activity data, not progress', () => {
    const g = gate('contributor', 'held');
    expect(g.steps.writable).toBe(false);
    expect(g.steps.reason).toMatch(/role/i);
  });
});

describe('deriveActivityEditorGating — cost readability', () => {
  it('hides Cost from a role that cannot read it, rather than shading an empty tab', () => {
    const g = gate('contributor', 'held');
    expect(g.cost.readable).toBe(false);
    expect(g.cost.writable).toBe(false);
    // No sentence: there is nothing to explain, because the tab is not shown at all.
    expect(g.cost.reason).toBeNull();
  });

  it('shows Cost to a Planner', () => {
    expect(gate('planner', 'held').cost.readable).toBe(true);
  });
});

describe('deriveActivityEditorGating — every blocked path explains itself', () => {
  it('never returns writable:false with no reason on a readable path', () => {
    for (const role of Object.keys(ROLES) as (keyof typeof ROLES)[]) {
      for (const pen of Object.keys(PEN) as (keyof typeof PEN)[]) {
        const g = gate(role, pen);
        for (const [path, cell] of Object.entries(g)) {
          if (!cell.writable && cell.readable) {
            expect(cell.reason, `${role}/${pen}/${path} is blocked with no reason`).not.toBeNull();
          }
        }
      }
    }
  });
});
