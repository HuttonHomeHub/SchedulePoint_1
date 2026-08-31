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
  parentId: null,
  maxUnitsPerHour: null,
  costPerUnit: null,
  calendarId: null,
  archivedAt: null,
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

  /**
   * **The stacked default must not delete the text equivalent.**
   *
   * The table renders inside `{selectedSeries ? … : null}` and `selectedSeries` resolves BY
   * resourceId. The moment the picker's default becomes an "all resources" sentinel, that
   * expression is `null` — so the stacked strip would ship with NO accessible table at all, beside
   * a disclosure reading "Show data table for Unknown resource" (the `resourceName` fallback).
   *
   * A WCAG 2.2 AA regression the feature CAUSES, found by the architecture and accessibility
   * reviews independently. No unit suite would have caught it, because none mounts this panel in
   * the state the feature makes the default.
   */
  it('keeps the accessible table in the stacked default, over EVERY resource', async () => {
    renderPanel();
    const table = await screen.findByRole('table');
    // Both fixture resources are columns — the stacked view's table is the whole record.
    expect(within(table).getByRole('columnheader', { name: 'Crew A' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Crew B' })).toBeInTheDocument();
  });

  it('names the disclosure honestly in the stacked default', async () => {
    renderPanel();
    await screen.findByRole('table');
    // Never "Show data table for Unknown resource" — the sentinel is not a resource, and the
    // fallback would announce a name that does not exist.
    expect(screen.getByText(/^Show data table$/)).toBeInTheDocument();
    expect(screen.queryByText(/Unknown resource/)).toBeNull();
  });

  it('renders the reused accessible data table for the ISOLATED resource (WCAG 2.2 AA equivalent)', async () => {
    renderPanel();
    await screen.findByRole('table');
    // Isolation is now a choice rather than the starting position — the stacked view is the
    // default, and picking one resource narrows to it. The table still narrows with the picker.
    fireEvent.change(screen.getByLabelText('Resource'), { target: { value: 'res-1' } });
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Crew A' })).toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: 'Crew B' })).toBeNull();
    expect(within(table).getByRole('rowheader', { name: '2026-01-05' })).toBeInTheDocument();
    // **Scoped to a row.** This asserted `getByText('20')` over the whole table until the shared
    // `ResourceLoadingTable` gained a per-bucket Total column, at which point a value and its
    // bucket total were both `20` and the query became ambiguous. The row is the real subject —
    // and asserting the whole row also pins that the Total column sits where it is meant to.
    const secondBucket = within(table).getByRole('row', { name: /2026-01-12/ });
    expect(
      within(secondBucket)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['20', '20']);
  });

  it('publishes a STACKED snapshot by default, scaled to the peak stacked total', async () => {
    const { onSnapshot } = renderPanel();
    await waitFor(() =>
      expect(onSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          // Both fixture resources, in rank order — one band each.
          segments: [
            expect.objectContaining({ values: [10, 20, 12] }),
            expect.objectContaining({ values: [5, 5, 5] }),
          ],
          dataDate: '2026-01-01',
          // **The peak STACKED total (20 + 5), not the tallest single series (20).** Scaling to the
          // latter would let the tallest bucket overflow the band — the amendment a stack forces on
          // ADR-0049 §6's whole-series max.
          max: 25,
          // buckets projected to signed day offsets about the data date (2026-01-05 = day 4, end day 11).
          dayOffsets: expect.arrayContaining([{ start: 4, end: 11 }]),
        }),
      ),
    );
  });

  it('isolating a resource publishes a ONE-SEGMENT stack at that resource’s own scale', async () => {
    // The promise that isolation stays byte-for-byte what it was: one band, its own whole-series
    // peak, painted with the single-bar fill — not a different code path in the painter.
    const { onSnapshot } = renderPanel();
    await screen.findByRole('table');
    onSnapshot.mockClear();
    fireEvent.change(screen.getByLabelText('Resource'), { target: { value: 'res-1' } });
    await waitFor(() =>
      expect(onSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          segments: [expect.objectContaining({ values: [10, 20, 12] })],
          max: 20,
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
        expect.objectContaining({ segments: [expect.objectContaining({ values: [5, 5, 5] })] }),
      ),
    );
  });

  it('returns to the stack when the picker goes back to All resources', async () => {
    // The route back matters as much as the route in: a picker that can isolate but not un-isolate
    // is a one-way door, and this one is the DEFAULT view it would strand the reader away from.
    const { onSnapshot } = renderPanel();
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Resource'), { target: { value: 'res-2' } });
    await waitFor(() => expect(onSnapshot).toHaveBeenCalled());
    onSnapshot.mockClear();
    fireEvent.change(screen.getByLabelText('Resource'), { target: { value: '__all__' } });
    await waitFor(() =>
      expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({ max: 25 })),
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
