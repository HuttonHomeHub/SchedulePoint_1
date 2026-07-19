import type { ActivitySummary, BaselineVarianceRow } from '@repo/types';
import { describe, expect, it } from 'vitest';

import {
  buildBaselineGhosts,
  buildColourInkMap,
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
  neutralInk: '#ni',
  floatCriticalInk: '#i0',
  floatLowInk: '#i1',
  floatMediumInk: '#i2',
  floatHighInk: '#i3',
  wbsInkCycle: ['#iw0', '#iw1', '#iw2'],
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

describe('buildColourInkMap', () => {
  it('pairs each Total-float fill band with its contrast-safe ink; null → neutral ink', () => {
    const acts = [
      colourable({ id: 'a', totalFloat: 0 }),
      colourable({ id: 'b', totalFloat: 3 }),
      colourable({ id: 'c', totalFloat: 10 }),
      colourable({ id: 'd', totalFloat: 40 }),
      colourable({ id: 'e', totalFloat: null }),
    ];
    const ink = buildColourInkMap(acts, 'totalFloat', PALETTE);
    expect(ink.get('a')).toBe(PALETTE.floatCriticalInk);
    expect(ink.get('b')).toBe(PALETTE.floatLowInk);
    expect(ink.get('c')).toBe(PALETTE.floatMediumInk);
    expect(ink.get('d')).toBe(PALETTE.floatHighInk);
    expect(ink.get('e')).toBe(PALETTE.neutralInk);
  });

  it('cycles the WBS ink cycle by the same stable index as the fill; ungrouped → neutral ink', () => {
    const acts = [
      colourable({ id: '1', parentId: 'p0' }),
      colourable({ id: '2', parentId: 'p1' }),
      colourable({ id: '3', parentId: 'p2' }),
      colourable({ id: '4', parentId: 'p3' }), // wraps the 3-ink cycle → same as p0
      colourable({ id: '5', parentId: null }),
    ];
    const ink = buildColourInkMap(acts, 'wbs', PALETTE);
    expect(ink.get('1')).toBe('#iw0');
    expect(ink.get('2')).toBe('#iw1');
    expect(ink.get('3')).toBe('#iw2');
    expect(ink.get('4')).toBe('#iw0'); // deterministic wrap, mirroring the fill map
    expect(ink.get('5')).toBe(PALETTE.neutralInk);
    // The ink map keys by the SAME ids the fill map does (paired 1:1 for the painter).
    const fill = buildColourMap(acts, 'wbs', PALETTE);
    expect([...ink.keys()]).toEqual([...fill.keys()]);
  });
});

// Contrast verification (WCAG 1.4.3): each lens fill band's inside-label ink must clear ≥ 4.5:1 against
// its fill in BOTH themes. The oklch values mirror `styles/globals.css`; a self-contained oklch→sRGB→
// relative-luminance helper computes the WCAG contrast ratio (no jsdom tokens needed).
describe('lens inside-label ink contrast (WCAG 1.4.3)', () => {
  const oklchToLuminance = (L: number, C: number, H: number): number => {
    const hr = (H * Math.PI) / 180;
    const a = C * Math.cos(hr);
    const b = C * Math.sin(hr);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const lin = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ].map((x) => Math.min(1, Math.max(0, x)));
    return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
  };
  const contrast = (fill: [number, number, number], ink: [number, number, number]): number => {
    const a = oklchToLuminance(...fill);
    const b = oklchToLuminance(...ink);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  type Rgb = [number, number, number];
  // [fill, ink] pairs per theme (fill token, its paired ink token — see resolveLensPalette).
  const pairs = (t: Record<string, Rgb>): Array<[string, Rgb, Rgb]> => [
    ['float critical', t.destructive!, t.destructiveFg!],
    ['float low', t.warning!, t.warningFg!],
    ['float medium', t.info!, t.infoFg!],
    ['float high', t.success!, t.successFg!],
    ['neutral', t.mutedFg!, t.background!],
    ['wbs chart-1', t.chart1!, t.primaryFg!],
    ['wbs chart-2', t.chart2!, t.warningFg!],
    ['wbs chart-3', t.chart3!, t.warningFg!],
    ['wbs chart-4', t.chart4!, t.warningFg!],
    ['wbs chart-5', t.chart5!, t.warningFg!],
  ];
  const light: Record<string, Rgb> = {
    destructive: [0.577, 0.245, 27.325],
    destructiveFg: [0.985, 0, 0],
    warning: [0.769, 0.15, 80],
    warningFg: [0.205, 0, 0],
    info: [0.5, 0.14, 240],
    infoFg: [0.985, 0, 0],
    success: [0.52, 0.14, 155],
    successFg: [0.985, 0, 0],
    mutedFg: [0.556, 0, 0],
    background: [1, 0, 0],
    primaryFg: [0.985, 0, 0],
    chart1: [0.55, 0.18, 255],
    chart2: [0.6, 0.13, 185],
    chart3: [0.6, 0.13, 155],
    chart4: [0.769, 0.15, 80],
    chart5: [0.627, 0.2, 320],
  };
  const dark: Record<string, Rgb> = {
    destructive: [0.52, 0.2, 22.216],
    destructiveFg: [0.985, 0, 0],
    warning: [0.82, 0.16, 82],
    warningFg: [0.205, 0, 0],
    info: [0.7, 0.13, 240],
    infoFg: [0.205, 0, 0],
    success: [0.696, 0.14, 160],
    successFg: [0.205, 0, 0],
    mutedFg: [0.708, 0, 0],
    background: [0.145, 0, 0],
    primaryFg: [0.205, 0, 0],
    chart1: [0.65, 0.17, 255],
    chart2: [0.696, 0.14, 185],
    chart3: [0.696, 0.14, 160],
    chart4: [0.82, 0.16, 82],
    chart5: [0.7, 0.19, 320],
  };
  for (const [theme, tokens] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    for (const [name, fill, ink] of pairs(tokens)) {
      it(`${name} ink clears 4.5:1 on its fill (${theme})`, () => {
        expect(contrast(fill, ink)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
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
    ['a', { laneIndex: 2, isMilestone: false }],
    ['b', { laneIndex: 5, isMilestone: false }],
    ['m', { laneIndex: 7, isMilestone: true }],
  ]);

  it('builds a ghost at the baseline dates, taking the LIVE lane by id (slipped)', () => {
    const ghosts = buildBaselineGhosts([varianceRow()], lanes);
    expect(ghosts).toEqual([
      {
        id: 'a',
        baselineStart: '2026-01-05',
        baselineFinish: '2026-01-08',
        laneIndex: 2,
        isMilestone: false,
      },
    ]);
  });

  it('carries the live activity’s milestone flag so the painter ghosts it as a diamond', () => {
    const ms = varianceRow({
      activityId: 'm',
      baselineStart: '2026-01-05',
      baselineFinish: '2026-01-05',
    });
    expect(buildBaselineGhosts([ms], lanes)[0]?.isMilestone).toBe(true);
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

  it('caps WBS groups at the palette cycle length (no two shown bands share a swatch) with a moreCount', () => {
    // Many parents (well beyond both the WBS_LEGEND_CAP and the 3-colour test cycle).
    const parents = Array.from({ length: WBS_LEGEND_CAP + 3 }, (_, i) =>
      legendActivity({ id: `p${i}`, code: `SUM${i}`, name: `Summary ${i}` }),
    );
    const children = parents.map((p, i) => legendActivity({ id: `c${i}`, parentId: p.id }));
    const legend = buildColourLegend([...parents, ...children], 'wbs', PALETTE);
    // The effective cap is min(WBS_LEGEND_CAP, wbsCycle.length) = 3 here, so exactly the cycle's worth of
    // distinct-swatch group bands show; the remaining groups collapse into moreCount (reconciliation).
    const groupBands = legend.bands.filter((b) => b.label !== 'Ungrouped');
    expect(groupBands).toHaveLength(PALETTE.wbsCycle.length);
    expect(new Set(groupBands.map((b) => b.colour)).size).toBe(groupBands.length); // all distinct
    expect(groupBands[0]?.label).toBe('SUM0');
    expect(legend.moreCount).toBe(WBS_LEGEND_CAP + 3 - PALETTE.wbsCycle.length);
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
