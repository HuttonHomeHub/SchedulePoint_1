import type { ResourceHistogramSeries } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { DEFAULT_STACK_CAP, groupSeries, stackOffsets, stackSeries } from './stack-series';

import { CATEGORICAL_CYCLE_LENGTH } from '@/features/tsld/render/palette';

const neutral = { fill: 'var(--muted-foreground)', ink: 'var(--background)' };
const name = (id: string): string => `Res ${id}`;
const opts = { resourceName: name, neutral };

const s = (id: string, values: number[]): ResourceHistogramSeries => ({
  resourceId: id,
  values,
  total: values.reduce((a, b) => a + b, 0),
});

describe('stackSeries', () => {
  it('ranks by whole-series total, descending', () => {
    const out = stackSeries([s('a', [1, 1]), s('b', [5, 5]), s('c', [3, 3])], 2, opts);
    expect(out.segments.map((x) => x.resourceId)).toEqual(['b', 'c', 'a']);
  });

  it('breaks ties on resourceId, so equal totals do not swap colours between renders', () => {
    // Without the tie-break, Array.prototype.sort's behaviour on equal keys is the engine's
    // business, and two resources could trade colours on a re-render with nothing on screen
    // explaining it.
    const first = stackSeries([s('z', [4]), s('a', [4])], 1, opts);
    const second = stackSeries([s('a', [4]), s('z', [4])], 1, opts);
    expect(first.segments.map((x) => x.resourceId)).toEqual(['a', 'z']);
    expect(second.segments.map((x) => x.resourceId)).toEqual(['a', 'z']);
  });

  it('gives segment n the nth cycle colour, and never repeats among shown bands', () => {
    const many = Array.from({ length: DEFAULT_STACK_CAP }, (_, i) =>
      s(`r${String(i)}`, [DEFAULT_STACK_CAP - i]),
    );
    const out = stackSeries(many, 1, opts);
    const fills = out.segments.map((x) => x.fill);
    expect(new Set(fills).size, 'two visible bands share a colour').toBe(fills.length);
    expect(fills[0]).toBe('var(--chart-1)');
  });

  it('aggregates past the cap into one last segment that names its count', () => {
    const many = Array.from({ length: 11 }, (_, i) => s(`r${String(i)}`, [11 - i]));
    const out = stackSeries(many, 1, { ...opts, cap: 3 });
    expect(out.segments).toHaveLength(4);
    const last = out.segments[3]!;
    expect(last.resourceId).toBeNull();
    expect(last.label).toBe('Other (8 resources)');
    expect(last.resourceCount).toBe(8);
    expect(out.aggregated).toBe(true);
    // The aggregate carries the real sum, not a placeholder.
    expect(last.total).toBe(8 + 7 + 6 + 5 + 4 + 3 + 2 + 1);
  });

  it('says "1 resource", not "1 resources"', () => {
    const out = stackSeries([s('a', [3]), s('b', [2])], 1, { ...opts, cap: 1 });
    expect(out.segments[1]?.label).toBe('Other (1 resource)');
  });

  it('does not aggregate when everything fits', () => {
    const out = stackSeries([s('a', [1]), s('b', [2])], 1, { ...opts, cap: 8 });
    expect(out.aggregated).toBe(false);
    expect(out.segments.every((x) => x.resourceId !== null)).toBe(true);
  });

  it('clamps a cap above the palette length, because two bands must never share a colour', () => {
    const many = Array.from({ length: 20 }, (_, i) => s(`r${String(i)}`, [20 - i]));
    const out = stackSeries(many, 1, { ...opts, cap: 99 });
    const coloured = out.segments.filter((x) => x.resourceId !== null);
    expect(coloured).toHaveLength(CATEGORICAL_CYCLE_LENGTH);
    expect(new Set(coloured.map((x) => x.fill)).size).toBe(CATEGORICAL_CYCLE_LENGTH);
  });

  it('conserves units — Σ segments equals Σ input, per bucket and overall', () => {
    const input = [s('a', [1, 2, 3]), s('b', [4, 5, 6]), s('c', [7, 8, 9]), s('d', [10, 11, 12])];
    const out = stackSeries(input, 3, { ...opts, cap: 2 });
    for (let b = 0; b < 3; b += 1) {
      const expected = input.reduce((acc, x) => acc + (x.values[b] ?? 0), 0);
      expect(out.bucketTotals[b]).toBeCloseTo(expected, 10);
    }
    const grand = input.reduce((acc, x) => acc + x.total, 0);
    expect(out.segments.reduce((acc, x) => acc + x.total, 0)).toBeCloseTo(grand, 10);
  });

  it('peak is the tallest STACKED bucket, not the tallest single series', () => {
    // The distinction the scale depends on: two resources of 3 in one bucket is a 6-tall stack.
    const out = stackSeries([s('a', [3, 0]), s('b', [3, 1])], 2, opts);
    expect(out.peak).toBe(6);
  });

  it('handles an empty plan without inventing a scale', () => {
    const out = stackSeries([], 0, opts);
    expect(out.segments).toEqual([]);
    expect(out.peak).toBe(0);
    expect(out.aggregated).toBe(false);
  });

  it('tolerates a series shorter than the bucket axis', () => {
    // Defensive: the axis lives in `meta` and the series in `data`, so a short series is a wire
    // shape the client should survive rather than throw on.
    const out = stackSeries([s('a', [1])], 3, opts);
    expect(out.bucketTotals).toEqual([1, 0, 0]);
  });
});

