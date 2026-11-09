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
    hasTouchGestureHint: false,
    hasArrangeOffer: false,
    hasLayoutResolvedNotice: false,
    historyResult: null,
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
   * The empty notice's remaining conditions, each withdrawn on its own. Without these the
   * function could return `'empty'` unconditionally and every case above would still pass.
   */
  it('withholds the empty notice unless the canvas is drawing and idle', () => {
    expect(
      resolveDockStrip(input({ activityCount: 0, showDiagram: false })),
      'no diagram',
    ).toBeNull();
    expect(
      resolveDockStrip(input({ activityCount: 0, mode: 'adding' })),
      'a tool armed',
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

  /**
   * The `Arrange` offer, asserted so that every case says what it BEAT or
   * LOST to: a green run can never mean "the strip is broken".
   */
  describe('the Arrange offer', () => {
    it('shows on an otherwise settled canvas', () => {
      expect(resolveDockStrip(input({ hasArrangeOffer: true }))).toBe('arrange-offer');
    });

    it('loses to a conflict, to an armed tool, and to the empty-plan notice', () => {
      expect(resolveDockStrip(input({ hasArrangeOffer: true, hasConflict: true }))).toBe(
        'conflict',
      );
      expect(resolveDockStrip(input({ hasArrangeOffer: true, modeStatement: ARMED }))).toBe('mode');
      expect(resolveDockStrip(input({ hasArrangeOffer: true, activityCount: 0 }))).toBe('empty');
    });

    it('is absent when there is nothing to move, or the reader cannot take it', () => {
      // One boolean carries both — see the field's docblock for why the pen is a precondition here
      // rather than a shading, which is the opposite of how every command on this surface is gated.
      expect(resolveDockStrip(input({ hasArrangeOffer: false }))).toBeNull();
    });
  });

  /** The overlap-resolved notice (NetPoint-layout M3): below the planner's live act, above standing facts. */
  describe('the layout-resolved notice', () => {
    const resolved = { hasLayoutResolvedNotice: true };

    it('shows on an otherwise settled canvas', () => {
      expect(resolveDockStrip(input(resolved))).toBe('layout-resolved');
    });

    it('beats the Arrange offer — a standing fact that waits', () => {
      expect(resolveDockStrip(input({ ...resolved, hasArrangeOffer: true }))).toBe(
        'layout-resolved',
      );
    });

    it('loses to a conflict and to an armed tool', () => {
      expect(resolveDockStrip(input({ ...resolved, hasConflict: true }))).toBe('conflict');
      expect(resolveDockStrip(input({ ...resolved, modeStatement: ARMED }))).toBe('mode');
    });
  });

  /** The undo/redo result (undo-redo M1): a failure ranks with `conflict`, a success just below `mode`. */
  describe('the history result', () => {
    it('shows on an otherwise settled canvas, for either outcome', () => {
      expect(resolveDockStrip(input({ historyResult: 'success' }))).toBe('history');
      expect(resolveDockStrip(input({ historyResult: 'failure' }))).toBe('history');
    });

    it('a failure beats an armed tool, but loses to a conflict', () => {
      expect(resolveDockStrip(input({ historyResult: 'failure', modeStatement: ARMED }))).toBe(
        'history',
      );
      expect(resolveDockStrip(input({ historyResult: 'failure', hasConflict: true }))).toBe(
        'conflict',
      );
    });

    it('a success yields to an armed tool and to a conflict', () => {
      expect(resolveDockStrip(input({ historyResult: 'success', modeStatement: ARMED }))).toBe(
        'mode',
      );
      expect(resolveDockStrip(input({ historyResult: 'success', hasConflict: true }))).toBe(
        'conflict',
      );
    });

    it('a success replaces the layout-resolved notice and every standing strip', () => {
      expect(
        resolveDockStrip(
          input({
            historyResult: 'success',
            hasLayoutResolvedNotice: true,
            hasArrangeOffer: true,
          }),
        ),
      ).toBe('history');
      expect(resolveDockStrip(input({ historyResult: 'success', activityCount: 0 }))).toBe(
        'history',
      );
    });
  });

  /**
   * The touch tip is the lowest rung of all, so every case names what it LOST to or BEAT, and the
   * pairwise table walks every other claimant rather than a hand-picked few.
   */
  describe('the touch-gesture tip', () => {
    it('shows alone on an otherwise settled canvas', () => {
      expect(resolveDockStrip(input({ hasTouchGestureHint: true }))).toBe('touch-hint');
    });

    const others: [string, Partial<DockStripInput>, string][] = [
      ['a conflict', { hasConflict: true }, 'conflict'],
      ['an armed tool', { modeStatement: ARMED }, 'mode'],
      ['an undo success', { historyResult: 'success' }, 'history'],
      ['an undo failure', { historyResult: 'failure' }, 'history'],
      ['a layout-resolved notice', { hasLayoutResolvedNotice: true }, 'layout-resolved'],
      ['the empty-plan notice', { activityCount: 0 }, 'empty'],
      ['the Arrange offer', { hasArrangeOffer: true }, 'arrange-offer'],
    ];
    it.each(others)('loses to %s', (_name, overrides, expected) => {
      expect(resolveDockStrip(input({ hasTouchGestureHint: true, ...overrides }))).toBe(expected);
    });

    it('is absent when no finger has pressed the workspace', () => {
      expect(resolveDockStrip(input({ hasTouchGestureHint: false }))).toBeNull();
    });
  });
});
