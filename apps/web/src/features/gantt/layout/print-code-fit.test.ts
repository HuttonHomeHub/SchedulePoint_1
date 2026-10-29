import { describe, expect, it } from 'vitest';

import {
  fitPrintCodeColumns,
  omittedCodesSentence,
  PRINT_CHART_MIN,
  PRINT_CODE_COLUMN_WIDTH,
} from './print-code-fit';

/**
 * The arithmetic of `m3-spec.md` §1a, on the 980 px page. The standard columns the printed programme
 * carries by default are Code 60 + Activity 180 + Duration 72 + Start 72 + Finish 72 + Float 44 = 500;
 * Predecessors adds 132; a baseline adds the 66 px `vs baseline` column.
 */
const PAGE = 980;
const STANDARD = 500;
const WITH_PREDECESSORS = 632;
const VARIANCE = 66;
const TEN = Array.from({ length: 10 }, (_, i) => `C${String(i)}`);

describe('how many code columns the printed programme carries', () => {
  it('fits three with no baseline: (980 - 500 - 240) / 72', () => {
    const { printed, omitted } = fitPrintCodeColumns(PAGE, STANDARD, 0, TEN);
    expect(printed).toEqual(['C0', 'C1', 'C2']);
    expect(omitted).toEqual(TEN.slice(3));
  });

  it('fits two with a baseline, which takes its 66 px first', () => {
    expect(fitPrintCodeColumns(PAGE, STANDARD, VARIANCE, TEN).printed).toHaveLength(2);
  });

  it('fits none with Predecessors and a baseline, and names every one', () => {
    const { printed, omitted } = fitPrintCodeColumns(PAGE, WITH_PREDECESSORS, VARIANCE, TEN);
    expect(printed).toEqual([]);
    expect(omitted).toEqual(TEN);
  });

  it('keeps the chart at least 240 px wide at the boundary, and not one column past it', () => {
    const exactly = fitPrintCodeColumns(PAGE, STANDARD, 0, TEN);
    expect(
      PAGE - STANDARD - exactly.printed.length * PRINT_CODE_COLUMN_WIDTH,
    ).toBeGreaterThanOrEqual(PRINT_CHART_MIN);
    const oneMore = exactly.printed.length + 1;
    expect(PAGE - STANDARD - oneMore * PRINT_CODE_COLUMN_WIDTH).toBeLessThan(PRINT_CHART_MIN);
  });

  it('prints them all when they fit, and names none', () => {
    const { printed, omitted } = fitPrintCodeColumns(PAGE, STANDARD, 0, ['A', 'B']);
    expect(printed).toEqual(['A', 'B']);
    expect(omitted).toEqual([]);
  });

  it('takes the first columns in the order given, so paper reads like the screen', () => {
    expect(
      fitPrintCodeColumns(PAGE, STANDARD, 0, ['Trade', 'Area', 'Phase', 'System']).omitted,
    ).toEqual(['System']);
  });

  it('never returns a negative count when the standard columns alone overflow', () => {
    expect(fitPrintCodeColumns(PAGE, 2000, VARIANCE, ['A']).printed).toEqual([]);
  });
});

describe('the sentence under the chart', () => {
  it('names what was left off', () => {
    expect(omittedCodesSentence(['System', 'Phase'])).toBe(
      'Not printed, to leave room for the chart: System, Phase.',
    );
  });

  it('says nothing when nothing was left off', () => {
    expect(omittedCodesSentence([])).toBeNull();
  });
});