describe('stackOffsets', () => {
  it('starts each segment where the previous one ended', () => {
    const out = stackSeries([s('a', [5]), s('b', [3]), s('c', [2])], 1, opts);
    expect(stackOffsets(out, 1)[0]).toEqual([0, 5, 8]);
  });

  it('the last band ends exactly on the bucket total, in draw order', () => {
    // Summed the same way, in the same order, so the top of the stack cannot miss the axis by a
    // hair at some zooms and not others.
    const input = [s('a', [0.1]), s('b', [0.2]), s('c', [0.3])];
    const out = stackSeries(input, 1, opts);
    const offsets = stackOffsets(out, 1)[0]!;
    const lastIdx = out.segments.length - 1;
    const top = offsets[lastIdx]! + out.segments[lastIdx]!.values[0]!;
    expect(top).toBe(out.bucketTotals[0]);
  });
});

describe('groupSeries', () => {
  const parents: Record<string, string | null> = {
    a: 'g-steel',
    b: 'g-steel',
    c: 'g-conc',
    solo: null,
  };
  const parentOf = (id: string): string | null => parents[id] ?? null;
  const names: Record<string, string> = {
    'g-steel': 'Steelwork',
    'g-conc': 'Concrete',
    solo: 'Tower crane',
  };
  const nameOf = (id: string): string => names[id] ?? `Res ${id}`;

  it('folds resources into their parent group, summing per bucket and overall', () => {
    const out = groupSeries([s('a', [1, 2]), s('b', [3, 4]), s('c', [5, 6])], 2, parentOf, nameOf);
    const steel = out.series.find((x) => x.resourceId === 'g-steel')!;
    expect(steel.values).toEqual([4, 6]);
    expect(steel.total).toBe(10);
    expect(out.nameOf('g-steel')).toBe('Steelwork');
  });

  it('a resource with no parent stands for ITSELF, not for an "Ungrouped" bucket', () => {
    // Deliberate: a standalone tower crane is a thing in the plan, not an absence. Burying it in a
    // word for "no group" would hide a real resource behind a category that does not exist.
    const out = groupSeries([s('solo', [7, 8]), s('a', [1, 1])], 2, parentOf, nameOf);
    const own = out.series.find((x) => x.resourceId === 'solo')!;
    expect(own.values).toEqual([7, 8]);
    expect(out.nameOf('solo')).toBe('Tower crane');
    expect(out.series.map((x) => x.resourceId).sort()).toEqual(['g-steel', 'solo']);
  });

  it('conserves units across the regrouping', () => {
    const input = [s('a', [1, 2]), s('b', [3, 4]), s('c', [5, 6]), s('solo', [7, 8])];
    const out = groupSeries(input, 2, parentOf, nameOf);
    const before = input.reduce((acc, x) => acc + x.total, 0);
    const after = out.series.reduce((acc, x) => acc + x.total, 0);
    expect(after).toBe(before);
    for (let b = 0; b < 2; b += 1) {
      expect(out.series.reduce((acc, x) => acc + (x.values[b] ?? 0), 0)).toBe(
        input.reduce((acc, x) => acc + (x.values[b] ?? 0), 0),
      );
    }
  });

  it('turns an over-cap resource stack into named groups with no aggregate at all', () => {
    // The point of the feature: 40 resources stacked by resource is 8 bands + "Other (32)"; by
    // group it is a handful of named trades and no aggregate.
    const many = Array.from({ length: 40 }, (_, i) => s(`r${String(i)}`, [1]));
    const twoGroups = (id: string): string => (Number(id.slice(1)) % 2 === 0 ? 'g-a' : 'g-b');
    const byResource = stackSeries(many, 1, { ...opts, cap: 8 });
    expect(byResource.aggregated).toBe(true);

    const grouped = groupSeries(many, 1, twoGroups, (id) => id);
    const byGroup = stackSeries(grouped.series, 1, {
      ...opts,
      cap: 8,
      resourceName: grouped.nameOf,
    });
    expect(byGroup.aggregated).toBe(false);
    expect(byGroup.segments).toHaveLength(2);
  });
});
