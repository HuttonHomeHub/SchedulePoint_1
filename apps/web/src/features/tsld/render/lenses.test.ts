import type { ActivitySummary, BaselineVarianceRow } from '@repo/types';
import { describe, expect, it } from 'vitest';

import {
  buildBaselineGhosts,
  buildColourLegend,
  buildColourMap,
  buildWbsIndex,
  colourKeyFor,
  floatBucketKey,
  isFilterActive,
  matchesActivityFilter,
  NEUTRAL_COLOUR_KEY,
  WBS_LEGEND_CAP,
  type ColourableActivity,
  type FilterAttr,
  type LegendActivity,
  type LensPalette,
  type MatchableActivity,
} from './lenses';

// ── Filter matcher ─────────────────────────────────────────────────────────────────────

function matchable(over: Partial<MatchableActivity> = {}): MatchableActivity {
  return {
    code: 'A100',
    name: 'Pour concrete',
    isCritical: false,
    constraintType: null,
    visualConflict: false,
    ...over,
  };
}
const NO_ATTRS = new Set<FilterAttr>();

describe('matchesActivityFilter', () => {
  it('matches everything when the query is blank and no attrs are set (the identity)', () => {
    expect(matchesActivityFilter(matchable(), '', NO_ATTRS)).toBe(true);
    expect(matchesActivityFilter(matchable(), '   ', NO_ATTRS)).toBe(true);
  });

  it('matches text case-insensitively across code and name', () => {
    expect(matchesActivityFilter(matchable(), 'concrete', NO_ATTRS)).toBe(true);
    expect(matchesActivityFilter(matchable(), 'CONCRETE', NO_ATTRS)).toBe(true);
    expect(matchesActivityFilter(matchable(), 'a100', NO_ATTRS)).toBe(true);
    expect(matchesActivityFilter(matchable(), 'steel', NO_ATTRS)).toBe(false);
  });

  it('tolerates a null code in the haystack', () => {
    expect(matchesActivityFilter(matchable({ code: null }), 'pour', NO_ATTRS)).toBe(true);
    expect(matchesActivityFilter(matchable({ code: null }), 'a100', NO_ATTRS)).toBe(false);
  });

  it('applies each attribute predicate', () => {
    const critical = new Set<FilterAttr>(['critical']);
    expect(matchesActivityFilter(matchable({ isCritical: true }), '', critical)).toBe(true);
    expect(matchesActivityFilter(matchable({ isCritical: false }), '', critical)).toBe(false);

    const constraint = new Set<FilterAttr>(['constraint']);
    expect(matchesActivityFilter(matchable({ constraintType: 'SNET' }), '', constraint)).toBe(true);
    expect(matchesActivityFilter(matchable({ constraintType: null }), '', constraint)).toBe(false);

    const conflict = new Set<FilterAttr>(['conflict']);
    expect(matchesActivityFilter(matchable({ visualConflict: true }), '', conflict)).toBe(true);
    expect(matchesActivityFilter(matchable({ visualConflict: false }), '', conflict)).toBe(false);
  });

  it('is the intersection of text AND every toggled attribute', () => {
    const attrs = new Set<FilterAttr>(['critical', 'conflict']);
    const both = matchable({ isCritical: true, visualConflict: true, name: 'Pour concrete' });
    expect(matchesActivityFilter(both, 'concrete', attrs)).toBe(true);
    // Text matches but an attribute fails → excluded.
    expect(matchesActivityFilter({ ...both, visualConflict: false }, 'concrete', attrs)).toBe(
      false,
    );
    // Attributes match but text fails → excluded.
    expect(matchesActivityFilter(both, 'steel', attrs)).toBe(false);
  });
});

describe('isFilterActive', () => {
  it('is false only for a blank query and no attributes', () => {
    expect(isFilterActive('', NO_ATTRS)).toBe(false);
    expect(isFilterActive('   ', NO_ATTRS)).toBe(false);
    expect(isFilterActive('x', NO_ATTRS)).toBe(true);
    expect(isFilterActive('', new Set<FilterAttr>(['critical']))).toBe(true);
  });
});

// ── Colour-by ──────────────────────────────────────────────────────────────────────────

const PALETTE: LensPalette = {
  critical: '#crit',
  nearCritical: '#near',
  bar: '#bar',
  neutral: '#neutral',
  floatCritical: '#f0',
  floatLow: '#f1',
  floatMedium: '#f2',
  floatHigh: '#f3',
  wbsCycle: ['#w0', '#w1', '#w2'],
};

function colourable(over: Partial<ColourableActivity> = {}): ColourableActivity {
  return {
    id: 'x',
    isCritical: false,
    isNearCritical: false,
    totalFloat: 10,
    parentId: null,
    ...over,
  };
}

