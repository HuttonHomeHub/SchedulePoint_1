import type { ResourceHistogramBucket, ResourceHistogramSeries } from '@repo/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ResourceLoadingTable } from './ResourceLoadingTable';

/**
 * **The caption claimed an ordering the table did not do.**
 *
 * `ResourceLoadingTable`'s caption has always read "ordered by total budgeted units, largest first",
 * and the table rendered whatever order its caller handed it — which from the engine is `resourceId`
 * (UUID) order, unrelated to load. Both call sites passed the raw list, and both existing fixtures
 * happened to be in descending order already, so a false caption shipped green.
 *
 * The spec's US-4 requires the column order to match the chart's bands so a reader moving between
 * the two is not re-mapping. These cases are written with the fixture DELIBERATELY in the wrong
 * order, which is the only shape that can tell the two implementations apart.
 */
const BUCKETS: ResourceHistogramBucket[] = [
  { start: '2026-01-05', end: '2026-01-12' },
  { start: '2026-01-12', end: '2026-01-19' },
];

function series(id: string, values: number[]): ResourceHistogramSeries {
  return { resourceId: id, values, total: values.reduce((a, b) => a + b, 0) };
}

function headers(): string[] {
  return screen
    .getAllByRole('columnheader')
    .map((th) => th.textContent ?? '')
    .filter((t) => t !== 'Bucket start' && t !== 'Total');
}

describe('the table orders its columns the way its caption says', () => {
  it('sorts by descending total even when handed the engine’s id order', () => {
    render(
      <ResourceLoadingTable
        buckets={BUCKETS}
        // Ascending by id, and deliberately ASCENDING by total — the shape the engine returns.
        series={[series('a', [1, 1]), series('b', [50, 50]), series('c', [9, 9])]}
        granularity="WEEK"
        resourceName={(id) => `Resource ${id}`}
      />,
    );
    expect(headers()).toEqual(['Resource b', 'Resource c', 'Resource a']);
  });

  it('breaks a tie on resourceId so two equal loads never swap between renders', () => {
    render(
      <ResourceLoadingTable
        buckets={BUCKETS}
        series={[series('z', [5, 5]), series('a', [5, 5])]}
        granularity="WEEK"
        resourceName={(id) => `Resource ${id}`}
      />,
    );
    expect(headers()).toEqual(['Resource a', 'Resource z']);
  });

  it('sums each bucket across every column, in the order it renders them', () => {
    render(
      <ResourceLoadingTable
        buckets={BUCKETS}
        series={[series('a', [1, 2]), series('b', [10, 20])]}
        granularity="WEEK"
        resourceName={(id) => `Resource ${id}`}
      />,
    );
    const rows = screen.getAllByRole('row');
    // Header row, then one row per bucket: 1 + 10 = 11, then 2 + 20 = 22.
    expect(rows[1]?.textContent).toContain('11');
    expect(rows[2]?.textContent).toContain('22');
  });
});
