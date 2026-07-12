import { describe, expect, it } from 'vitest';

import { derivePlanGating } from './plan-gating';

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
  });
});
