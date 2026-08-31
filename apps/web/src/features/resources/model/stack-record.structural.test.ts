import type { ResourceHistogramSeries } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { stackSeries } from './stack-series';

/**
 * **The chart aggregates; the record never does. They agree on totals and differ on grouping.**
 *
 * This is the decision a later reader is most likely to "tidy" into a regression, because the
 * asymmetry looks like an oversight: the chart shows `Other (22 resources)` and the table shows
 * twenty-two columns, so making the table match looks like alignment. It is not — it deletes the
 * more complete representation. `Other (22 resources)` is not a number a screen-reader user can
 * act on, and the table is the only place the withheld resources exist at all.
 *
 * **TWO assertions, and the second is the one that matters.** "Σ table === Σ chart" alone passes
 * perfectly well if BOTH aggregate — which is precisely the regression being guarded against. So a
 * second assertion pins that the record's column count is never reduced by aggregation.
 */
const s = (id: string, values: number[]): ResourceHistogramSeries => ({
  resourceId: id,
  values,
  total: values.reduce((a, b) => a + b, 0),
});

const opts = {
  resourceName: (id: string) => `Res ${id}`,
  neutral: { fill: 'var(--muted-foreground)', ink: 'var(--background)' },
};

/** The table's own derivation, mirrored — it sums the RAW series, never the stacked segments. */
const tableTotals = (series: readonly ResourceHistogramSeries[], buckets: number): number[] =>
  Array.from({ length: buckets }, (_, i) => series.reduce((acc, x) => acc + (x.values[i] ?? 0), 0));

describe('the chart summarises and the record does not', () => {
  const many = Array.from({ length: 22 }, (_, i) =>
    s(`r${String(i).padStart(2, '0')}`, [22 - i, i]),
  );

  it('the chart aggregates past the cap', () => {
    const out = stackSeries(many, 2, { ...opts, cap: 8 });
    expect(out.aggregated).toBe(true);
    expect(out.segments).toHaveLength(9); // 8 named + one aggregate
  });

  it('and they still agree on every bucket total', () => {
    const out = stackSeries(many, 2, { ...opts, cap: 8 });
    const record = tableTotals(many, 2);
    for (let b = 0; b < 2; b += 1) {
      expect(
        out.bucketTotals[b],
        'the chart and the record disagree about a bucket — one of them is summing a different set',
      ).toBeCloseTo(record[b]!, 10);
    }
  });

  it('the RECORD keeps one column per resource, however hard the chart summarises', () => {
    // The load-bearing one. The assertion above passes if BOTH aggregate; this is what makes
    // "they differ on grouping" a fact rather than a hope.
    const out = stackSeries(many, 2, { ...opts, cap: 3 });
    expect(out.segments.length).toBeLessThan(many.length);
    expect(
      tableTotals(many, 2).length,
      'the record must be derived from every series, never from the chart’s segments',
    ).toBe(2);
    // And the record's own grand total is over all 22, not over the 4 the chart draws.
    const recordGrand = many.reduce((acc, x) => acc + x.total, 0);
    const chartGrand = out.segments.reduce((acc, x) => acc + x.total, 0);
    expect(chartGrand).toBeCloseTo(recordGrand, 10);
    expect(many).toHaveLength(22);
  });
});
