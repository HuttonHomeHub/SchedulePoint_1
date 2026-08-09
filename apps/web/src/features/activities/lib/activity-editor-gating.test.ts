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

describe('deriveActivityEditorGating — the converged collections', () => {
  /**
   * The convergence epic's whole "no permission change" claim, as an identity assertion.
   *
   * Not `toEqual` — **the same object**. A second expression of the same rule is how two gates
   * that must agree start disagreeing: someone tightens one and the other keeps yesterday's
   * answer, and nothing fails until a user is refused something they can do from the dialog.
   */
  it.each(['logic', 'resources', 'members'] as const)(
    'reuses the definition gate object for %s',
    (path) => {
      for (const role of ['viewer', 'contributor', 'planner'] as const) {
        for (const pen of ['held', 'notHeld', 'layerOff'] as const) {
          const gates = gate(role, pen);
          expect(gates[path]).toBe(gates.general);
        }
      }
    },
  );
});

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
    'blocks %s on every definition scope without the pen, telling them to start editing',
    (role) => {
      const g = gate(role, 'notHeld');
      for (const path of DEFINITION_PATHS) {
        expect(g[path].writable).toBe(false);
        // The app's existing sentence for this state, not a fourth variant of it. An earlier draft
        // said "Someone else is editing this plan. Take over the edit lock" — which is false
        // whenever nobody holds the pen, i.e. most of the time.
        expect(g[path].reason).toMatch(/^Start editing to/);
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

  /**
   * Notes are the third rule, not a fourth: annotating a plan is not editing its schedule
   * (ADR-0046), so the tab must stay open to a Contributor while a Planner holds the pen — the same
   * capability a merged Save would have destroyed for progress.
   */
  it('never pen-gates notes', () => {
    for (const pen of ['held', 'notHeld', 'layerOff'] as const) {
      expect(gate('contributor', pen).notes.writable).toBe(true);
      expect(gate('planner', pen).notes.writable).toBe(true);
    }
    expect(gate('viewer', 'held').notes).toEqual({
      writable: false,
      reason: 'Your role cannot add notes.',
      readable: true,
    });
  });
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

describe('the pen refusal names a control the reader actually has (#115)', () => {
  /**
   * The defect this closes was found by the ADR-0082 journey step, which asserts — within a few
   * lines of each other, on one page — that a peer-locked reader sees a **Request control** button
   * and that the row menu explains the refusal with "Start editing to change this activity."
   * There is no Start-editing button on that screen. The app named a control they do not have and
   * stayed silent about the one that would help.
   *
   * Both branches are asserted, because the previous sentence was not wrong — it was wrong *in one
   * state*, and a fix that only checked the peer case could regress the common one. ADR-0060
   * records an earlier draft that did exactly that in reverse: it invented "Someone else is editing
   * this plan…", which was false whenever nobody held the pen.
   */
  const base = {
    penManaged: true,
    holdsPen: false,
    canWrite: true,
    canProgress: true,
    canReadCost: true,
  };

  it('says "Start editing" when the pen is free', () => {
    const gating = deriveActivityEditorGating({ ...base, holder: null });
    expect(gating.general.reason).toBe('Start editing to change this activity.');
  });

  it('names the holder and Request control when a peer holds the pen', () => {
    const gating = deriveActivityEditorGating({
      ...base,
      holder: { id: 'u2', name: 'Dana Okafor', email: 'dana@example.com' },
    });
    // **First name only** — `lockCopy.heldByOther` renders `firstName(holder)`, and reusing that
    // helper rather than formatting a name here is the point: the pen banner and this refusal are
    // describing one state, so they must not address the same person two ways. My first assertion
    // expected the full name; the code was right and the test was wrong.
    expect(gating.general.reason).toBe(
      'Dana is editing this plan. Request control to change this activity.',
    );
    // It must NOT tell a peer-locked reader to press a button their screen does not show.
    expect(gating.general.reason).not.toMatch(/Start editing/);
  });

  it('leaves the role refusal alone — it is not about the pen', () => {
    const gating = deriveActivityEditorGating({
      ...base,
      canWrite: false,
      holder: { id: 'u2', name: 'Dana Okafor', email: 'dana@example.com' },
    });
    expect(gating.general.reason).toBe('Your role cannot edit activity details.');
  });
});
