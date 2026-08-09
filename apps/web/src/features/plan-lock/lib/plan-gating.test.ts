import { describe, expect, it } from 'vitest';

import { derivePlanGating, scheduleRefusal } from './plan-gating';

describe('derivePlanGating', () => {
  describe('pen layer OFF — role-only, today’s behaviour', () => {
    it('lets a writer edit the schedule and recalc regardless of the pen', () => {
      const g = derivePlanGating({
        penManaged: false,
        holdsPen: false,
        canWrite: true,
        canProgress: false,
        canCalculate: true,
      });
      expect(g).toEqual({
        canEditSchedule: true,
        canRecalc: true,
        canProgress: false,
        penReadOnly: false,
      });
    });

    it('never shows the read-only hint when the pen layer is off', () => {
      const g = derivePlanGating({
        penManaged: false,
        holdsPen: false,
        canWrite: true,
        canProgress: true,
        canCalculate: true,
      });
      expect(g.penReadOnly).toBe(false);
    });
  });

  describe('pen layer ON', () => {
    it('a writer WITHOUT the pen cannot edit/recalc and sees the read-only hint', () => {
      const g = derivePlanGating({
        penManaged: true,
        holdsPen: false,
        canWrite: true,
        canProgress: true,
        canCalculate: true,
      });
      expect(g).toEqual({
        canEditSchedule: false,
        canRecalc: false,
        canProgress: true, // progress is never pen-gated (Q-C)
        penReadOnly: true,
      });
    });

    it('a writer WITH the pen can edit + recalc, no read-only hint', () => {
      const g = derivePlanGating({
        penManaged: true,
        holdsPen: true,
        canWrite: true,
        canProgress: true,
        canCalculate: true,
      });
      expect(g).toEqual({
        canEditSchedule: true,
        canRecalc: true,
        canProgress: true,
        penReadOnly: false,
      });
    });

    it('a non-writer never edits and never sees the read-only hint even without the pen', () => {
      const g = derivePlanGating({
        penManaged: true,
        holdsPen: false,
        canWrite: false,
        canProgress: true,
        canCalculate: false,
      });
      expect(g.canEditSchedule).toBe(false);
      expect(g.canRecalc).toBe(false);
      expect(g.penReadOnly).toBe(false); // the hint is only for would-be editors
      expect(g.canProgress).toBe(true);
    });

    it('holding the pen does not grant a capability the role lacks', () => {
      const g = derivePlanGating({
        penManaged: true,
        holdsPen: true,
        canWrite: false,
        canProgress: false,
        canCalculate: false,
      });
      expect(g.canEditSchedule).toBe(false);
      expect(g.canRecalc).toBe(false);
    });

    it('gates canEditSchedule and canRecalc by their OWN role capability, independently', () => {
      // A (hypothetical) role that may write but not calculate, holding the pen.
      const writeNoCalc = derivePlanGating({
        penManaged: true,
        holdsPen: true,
        canWrite: true,
        canProgress: false,
        canCalculate: false,
      });
      expect(writeNoCalc.canEditSchedule).toBe(true);
      expect(writeNoCalc.canRecalc).toBe(false);

      // …and the reverse: calculate but not write — the two are not coupled.
      const calcNoWrite = derivePlanGating({
        penManaged: true,
        holdsPen: true,
        canWrite: false,
        canProgress: false,
        canCalculate: true,
      });
      expect(calcNoWrite.canEditSchedule).toBe(false);
      expect(calcNoWrite.canRecalc).toBe(true);
    });
  });

  it('pen off + no role capability → everything false (plain passthrough)', () => {
    const g = derivePlanGating({
      penManaged: false,
      holdsPen: false,
      canWrite: false,
      canProgress: false,
      canCalculate: false,
    });
    expect(g).toEqual({
      canEditSchedule: false,
      canRecalc: false,
      canProgress: false,
      penReadOnly: false,
    });
  });
});

describe('scheduleRefusal — the two refusals are never conflated', () => {
  const holder = { id: 'u2', name: 'Dana Okafor', email: 'dana@example.com' };

  it('says nothing at all when the action is open', () => {
    expect(
      scheduleRefusal({ canEditSchedule: true, penReadOnly: false }, null, 'recalculate'),
    ).toBeNull();
  });

  it('names Start editing when the role allows it and the pen is free', () => {
    expect(
      scheduleRefusal({ canEditSchedule: false, penReadOnly: true }, null, 'add activities'),
    ).toBe('Start editing to add activities.');
  });

  it('names the holder and Request control when a peer has the pen', () => {
    // The whole of TECH_DEBT #115: this reader's screen shows **Request control** and no Start
    // editing button, so the old shared sentence named a control they do not have.
    const message = scheduleRefusal(
      { canEditSchedule: false, penReadOnly: true },
      holder,
      'add activities',
    );
    expect(message).toContain('Request control to add activities.');
    expect(message).not.toContain('Start editing');
  });

  it('names the ROLE when the role is what is missing, and never offers the pen', () => {
    // A Viewer told to "start editing" is being pointed at a button their role will never produce.
    // `penReadOnly` is false for them precisely because `canWrite` is false — which is why this
    // branch is reachable at all, and why a caller holding only `canEditSchedule` could not find it.
    expect(
      scheduleRefusal({ canEditSchedule: false, penReadOnly: false }, null, 'recalculate'),
    ).toBe('Your role cannot recalculate.');
  });
});