describe('floatBucketKey', () => {
  it('buckets each boundary (≤0 / 1–5 / 6–20 / >20) and null → neutral', () => {
    expect(floatBucketKey(null)).toBe(NEUTRAL_COLOUR_KEY);
    expect(floatBucketKey(-3)).toBe('critical');
    expect(floatBucketKey(0)).toBe('critical');
    expect(floatBucketKey(1)).toBe('low');
    expect(floatBucketKey(5)).toBe('low');
    expect(floatBucketKey(6)).toBe('medium');
    expect(floatBucketKey(20)).toBe('medium');
    expect(floatBucketKey(21)).toBe('high');
    expect(floatBucketKey(999)).toBe('high');
  });
});

describe('colourKeyFor', () => {
  it('criticality mirrors the painter (critical / nearCritical / normal)', () => {
    expect(colourKeyFor(colourable({ isCritical: true }), 'criticality')).toBe('critical');
    expect(colourKeyFor(colourable({ isNearCritical: true }), 'criticality')).toBe('nearCritical');
    expect(colourKeyFor(colourable(), 'criticality')).toBe('normal');
  });

  it('totalFloat keys by bucket; wbs keys by parentId (null → neutral)', () => {
    expect(colourKeyFor(colourable({ totalFloat: 3 }), 'totalFloat')).toBe('low');
    expect(colourKeyFor(colourable({ parentId: 'w1' }), 'wbs')).toBe('w1');
    expect(colourKeyFor(colourable({ parentId: null }), 'wbs')).toBe(NEUTRAL_COLOUR_KEY);
  });
});

describe('buildColourMap', () => {
  it('Criticality equals the baseline fill (critical / near-critical / on-schedule)', () => {
    const acts = [
      colourable({ id: 'c', isCritical: true }),
      colourable({ id: 'n', isNearCritical: true }),
      colourable({ id: 'o' }),
    ];
    const map = buildColourMap(acts, 'criticality', PALETTE);
    expect(map.get('c')).toBe(PALETTE.critical);
    expect(map.get('n')).toBe(PALETTE.nearCritical);
    expect(map.get('o')).toBe(PALETTE.bar);
  });

  it('Total float maps buckets to their band colours, null → neutral', () => {
    const acts = [
      colourable({ id: 'a', totalFloat: 0 }),
      colourable({ id: 'b', totalFloat: 3 }),
      colourable({ id: 'c', totalFloat: 10 }),
      colourable({ id: 'd', totalFloat: 40 }),
      colourable({ id: 'e', totalFloat: null }),
    ];
    const map = buildColourMap(acts, 'totalFloat', PALETTE);
    expect(map.get('a')).toBe(PALETTE.floatCritical);
    expect(map.get('b')).toBe(PALETTE.floatLow);
    expect(map.get('c')).toBe(PALETTE.floatMedium);
    expect(map.get('d')).toBe(PALETTE.floatHigh);
    expect(map.get('e')).toBe(PALETTE.neutral);
  });

  it('WBS assigns a deterministic, stable colour per parent and cycles the palette', () => {
    const acts = [
      colourable({ id: '1', parentId: 'p0' }),
      colourable({ id: '2', parentId: 'p1' }),
      colourable({ id: '3', parentId: 'p2' }),
      colourable({ id: '4', parentId: 'p3' }), // wraps the 3-colour cycle → same as p0
      colourable({ id: '5', parentId: null }),
    ];
    const map = buildColourMap(acts, 'wbs', PALETTE);
    expect(map.get('1')).toBe('#w0');
    expect(map.get('2')).toBe('#w1');
    expect(map.get('3')).toBe('#w2');
    expect(map.get('4')).toBe('#w0'); // deterministic wrap
    expect(map.get('5')).toBe(PALETTE.neutral);
    // Stable across renders: a second build over the same activities is identical.
    expect([...buildColourMap(acts, 'wbs', PALETTE)]).toEqual([...map]);
  });
});

describe('buildWbsIndex', () => {
  it('indexes parents in first-appearance order, ignoring nulls', () => {
    const index = buildWbsIndex([
      colourable({ parentId: 'b' }),
      colourable({ parentId: null }),
      colourable({ parentId: 'a' }),
      colourable({ parentId: 'b' }),
    ]);
    expect(index.get('b')).toBe(0);
    expect(index.get('a')).toBe(1);
    expect(index.size).toBe(2);
  });
});

// ── Baseline ghosts ──────────────────────────────────────────────────────────────────────

function varianceRow(over: Partial<BaselineVarianceRow> = {}): BaselineVarianceRow {
  return {
    activityId: 'a',
    code: null,
    name: 'A',
    inBaseline: true,
    removed: false,
    currentStart: '2026-01-10',
    currentFinish: '2026-01-12',
    currentTotalFloat: 0,
    baselineStart: '2026-01-05',
    baselineFinish: '2026-01-08',
    baselineTotalFloat: 0,
    startVarianceDays: 5,
    finishVarianceDays: 4,
    floatVarianceDays: 0,
    ...over,
  };
}

