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
  schedulingMode: 'VISUAL',
  canEditSchedule: true,
  lateOverlayActive: false,
  hasSelection: true,
  scheduleRefusal: (action) => `Start editing to ${action}.`,
};

describe('clearVisualPlacementGate', () => {
  it('is open in Visual mode with the pen, no overlay and a selection', () => {
    expect(clearVisualPlacementGate(open)).toEqual({ enabled: true, reason: null });
  });

  it('refuses outside Visual mode, naming the mode (U1)', () => {
    expect(clearVisualPlacementGate({ ...open, schedulingMode: 'EARLY' })).toEqual({
      enabled: false,
      reason: 'Only available in Visual mode',
    });
  });

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

  it('leads with the PERMANENT refusal when several apply', () => {
    // A Viewer, in Early mode, with nothing selected. Three conditions fail; the mode is the one
    // that gets said, because it is the one that is true of the whole plan rather than of this
    // moment. Nothing pinned this before — the old suite tested one condition at a time.
    expect(
      clearVisualPlacementGate({
        ...open,
        schedulingMode: 'EARLY',
        canEditSchedule: false,
        hasSelection: false,
      }).reason,
    ).toBe('Only available in Visual mode');

    // In Visual mode the pen outranks the selection, for the same reason: "start editing" is true
    // until they take the pen; "select an activity" would be answered and then refused again.
    expect(
      clearVisualPlacementGate({ ...open, canEditSchedule: false, hasSelection: false }).reason,
    ).toBe('Start editing to clear the placement.');
  });
});
