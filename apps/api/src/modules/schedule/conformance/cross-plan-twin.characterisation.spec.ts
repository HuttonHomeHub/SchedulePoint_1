import { describe, expect, it } from 'vitest';

import {
  cellName,
  enumerateMatrix,
  MATRIX_LAGS,
  MATRIX_LAG_CALENDARS,
  type CrossPlanMatrixCell,
  type MatrixCalendarName,
} from './cross-plan-matrix';
import { predictDisagreement } from './cross-plan-prediction';
import { runTwin, type TwinCalendars } from './cross-plan-twin';

/**
 * **FC-1: a cross-plan link gives the dates the same link gives inside one plan, to the minute,
 * in every cell** (#385; M2-T6 inverted this file from M0-T1's characterisation).
 *
 * Until M2 this file pinned the defect: across the whole parity matrix today's cross-plan derivation
 * disagreed with the same link inside one plan on exactly the cells a prediction committed first said
 * it would (919 of 1,728), by exactly the predicted number of working days. The red run is on record
 * at `docs/specs/cross-plan-day-boundary/m0/red-run.md`. With the derivation on instants every cell
 * reads `0`, and this file is that assertion. A red cell here is a defect in the derivation or in the
 * seam that feeds it; it is not fixed by editing an expectation.
 *
 * **What the twin can and cannot see** (spec D2): both worlds call the engine's shared bound
 * functions and date readers, so a defect INSIDE one of those would move both worlds together and
 * agree here. That is what the hand-derived goldens in `cross-plan-derivation.spec.ts` and
 * `cross-plan-conformance.spec.ts` exist for. What the twin sees is every seam around them: which
 * date is read, from which anchor, on which calendar, with which lag, composed how.
 *
 * **Two axes.** The original matrix puts both plans on one calendar, so its `PREDECESSOR`,
 * `SUCCESSOR` and `PROJECT_DEFAULT` columns name the same calendar and cannot tell the lag-calendar
 * rule from a wrong one. The mixed-calendar axis (added from M0's findings) puts the two plans on
 * Standard and eight-hour calendars, both ways round, for every lag calendar and both directions;
 * the in-plan twin names its lag calendar by hand, independently of the product's rule, so that is
 * what lets M2 claim spec D5 and CQ-2.
 */

/** 1,728 cells, grouped by everything except the lag and its calendar so a failure names its row. */
function groups(cells: CrossPlanMatrixCell[]): Map<string, CrossPlanMatrixCell[]> {
  const byRow = new Map<string, CrossPlanMatrixCell[]>();
  for (const cell of cells) {
    const key = `${cell.direction} ${cell.linkType} local=${cell.localType} remote=${cell.remoteType} ${cell.calendar}`;
    const row = byRow.get(key) ?? [];
    row.push(cell);
    byRow.set(key, row);
  }
  return byRow;
}

/** Assert one cell's equality, printing both answers when it fails. */
function expectEqual(cell: CrossPlanMatrixCell, name: string, cals?: TwinCalendars): void {
  const observed = runTwin(cell, cals);
  // Non-vacuity: the derivation produced a bound in every cell, so the comparison below is between
  // two answers and not between an answer and the data date.
  expect(observed.derivedValue, name).not.toBeNull();
  expect(
    {
      disagreementDays: observed.disagreementDays,
      crossPlan: `${observed.crossPlanDate} (+${observed.crossPlanOffset} min)`,
    },
    name,
  ).toEqual({
    disagreementDays: 0,
    crossPlan: `${observed.inPlanDate} (+${observed.inPlanOffset} min)`,
  });
}

describe('#385 FC-1: a cross-plan link equals the same link inside one plan (one calendar)', () => {
  for (const [row, cells] of groups(enumerateMatrix())) {
    it(row, () => {
      expect(cells).toHaveLength(MATRIX_LAGS.length * MATRIX_LAG_CALENDARS.length);
      for (const cell of cells) expectEqual(cell, cellName(cell));
    });
  }

  it('the M0 prediction still records the size of the defect this inverted', () => {
    // A record, not a check on the code: the committed prediction said 919 cells would disagree,
    // and M0-T1's red run observed exactly that. Every one of them now reads 0 above.
    const cells = enumerateMatrix();
    expect(cells).toHaveLength(1728);
    expect(cells.filter((c) => predictDisagreement(c) !== 'equal')).toHaveLength(919);
  });
});

/**
 * The mixed-calendar axis. The original matrix's cell list is reused with its calendar field fixed
 * to one value (so each shape appears once) and the two plans' calendars supplied separately.
 */
const MIXED_PAIRS: readonly TwinCalendars[] = [
  { upstream: 'standard', downstream: 'eightHour' },
  { upstream: 'eightHour', downstream: 'standard' },
];

function mixedCells(): CrossPlanMatrixCell[] {
  return enumerateMatrix().filter((c) => c.calendar === 'standard');
}

function mixedName(cell: CrossPlanMatrixCell, cals: TwinCalendars): string {
  const shape = cellName(cell).replace(' standard ', ' ');
  return `${shape} upstream=${cals.upstream} downstream=${cals.downstream}`;
}

describe('#385 FC-1 mixed-calendar axis: plans on different calendars (spec D5, CQ-2)', () => {
  for (const cals of MIXED_PAIRS) {
    for (const [row, cells] of groups(mixedCells())) {
      it(`${row.replace(' standard', '')} upstream=${cals.upstream} downstream=${cals.downstream}`, () => {
        for (const cell of cells) expectEqual(cell, mixedName(cell, cals), cals);
      });
    }
  }

  it('the axis is not redundant: the lag calendar changes the answer somewhere', () => {
    // The original matrix's defect, restated as a control: if PREDECESSOR and SUCCESSOR always gave
    // the PROJECT_DEFAULT answer here, this axis would be as blind to D5 as the one-calendar matrix.
    const answers = (source: CrossPlanMatrixCell['lagCalendar'], cals: TwinCalendars) =>
      mixedCells()
        .filter((c) => c.lagCalendar === source && c.lagDays !== 0)
        .map((c) => runTwin(c, cals).crossPlanOffset);
    const differing = (a: number[], b: number[]) => a.filter((v, i) => v !== b[i]).length;
    for (const cals of MIXED_PAIRS) {
      const byDefault = answers('PROJECT_DEFAULT', cals);
      const byPredecessor = answers('PREDECESSOR', cals);
      const bySuccessor = answers('SUCCESSOR', cals);
      // CQ-2: PROJECT_DEFAULT is the successor's plan's calendar, so it agrees with SUCCESSOR
      // (every activity inherits its plan's calendar here) and differs from PREDECESSOR.
      expect(differing(byDefault, bySuccessor), `${cals.upstream}→${cals.downstream}`).toBe(0);
      expect(
        differing(byDefault, byPredecessor),
        `${cals.upstream}→${cals.downstream}`,
      ).toBeGreaterThan(0);
    }
  });
});

/** The calendars the mixed axis uses, pinned so a change to them is a reviewed change. */
it('the mixed axis pairs Standard with eight-hour, both ways round', () => {
  const names = new Set<MatrixCalendarName>(MIXED_PAIRS.flatMap((p) => [p.upstream, p.downstream]));
  expect([...names].sort()).toEqual(['eightHour', 'standard']);
});