describe('buildBaselineGhosts', () => {
  const lanes = new Map([
    ['a', { laneIndex: 2 }],
    ['b', { laneIndex: 5 }],
  ]);

  it('builds a ghost at the baseline dates, taking the LIVE lane by id (slipped)', () => {
    const ghosts = buildBaselineGhosts([varianceRow()], lanes);
    expect(ghosts).toEqual([
      { id: 'a', baselineStart: '2026-01-05', baselineFinish: '2026-01-08', laneIndex: 2 },
    ]);
  });

  it('handles an on-time activity (baseline == current dates)', () => {
    const onTime = varianceRow({
      baselineStart: '2026-01-10',
      baselineFinish: '2026-01-12',
      startVarianceDays: 0,
      finishVarianceDays: 0,
    });
    expect(buildBaselineGhosts([onTime], lanes)[0]?.baselineStart).toBe('2026-01-10');
  });

  it('omits removed-in-baseline rows (no live lane)', () => {
    const removed = varianceRow({ activityId: 'gone', removed: true });
    expect(buildBaselineGhosts([removed], lanes)).toEqual([]);
  });

  it('omits rows whose live activity is missing (still loading / filtered)', () => {
    expect(buildBaselineGhosts([varianceRow({ activityId: 'missing' })], lanes)).toEqual([]);
  });

  it('omits rows with null baseline dates', () => {
    expect(buildBaselineGhosts([varianceRow({ baselineStart: null })], lanes)).toEqual([]);
    expect(buildBaselineGhosts([varianceRow({ baselineFinish: null })], lanes)).toEqual([]);
  });

  it('returns an empty list for no active baseline (no rows)', () => {
    expect(buildBaselineGhosts([], lanes)).toEqual([]);
  });
});

// ── Colour legend ────────────────────────────────────────────────────────────────────────

function legendActivity(over: Partial<LegendActivity> = {}): LegendActivity {
  return {
    id: 'x',
    name: 'X',
    code: null,
    isCritical: false,
    isNearCritical: false,
    totalFloat: 10,
    parentId: null,
    ...over,
  };
}

describe('buildColourLegend', () => {
  it('has no extra bands for Criticality (the Legend keeps its default key)', () => {
    expect(buildColourLegend([legendActivity()], 'criticality', PALETTE)).toEqual({
      bands: [],
      moreCount: 0,
    });
  });

  it('lists the four float bands, adding a neutral band when a null float exists', () => {
    const withNull = buildColourLegend(
      [legendActivity({ totalFloat: 3 }), legendActivity({ totalFloat: null })],
      'totalFloat',
      PALETTE,
    );
    expect(withNull.bands.map((b) => b.colour)).toEqual([
      PALETTE.floatCritical,
      PALETTE.floatLow,
      PALETTE.floatMedium,
      PALETTE.floatHigh,
      PALETTE.neutral,
    ]);
    const noNull = buildColourLegend([legendActivity({ totalFloat: 3 })], 'totalFloat', PALETTE);
    expect(noNull.bands).toHaveLength(4);
  });

  it('labels WBS groups by parent code/name and caps them with a moreCount', () => {
    // One summary parent + N children under distinct parents beyond the cap.
    const parents = Array.from({ length: WBS_LEGEND_CAP + 3 }, (_, i) =>
      legendActivity({ id: `p${i}`, code: `SUM${i}`, name: `Summary ${i}` }),
    );
    const children = parents.map((p, i) => legendActivity({ id: `c${i}`, parentId: p.id }));
    const legend = buildColourLegend([...parents, ...children], 'wbs', PALETTE);
    // The summary parents are themselves ungrouped (null parent), so the key is the capped 8 group
    // bands + one "Ungrouped" band; the 3 groups beyond the cap collapse into moreCount.
    const groupBands = legend.bands.filter((b) => b.label !== 'Ungrouped');
    expect(groupBands).toHaveLength(WBS_LEGEND_CAP);
    expect(groupBands[0]?.label).toBe('SUM0');
    expect(legend.moreCount).toBe(3);
  });

  it('adds an Ungrouped band when a null-parent activity exists', () => {
    const legend = buildColourLegend(
      [legendActivity({ id: 'p', code: 'S', parentId: null }), legendActivity({ parentId: 'p' })],
      'wbs',
      PALETTE,
    );
    expect(legend.bands.some((b) => b.label === 'Ungrouped')).toBe(true);
  });
});

// Type-only guard: `ActivitySummary` satisfies the matcher/colour/legend shapes.
const _typecheck: MatchableActivity & ColourableActivity & LegendActivity = {} as ActivitySummary;
void _typecheck;
