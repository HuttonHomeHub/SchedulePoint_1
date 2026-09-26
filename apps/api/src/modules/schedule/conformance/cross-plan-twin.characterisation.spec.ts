import { describe, expect, it } from 'vitest';

import {
  cellName,
  enumerateMatrix,
  MATRIX_LAGS,
  MATRIX_LAG_CALENDARS,
  type CrossPlanMatrixCell,
} from './cross-plan-matrix';
import { modelCell, predictDisagreement } from './cross-plan-prediction';
import { runTwinToday } from './cross-plan-twin';

/**
 * **M2-T6 INVERTS THIS FILE.** It characterises today's defect; once the derivation runs on
 * instants, every cell below must read `0` (spec FC-1, twin equality to the minute), and this file
 * becomes that assertion. Do not "fix" a red cell here by editing the prediction.
 *
 * **What it pins** (#385, plan M0-T1 step 5): across the whole parity matrix, today's cross-plan
 * derivation disagrees with the same link inside one plan on **exactly** the cells the written
 * prediction says it does, by exactly the predicted number of working days, and agrees on the rest.
 * The prediction (`cross-plan-prediction.ts`) was committed before this ran, and the red run it was
 * compared with is `docs/specs/cross-plan-day-boundary/m0/red-run.md`.
 *
 * Both sides are independent of each other: the twin runs the real engine and the real
 * `deriveExternalInstants`; the prediction is a hand model with its own calendar arithmetic. A
 * cell that agrees here agrees because two different derivations of the same rule agree, not
 * because one read the other's output.
 */

/** 1,728 cells, grouped by everything except the lag and its calendar so a failure names its row. */
function groups(): Map<string, CrossPlanMatrixCell[]> {
  const byRow = new Map<string, CrossPlanMatrixCell[]>();
  for (const cell of enumerateMatrix()) {
    const key = `${cell.direction} ${cell.linkType} local=${cell.localType} remote=${cell.remoteType} ${cell.calendar}`;
    const row = byRow.get(key) ?? [];
    row.push(cell);
    byRow.set(key, row);
  }
  return byRow;
}

describe('#385 red run: today disagrees with one plan exactly where predicted', () => {
  for (const [row, cells] of groups()) {
    it(row, () => {
      expect(cells).toHaveLength(MATRIX_LAGS.length * MATRIX_LAG_CALENDARS.length);
      for (const cell of cells) {
        const observed = runTwinToday(cell);
        // Non-vacuity: the derivation produced a bound in every cell, so every comparison below
        // is between two answers and not between an answer and the data date.
        expect(observed.derivedDate, cellName(cell)).not.toBeNull();
        expect(observed.disagreementDays, cellName(cell)).toBe(modelCell(cell).disagreementDays);
      }
    });
  }

  it('the prediction and the run agree on the size of the defect', () => {
    // The totals `m0/red-run.md` records, pinned so a change to the geometry is noticed here.
    const cells = enumerateMatrix();
    const predictedToDisagree = cells.filter((c) => predictDisagreement(c) !== 'equal').length;
    expect(cells).toHaveLength(1728);
    expect(predictedToDisagree).toBe(919);
  });
});
