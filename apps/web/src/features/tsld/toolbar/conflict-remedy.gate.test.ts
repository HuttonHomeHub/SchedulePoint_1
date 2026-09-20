import { describe, expect, it } from 'vitest';

import { clearVisualPlacementGate, type ClearVisualPlacementInput } from './conflict-remedy';

/**
 * **The four-condition gate on clearing a hand-placed `visualStart`, and the order between them.**
 *
 * These cases lived in `tsld-toolbar-quick-wins.test.tsx` as six rendered toolbar assertions until
 * ADR-0094 M4-T1 moved the item to the selection bar. They are unit cases now because the gate is
 * now a pure function with **two** call sites, and that is the whole reason it was extracted: two
 * independent copies of a four-condition ladder is exactly how the conflict COUNT and the conflict
 * FILTER came to disagree about the word "conflict", which is the defect this epic opened on.
 *
 * **The precedence is the part the old suite could not state.** It had one case per condition, in
 * the order somebody happened to write them, so nothing pinned that the PERMANENT gates come before
 * the transient one. That ordering is a real decision — a Viewer with nothing selected is told they
 * cannot edit, rather than being told to select something first and then meeting a second refusal —
 * and it is asserted here directly rather than implied.
 */
const open: ClearVisualPlacementInput = {
  canEditSchedule: true,
  lateOverlayActive: false,
  hasSelection: true,
  scheduleRefusal: (action) => `Start editing to ${action}.`,
};

describe('clearVisualPlacementGate', () => {
  it('is open with the pen, no overlay and a selection', () => {
    expect(clearVisualPlacementGate(open)).toEqual({ enabled: true, reason: null });
  });

  /**
   * **The mode rung is DELETED** (M-F-T6). It refused with "Only available in Visual mode", and
   * before that ADR-0115 had made the action **omitted** outside Visual mode rather than shaded —
   * ADR-0082's discriminator, since an Early plan had no hand-placed start to refuse clearing.
   *
   * Every plan can hold a placement now, so the action applies always and the ladder is three rungs
   * rather than four. The precedence case below loses its permanent rung with it, which is why the
   * "leads with the PERMANENT refusal" assertion is rewritten rather than dropped: what it pinned
   * is that the ladder is ordered at all, and that survives.
   */

  it('refuses without the pen, through the host-supplied refusal (never a sentence of its own)', () => {
    // `canEditSchedule` has already fused role and pen, so a sentence built here would be false for
    // one of the two readers it addresses (`docs/TECH_DEBT.md` #114.1/#115). The host owns the copy.
    expect(clearVisualPlacementGate({ ...open, canEditSchedule: false })).toEqual({
      enabled: false,
      reason: 'Start editing to clear the placement.',
    });
  });

  it('refuses under the Late-start overlay with its own reason (A1)', () => {
    // The overlay is read-only while `canEditSchedule` stays true, so the reason cannot come from
    // the pen branch — it has to be its own rung or the refusal is silent.
    expect(clearVisualPlacementGate({ ...open, lateOverlayActive: true })).toEqual({
      enabled: false,
      reason: 'Turn off the Late-start overlay to clear the placement',
    });
  });

  it('refuses with nothing selected (U3 — a deleted row resolves to no selection)', () => {
    expect(clearVisualPlacementGate({ ...open, hasSelection: false })).toEqual({
      enabled: false,
      reason: 'Select an activity first',
    });
  });

  it('leads with the standing refusal when several apply', () => {
    // A Viewer with nothing selected. Both conditions fail and the PEN is the one that gets said,
    // because it is true until they act on it, where "select an activity" would be answered and
    // then refused again. Nothing pinned the ordering before this suite — the old one tested one
    // condition at a time, in whatever order somebody wrote them.
    expect(
      clearVisualPlacementGate({ ...open, canEditSchedule: false, hasSelection: false }).reason,
    ).toBe('Start editing to clear the placement.');

    // And the overlay outranks the selection for the same reason: it is a state of the view rather
    // than of this moment. This pair was the mode-vs-pen assertion before M-F-T6 removed the rung
    // above them both; the property it pinned — that the ladder is ordered — is what is kept.
    expect(
      clearVisualPlacementGate({ ...open, lateOverlayActive: true, hasSelection: false }).reason,
    ).toBe('Turn off the Late-start overlay to clear the placement');
  });
});
