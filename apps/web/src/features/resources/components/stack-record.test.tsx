import type { ResourceHistogramBucket, ResourceHistogramSeries } from '@repo/types';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DEFAULT_STACK_CAP, stackSeries } from '../model/stack-series';

import { ResourceLoadingTable } from './ResourceLoadingTable';
import { ResourceStackChart } from './ResourceStackChart';

/**
 * **The chart summarises; the record never does. They agree on totals and differ on grouping.**
 *
 * This is the decision a later reader is most likely to "tidy" into a regression, because the
 * asymmetry looks like an oversight: the chart shows `Other (14 resources)` and the table shows
 * twenty-two columns, so making the table match looks like alignment. It is not — it deletes the
 * more complete representation. `Other (14 resources)` is not a number a screen-reader user can act
 * on, and the table is the only place the withheld resources exist at all.
 *
 * **It renders the real components, which the version this replaces did not.** That file asserted
 * against a private mirror of the table's own summing logic and never imported a component, so the
 * exact regression its docblock described — somebody wiring the table to the chart's aggregated
 * segments — would have left it passing unchanged. Its plan required the assertion to be verifiable
 * red against an aggregating implementation, and it could not be. Reviewed and reported
 * independently; a test that cannot see its subject is worse than none, because it stops anybody
 * looking.
 *
 * **Two assertions, and the second is the one that matters.** "The totals agree" alone passes
 * perfectly well if BOTH aggregate — precisely the regression being guarded against — so the second
 * pins that the record's column count is never reduced by aggregation.
 */
const BUCKETS: ResourceHistogramBucket[] = [
  { start: '2026-01-05', end: '2026-01-12' },
  { start: '2026-01-12', end: '2026-01-19' },
];

const COUNT = DEFAULT_STACK_CAP + 14;
const MANY: ResourceHistogramSeries[] = Array.from({ length: COUNT }, (_, i) => ({
  resourceId: `r${String(i).padStart(2, '0')}`,
  values: [COUNT - i, i + 1],
  total: COUNT - i + i + 1,
}));

const stacked = stackSeries(MANY, BUCKETS.length, {
  resourceName: (id) => `Res ${id}`,
  neutral: { fill: 'var(--muted-foreground)', ink: 'var(--background)' },
});

describe('the chart summarises and the record does not', () => {
  it('the chart aggregates past the cap', () => {
    render(<ResourceStackChart stacked={stacked} buckets={BUCKETS} />);
    expect(screen.getByText(`Other (14 resources)`)).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Legend' })).getAllByRole('listitem'),
    ).toHaveLength(DEFAULT_STACK_CAP + 1);
  });

  it('the table keeps a column for EVERY resource, aggregating nothing', () => {
    render(
      <ResourceLoadingTable
        buckets={BUCKETS}
        series={MANY}
        granularity="WEEK"
        resourceName={(id) => `Res ${id}`}
      />,
    );
    const named = screen
      .getAllByRole('columnheader')
      .map((th) => th.textContent ?? '')
      .filter((t) => t !== 'Bucket start' && t !== 'Total');
    expect(named).toHaveLength(COUNT);
    expect(screen.queryByText(/^Other \(/)).toBeNull();
  });

  it('and the two agree on every bucket total, over different groupings', () => {
    render(
      <ResourceLoadingTable
        buckets={BUCKETS}
        series={MANY}
        granularity="WEEK"
        resourceName={(id) => `Res ${id}`}
      />,
    );
    const rows = screen.getAllByRole('row');
    for (let b = 0; b < BUCKETS.length; b += 1) {
      // The table's rendered Total cell against the chart's own summed-in-draw-order figure.
      expect(rows[b + 1]?.textContent).toContain(String(stacked.bucketTotals[b]));
    }
  });
});
