import { describe, expect, it } from 'vitest';

import { resolveDockStrip, type DockStripInput } from './dock-strip';

/**
 * The canvas dock's precedence, asserted as a value.
 *
 * Before this, the rule was three guards in `TsldPanel` and the only thing pinning it was DOM
 * absence — which cannot tell "a conflict outranked the notice" from "the notice is broken"
 * (ADR-0093). Each case below therefore says what it expects AND what it expects to have beaten.
 */
function input(overrides: Partial<DockStripInput> = {}): DockStripInput {
  return {
    hasConflict: false,
    modeStatement: null,
    showDiagram: true,
    activityCount: 3,
    mode: 'select',
    authoringFlowEnabled: true,
    ...overrides,
  };
}

const ARMED = { kind: 'marquee' } as const;

describe('resolveDockStrip', () => {
  it('shows nothing on a settled canvas', () => {
    expect(resolveDockStrip(input())).toBeNull();
  });

  it('shows each strip when it is the only claimant', () => {
    expect(resolveDockStrip(input({ hasConflict: true }))).toBe('conflict');
    expect(resolveDockStrip(input({ modeStatement: ARMED }))).toBe('mode');
    expect(resolveDockStrip(input({ activityCount: 0 }))).toBe('empty');
  });

  /**
   * The precedence proper. Each of these has TWO claimants, so a rule that simply answered
   * "whichever is true" would pass the block above and fail here.
   */
  it('lets a conflict outrank an armed tool and an empty plan', () => {
    expect(resolveDockStrip(input({ hasConflict: true, modeStatement: ARMED }))).toBe('conflict');
    expect(resolveDockStrip(input({ hasConflict: true, activityCount: 0 }))).toBe('conflict');
    expect(
      resolveDockStrip(input({ hasConflict: true, modeStatement: ARMED, activityCount: 0 })),
      'all three at once',
    ).toBe('conflict');
  });

  it('lets an armed tool outrank the empty-plan notice', () => {
    expect(resolveDockStrip(input({ modeStatement: ARMED, activityCount: 0 }))).toBe('mode');
  });

  /**
   * The empty notice's three remaining conditions, each withdrawn on its own. Without these the
   * function could return `'empty'` unconditionally and every case above would still pass.
   */
  it('withholds the empty notice unless the canvas is drawing, idle and authoring-enabled', () => {
    expect(
      resolveDockStrip(input({ activityCount: 0, showDiagram: false })),
      'no diagram',
    ).toBeNull();
    expect(
      resolveDockStrip(input({ activityCount: 0, mode: 'adding' })),
      'a tool armed',
    ).toBeNull();
    expect(
      resolveDockStrip(input({ activityCount: 0, authoringFlowEnabled: false })),
      'flag off',
    ).toBeNull();
  });

  /**
   * `mode` is gated on the STATEMENT, never on the mode string — that is the whole reason
   * `CanvasModeBand`'s "nothing armed renders nothing" contract can live in one place. A rule
   * keyed on `mode !== 'select'` would light the band for a mode with nothing to say.
   */
  it('does not show the band for a mode that has no statement', () => {
    expect(resolveDockStrip(input({ mode: 'linking', modeStatement: null }))).toBeNull();
  });
});
