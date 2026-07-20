import type { ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResourceStripPanel } from './resource-strip-panel';

import { resourceKeys } from '@/features/resources';
import { apiFetchEnvelope } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn(), apiFetchEnvelope: vi.fn() }));

const CREW_A: ResourceSummary = {
  id: 'res-1',
  name: 'Crew A',
  code: null,
  description: null,
  kind: 'LABOUR',
  maxUnitsPerHour: null,
  costPerUnit: null,
  calendarId: null,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};
const CREW_B: ResourceSummary = { ...CREW_A, id: 'res-2', name: 'Crew B' };

const HISTOGRAM = {
  data: [
    { resourceId: 'res-1', values: [10, 20, 12], total: 42 },
    { resourceId: 'res-2', values: [5, 5, 5], total: 15 },
  ],
  meta: {
    granularity: 'WEEK' as const,
    buckets: [
      { start: '2026-01-05', end: '2026-01-12' },
      { start: '2026-01-12', end: '2026-01-19' },
      { start: '2026-01-19', end: '2026-01-26' },
    ],
    curveNormalisedCount: 0,
  },
};

function renderPanel(props: Partial<Parameters<typeof ResourceStripPanel>[0]> = {}) {
  const onSnapshot = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(resourceKeys.list('acme'), [CREW_A, CREW_B]);
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ResourceStripPanel
        orgSlug="acme"
        planId="plan-1"
        dataDate="2026-01-01"
        onSnapshot={onSnapshot}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onSnapshot };
}

describe('ResourceStripPanel (Stage E, ADR-0049)', () => {
  beforeEach(() => {
    vi.mocked(apiFetchEnvelope).mockReset().mockResolvedValue(HISTOGRAM);
  });

  it('is a distinctly-labelled "Resource loading" landmark (not "Activities panel")', async () => {
    renderPanel();
    const region = await screen.findByRole('region', { name: 'Resource loading' });
    expect(region).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Activities panel' })).toBeNull();
  });

  it('renders the reused accessible data table for the selected resource (WCAG 2.2 AA equivalent)', async () => {
    renderPanel();
    const table = await screen.findByRole('table');
    // The most-loaded resource (Crew A, total 42) is the default column; every bucket start is a row header.
    expect(within(table).getByRole('columnheader', { name: 'Crew A' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: '2026-01-05' })).toBeInTheDocument();
    expect(within(table).getByText('20')).toBeInTheDocument();
  });

  it('publishes the strip snapshot for the most-loaded resource, with the bucket axis pre-projected', async () => {
    const { onSnapshot } = renderPanel();
    await waitFor(() =>
      expect(onSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          series: expect.objectContaining({ resourceId: 'res-1' }),
          dataDate: '2026-01-01',
          max: 20, // whole-series peak of [10, 20, 12]
          // buckets projected to signed day offsets about the data date (2026-01-05 = day 4, end day 11).
          dayOffsets: expect.arrayContaining([{ start: 4, end: 11 }]),
        }),
      ),
    );
  });

  it('switches the published series when the resource picker changes (a strip-only data change)', async () => {
    const { onSnapshot } = renderPanel();
    await screen.findByRole('table');
    onSnapshot.mockClear();
    fireEvent.change(screen.getByLabelText('Resource'), { target: { value: 'res-2' } });
    await waitFor(() =>
      expect(onSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ series: expect.objectContaining({ resourceId: 'res-2' }) }),
      ),
    );
  });

  it('reuses the bucket-size Select (Day / Week / Month) and refetches on change', async () => {
    renderPanel();
    const bucket = await screen.findByLabelText('Bucket size');
    // The three shipped HISTOGRAM_GRANULARITIES, human-labelled.
    expect(within(bucket).getByRole('option', { name: 'Day' })).toBeInTheDocument();
    expect(within(bucket).getByRole('option', { name: 'Week' })).toBeInTheDocument();
    expect(within(bucket).getByRole('option', { name: 'Month' })).toBeInTheDocument();
    fireEvent.change(bucket, { target: { value: 'DAY' } });
    await waitFor(() => {
      const paths = vi.mocked(apiFetchEnvelope).mock.calls.map(([path]) => String(path));
      expect(paths.some((path) => path.includes('granularity=DAY'))).toBe(true);
    });
  });

  it('shows the shipped empty state (and publishes null) when no resource is loaded', async () => {
    vi.mocked(apiFetchEnvelope).mockResolvedValue({
      data: [],
      meta: { granularity: 'WEEK', buckets: [], curveNormalisedCount: 0 },
    });
    const { onSnapshot } = renderPanel();
    expect(await screen.findByText(/No resource loading to show yet/)).toBeInTheDocument();
    await waitFor(() => expect(onSnapshot).toHaveBeenLastCalledWith(null));
  });

  it('shows the shipped loading copy while the histogram is pending', () => {
    vi.mocked(apiFetchEnvelope)
      .mockReset()
      .mockReturnValue(new Promise(() => {}));
    renderPanel();
    expect(screen.getByText('Loading histogram…')).toBeInTheDocument();
  });

  it('shows the shipped retryable error copy on failure', async () => {
    vi.mocked(apiFetchEnvelope).mockReset().mockRejectedValueOnce(new Error('boom'));
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Couldn’t load the resource histogram/,
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('moves focus into the panel on reveal (mirrors ActivityBottomPanel)', async () => {
    renderPanel({ focusOnMount: true });
    const region = await screen.findByRole('region', { name: 'Resource loading' });
    await waitFor(() => expect(region).toHaveFocus());
  });
});
