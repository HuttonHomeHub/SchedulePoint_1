import { describe, expect, it } from 'vitest';

import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { PLAN_MODE_SEGMENT_LABELS } from '@/components/layout/workspace/plan-workspace-toolbar';
import { splitByRow } from '@/components/ui/toolbar';

/**
 * **The mode row's two switches stay named** (`docs/TECH_DEBT.md` #201, US-5).
 *
 * `Toolbar.segmentLabels` is all-or-nothing by design: if ANY item in the taxonomy group lacks a
 * labelled `segment`, the whole group falls back to one region named from `groupLabels`. That
 * fallback is the right behaviour — a partial partition would leave an unnamed region, which is
 * worse than the defect — but it is **silent**. An item added to the mode row without a `segment`
 * would quietly reinstate the undifferentiated four-way group this epic exists to remove, and
 * nothing on screen or in any other suite would say so.
 *
 * So the two halves of the precondition are asserted here, against the **real** registry and the
 * **real** host map imported from where the product reads them — never a restatement, which is how
 * a gate comes to pass while the product is wrong (ADR-0093's shape).
 */
describe('the plan mode row is fully segmented', () => {
  const rows = splitByRow(buildTsldToolbarItems());

  /**
   * **The pinned positive, and it is not decoration.** Both assertions below are vacuously true of
   * an empty row — `[].every(...)` is `true` — so with the view items behind `GANTT_VIEW_ENABLED`
   * and the scheduling items behind their own flag, a build that rendered no mode row at all would
   * pass this file perfectly. A green suite must not be able to mean "the capability is gone"
   * (ADR-0093's duplication gate carries its second assertion for exactly this reason; ADR-0108's
   * census passed its "nothing unclassified" check because its glob matched zero files).
   */
  it('has at least the four items the epic is about', () => {
    expect(rows.mode.length).toBeGreaterThanOrEqual(4);
    expect(rows.mode.map((i) => i.id)).toEqual(
      expect.arrayContaining(['mode-early', 'mode-visual', 'view-tsld', 'view-gantt']),
    );
  });

  it('every item on the row declares a segment', () => {
    const unsegmented = rows.mode.filter((item) => !item.segment).map((item) => item.id);
    expect(unsegmented).toEqual([]);
  });

  it('every segment on the row is named by the host map', () => {
    const unnamed = [...new Set(rows.mode.map((item) => item.segment))].filter(
      (segment) => segment !== undefined && !(segment in PLAN_MODE_SEGMENT_LABELS),
    );
    expect(unnamed).toEqual([]);
  });

  /**
   * The other direction: a label for a segment the row does not have is dead weight rather than a
   * defect, but it is the residue that makes the next reader distrust the map. Cheap to hold.
   */
  it('names no segment the row does not have', () => {
    const present = new Set(rows.mode.map((item) => item.segment));
    expect(Object.keys(PLAN_MODE_SEGMENT_LABELS).filter((k) => !present.has(k))).toEqual([]);
  });
});
