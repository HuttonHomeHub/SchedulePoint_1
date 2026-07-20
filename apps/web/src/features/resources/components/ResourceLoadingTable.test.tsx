import type { ResourceHistogramBucket, ResourceHistogramSeries } from '@repo/types';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BucketSizeSelect, ResourceLoadingTable } from './ResourceLoadingTable';

/**
 * Direct coverage of the shared resource-loading table + bucket-size Select (component review B1/B3),
 * independent of the modal `ResourceHistogram` and the canvas `ResourceStripPanel` that both reuse them.
 */

const BUCKETS: ResourceHistogramBucket[] = [
  { start: '2026-01-05', end: '2026-01-12' },
  { start: '2026-01-12', end: '2026-01-19' },
];
const SERIES: ResourceHistogramSeries[] = [
  { resourceId: 'res-1', values: [10, 20], total: 30 },
  { resourceId: 'res-2', values: [5, 5], total: 10 },
];
const NAME_BY_ID: Record<string, string> = { 'res-1': 'Crew A', 'res-2': 'Crew B' };
const resourceName = (id: string): string => NAME_BY_ID[id] ?? 'Unknown resource';

describe('ResourceLoadingTable (shared, ADR-0049 §5)', () => {
  it('renders scope-ed column headers — one per resource, plus the Bucket-start column', () => {
    render(
      <ResourceLoadingTable
        buckets={BUCKETS}
        series={SERIES}
        granularity="WEEK"
        resourceName={resourceName}
      />,
    );
    const table = screen.getByRole('table');
    // The leading axis header + one per resource, all `scope="col"` (a real semantic table).
    expect(within(table).getByRole('columnheader', { name: 'Bucket start' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Crew A' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Crew B' })).toBeInTheDocument();
  });

  it('renders a scope-ed row header per bucket start', () => {
    render(
      <ResourceLoadingTable
        buckets={BUCKETS}
        series={SERIES}
        granularity="WEEK"
        resourceName={resourceName}
      />,
    );
    const table = screen.getByRole('table');
    expect(within(table).getByRole('rowheader', { name: '2026-01-05' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: '2026-01-12' })).toBeInTheDocument();
  });

  it('describes the table in a caption naming the granularity bucket', () => {
    render(
      <ResourceLoadingTable
        buckets={BUCKETS}
        series={SERIES}
        granularity="WEEK"
        resourceName={resourceName}
      />,
    );
    expect(screen.getByText(/Curve-shaped units per week bucket/)).toBeInTheDocument();
  });

  it('renders a Total footer row carrying each resource’s conserved sum', () => {
    render(
      <ResourceLoadingTable
        buckets={BUCKETS}
        series={SERIES}
        granularity="WEEK"
        resourceName={resourceName}
      />,
    );
    const table = screen.getByRole('table');
    // The footer's "Total" rowheader plus the per-resource totals (30 is unique; 10 also appears as a
    // res-1 bucket value, so assert it is present at least once).
    expect(within(table).getByRole('rowheader', { name: 'Total' })).toBeInTheDocument();
    expect(within(table).getByText('30')).toBeInTheDocument();
    expect(within(table).getAllByText('10').length).toBeGreaterThan(0);
  });

  it('associates an external caption via captionId when provided', () => {
    render(
      <ResourceLoadingTable
        buckets={BUCKETS}
        series={SERIES}
        granularity="WEEK"
        resourceName={resourceName}
        captionId="cap-1"
      />,
    );
    // The caption element carries the supplied id (used to label the enclosing region).
    expect(document.getElementById('cap-1')?.tagName).toBe('CAPTION');
  });
});

describe('BucketSizeSelect (shared)', () => {
  it('offers the three shipped granularity options and reports the picked value', () => {
    const onChange = vi.fn();
    render(<BucketSizeSelect id="bucket" value="WEEK" onChange={onChange} />);
    const select = screen.getByLabelText('Bucket size');
    expect(within(select).getByRole('option', { name: 'Day' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Week' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Month' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'MONTH' } });
    expect(onChange).toHaveBeenCalledWith('MONTH');
  });
});
