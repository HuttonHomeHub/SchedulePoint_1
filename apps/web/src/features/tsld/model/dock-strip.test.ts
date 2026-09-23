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
    hasPlacementMigrationNotice: false,
    hasArrangeOffer: false,
    hasLayoutResolvedNotice: false,
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

  /**
   * The migration notice is the lowest rung, and each case below names what it expects to have
   * LOST to — asserting "the notice is absent" on its own cannot tell "something outranked it"
   * from "it is broken", which is the whole reason this function is a value rather than a guard.
   */
  describe('the placement-migration notice', () => {
    it('shows on an otherwise settled canvas', () => {
      expect(resolveDockStrip(input({ hasPlacementMigrationNotice: true }))).toBe(
        'placement-migration',
      );
    });

    it('loses to a conflict — a failed write outranks a historical fact', () => {
      expect(
        resolveDockStrip(input({ hasPlacementMigrationNotice: true, hasConflict: true })),
      ).toBe('conflict');
    });

    it('loses to an armed tool — what the next click does outranks what a deploy did', () => {
      expect(
        resolveDockStrip(input({ hasPlacementMigrationNotice: true, modeStatement: ARMED })),
      ).toBe('mode');
    });

    it('loses to the empty-plan notice, which is the more useful sentence for that reader', () => {
      expect(resolveDockStrip(input({ hasPlacementMigrationNotice: true, activityCount: 0 }))).toBe(
        'empty',
      );
    });

    it('is absent when the migration changed nothing here', () => {
      expect(resolveDockStrip(input({ hasPlacementMigrationNotice: false }))).toBeNull();
    });
  });

  /**
   * The `Arrange` offer, asserted the same way as its neighbour: every case says what it BEAT or
   * LOST to, so a green run can never mean "the strip is broken".
   */
  describe('the Arrange offer', () => {
    it('shows on an otherwise settled canvas', () => {
      expect(resolveDockStrip(input({ hasArrangeOffer: true }))).toBe('arrange-offer');
    });

    it('beats the migration notice — a live fact outranks what a deploy did', () => {
      expect(
        resolveDockStrip(input({ hasArrangeOffer: true, hasPlacementMigrationNotice: true })),
      ).toBe('arrange-offer');
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

    it('beats the Arrange offer and the migration notice — both are standing facts that wait', () => {
      expect(
        resolveDockStrip(
          input({ ...resolved, hasArrangeOffer: true, hasPlacementMigrationNotice: true }),
        ),
      ).toBe('layout-resolved');
    });

    it('loses to a conflict and to an armed tool', () => {
      expect(resolveDockStrip(input({ ...resolved, hasConflict: true }))).toBe('conflict');
      expect(resolveDockStrip(input({ ...resolved, modeStatement: ARMED }))).toBe('mode');
    });
  });
});
