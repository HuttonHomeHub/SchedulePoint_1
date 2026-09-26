import { describe, expect, it } from 'vitest';

import {
  enumerateMatrix,
  type CrossPlanMatrixCell,
  type MatrixDirection,
  type MatrixLinkType,
  type MatrixLocalType,
} from './cross-plan-matrix';
import { predictDisagreement, type CellPrediction } from './cross-plan-prediction';

/**
 * **The prediction checked against the spec's own table, and nothing else** (#385 M0-T1 step 1).
 *
 * This runs the hand model only. It imports neither the engine nor the derivation, so it says
 * nothing about today's code; it says that the model written for every cell reproduces, on the base
 * case, the table the spec committed in §4.2. If the two ever disagree, one of them is wrong about
 * the rules, and that has to be settled before any red run means anything.
 *
 * §4.2's base case: a 24-hour calendar, lag 0, and (because the table does not say) a task at the
 * remote end. The lag calendar cannot matter at lag 0, so it is checked at all four.
 */

const EARLY: CellPrediction = { days: 1, sign: 'early' };
const LATE: CellPrediction = { days: 1, sign: 'late' };
const LOOSE: CellPrediction = { days: 1, sign: 'loose' };
const TIGHT: CellPrediction = { days: 1, sign: 'tight' };

/** Spec §4.2, transcribed: rows are direction × link type, columns task / finish ms / start ms. */
const SECTION_4_2: ReadonlyArray<
  [MatrixDirection, MatrixLinkType, [CellPrediction, CellPrediction, CellPrediction]]
> = [
  ['forward', 'FS', [EARLY, 'equal', EARLY]],
  ['forward', 'SS', ['equal', LATE, 'equal']],
  ['forward', 'FF', [EARLY, 'equal', EARLY]],
  ['forward', 'SF', ['equal', LATE, 'equal']],
  ['backward', 'FS', [LOOSE, LOOSE, 'equal']],
  ['backward', 'SS', [LOOSE, LOOSE, 'equal']],
  ['backward', 'FF', ['equal', 'equal', TIGHT]],
  ['backward', 'SF', ['equal', 'equal', TIGHT]],
];

const LOCAL_COLUMNS: readonly MatrixLocalType[] = ['TASK', 'FINISH_MILESTONE', 'START_MILESTONE'];

describe('the #385 prediction reproduces spec §4.2 on its base case', () => {
  for (const [direction, linkType, row] of SECTION_4_2) {
    LOCAL_COLUMNS.forEach((localType, column) => {
      it(`${direction} ${linkType}, local ${localType}`, () => {
        for (const lagCalendar of [
          'PROJECT_DEFAULT',
          'PREDECESSOR',
          'SUCCESSOR',
          'TWENTY_FOUR_HOUR',
        ] as const) {
          const cell: CrossPlanMatrixCell = {
            direction,
            linkType,
            localType,
            remoteType: 'TASK',
            calendar: 'twentyFourHour',
            lagDays: 0,
            lagCalendar,
          };
          expect(predictDisagreement(cell), lagCalendar).toEqual(row[column]);
        }
      });
    });
  }
});

describe('the prediction covers every cell', () => {
  it('answers for all 1,728 cells without refusing a fixture', () => {
    // `modelCell` throws when the data date or the project finish would bind a cell, which would make
    // the cell compare two floors rather than two bounds. None may.
    const cells = enumerateMatrix();
    expect(cells).toHaveLength(2 * 4 * 3 * 2 * 3 * 3 * 4);
    for (const cell of cells) expect(() => predictDisagreement(cell)).not.toThrow();
  });
});
