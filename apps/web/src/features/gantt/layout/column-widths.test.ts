import { describe, expect, it } from 'vitest';

import {
  CHART_MIN_WIDTH,
  COLUMN_MAX,
  COLUMN_MIN,
  DEFAULT_COLUMN_WIDTHS,
  chartGuard,
  clampColumnWidth,
  defaultGridWidth,
  ganttFixedWidth,
  gridCeiling,
  isDefaultWidths,
  readStoredWidths,
  serialiseWidths,
} from './column-widths';
import { GANTT_COLUMNS } from './grid-columns';

const DEFAULT_SET = GANTT_COLUMNS.filter((c) => c.key !== 'predecessors');

describe('readStoredWidths is total', () => {
  it.each([
    ['null', null],
    ['a string', '{"v":1}'],
    ['a number', 7],
    ['an array', []],
    ['no version', { widths: { code: 100 } }],
    ['a future version', { v: 2, widths: { code: 100 } }],
    ['widths missing', { v: 1 }],
    ['widths null', { v: 1, widths: null }],
  ])('ignores %s as a whole', (_label, raw) => {
    expect(readStoredWidths(raw)).toEqual({});
  });

  it('keeps a known key and clamps it', () => {
    expect(
      readStoredWidths({ v: 1, widths: { code: 160, duration: 5, totalFloat: 9999 } }),
    ).toEqual({ code: 160, duration: COLUMN_MIN, totalFloat: COLUMN_MAX });
  });

  it('drops unknown keys, including name, and non-finite or non-number values', () => {
    expect(
      readStoredWidths({
        v: 1,
        widths: {
          name: 300,
          wbs: 100,
          bogus: 100,
          code: Number.NaN,
          duration: Number.POSITIVE_INFINITY,
          earlyStart: '120',
          earlyFinish: -40,
        },
      }),
    ).toEqual({ earlyFinish: COLUMN_MIN });
  });

  it('round-trips through serialiseWidths', () => {
    const widths = { code: 160, predecessors: 300 };
    expect(readStoredWidths(JSON.parse(serialiseWidths(widths)))).toEqual(widths);
  });
});

describe('the shipped widths', () => {
  it('seed a default grid of 584 px, exactly what the grid was before widths were planner-set', () => {
    expect(defaultGridWidth(DEFAULT_SET, 0)).toBe(584);
    expect(defaultGridWidth(DEFAULT_SET, 72)).toBe(656);
  });

  it('write predecessors down rather than reaching it through a fallback', () => {
    expect(DEFAULT_COLUMN_WIDTHS.predecessors).toBe(90);
  });

  it('are all inside the planner bounds', () => {
    for (const width of Object.values(DEFAULT_COLUMN_WIDTHS)) {
      expect(clampColumnWidth(width)).toBe(width);
    }
  });

  it('count as default when nothing differs, and not when something does', () => {
    expect(isDefaultWidths({})).toBe(true);
    expect(isDefaultWidths({ code: 80 })).toBe(true);
    expect(isDefaultWidths({ code: 81 })).toBe(false);
  });

  it('fix at 524 px for the default set, and 686 with everything and a baseline', () => {
    expect(ganttFixedWidth(DEFAULT_SET, {}, 0)).toBe(524);
    expect(ganttFixedWidth(GANTT_COLUMNS, {}, 72)).toBe(686);
  });
});

describe('gridCeiling — the floor wins', () => {
  it('is the 720 cap while the floor is under it, and the floor above it', () => {
    expect(gridCeiling(524)).toBe(720);
    expect(gridCeiling(720)).toBe(720);
    expect(gridCeiling(1000)).toBe(1000);
  });
});

describe('chartGuard', () => {
  const limits = { fixedWithoutColumn: 444, pane: 584, scrollerWidth: 1000 };

  it('passes a width that leaves the chart its minimum', () => {
    expect(chartGuard(100, limits)).toBe(100);
  });

  it('clamps to the largest width that keeps the chart', () => {
    // 1000 - 240 = 760 of room for the block; 760 - 444 left for the column.
    expect(chartGuard(400, limits)).toBe(760 - 444);
  });

  it('lets the column use the pane when the pane already leaves less than the minimum', () => {
    // A 584 pane in a 700 scroller leaves 116 for the chart: nothing the planner types can make the
    // block smaller, so the column may take what the pane has beyond the others (Activity gives way).
    expect(chartGuard(400, { ...limits, scrollerWidth: 700 })).toBe(584 - 444);
  });

  it('never goes below the column minimum, and never refuses', () => {
    expect(chartGuard(400, { fixedWithoutColumn: 900, pane: 584, scrollerWidth: 700 })).toBe(
      COLUMN_MIN,
    );
    expect(CHART_MIN_WIDTH).toBe(240);
  });
});
