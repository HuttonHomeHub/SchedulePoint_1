import type { ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resourceKeys } from '../api/use-resources';

import { ResourceHistogram } from './ResourceHistogram';

import { apiFetchEnvelope } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn(), apiFetchEnvelope: vi.fn() }));

const CREW: ResourceSummary = {
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

function renderHistogram() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(resourceKeys.list('acme'), [CREW]);
  return render(
    <QueryClientProvider client={queryClient}>
      <ResourceHistogram orgSlug="acme" planId="plan-1" />
    </QueryClientProvider>,
  );
}

describe('ResourceHistogram (ADR-0044 §3 / ADR-0035 §31)', () => {
  beforeEach(() => {
    vi.mocked(apiFetchEnvelope)
      .mockReset()
      .mockResolvedValue({
        data: [{ resourceId: 'res-1', values: [10, 20, 12], total: 42 }],
        meta: {
          granularity: 'WEEK',
          buckets: [
            { start: '2026-01-05', end: '2026-01-12' },
            { start: '2026-01-12', end: '2026-01-19' },
            { start: '2026-01-19', end: '2026-01-26' },
          ],
          curveNormalisedCount: 0,
        },
      });
  });

  it('renders a keyboard-navigable data table equivalent (WCAG 2.2 AA) with the resource units', async () => {
    renderHistogram();
    const table = await screen.findByRole('table');
    // The resource name is a column header; every bucket start is a row header — a real semantic table.
    expect(within(table).getByRole('columnheader', { name: 'Crew A' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Total' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: '2026-01-05' })).toBeInTheDocument();
    // **Scoped to a row, not to the table.** This asserted `getByText('20')` until the stacked
    // histogram added a per-bucket Total column, at which point 20 appeared twice — the resource's
    // cell and that bucket's total, which are equal because this fixture has one resource. A bare
    // text query over a table is ambiguous the moment a column arrives; the row is the real subject.
    const firstBucket = within(table).getByRole('row', { name: /2026-01-05/ });
    expect(
      within(firstBucket)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['10', '10']);
    // The total foot row carries the conserved sum.
    expect(within(table).getAllByText('42').length).toBeGreaterThan(0);
  });

  it('queries the endpoint with the selected granularity', async () => {
    renderHistogram();
    await waitFor(() => expect(apiFetchEnvelope).toHaveBeenCalled());
    const [path] = vi.mocked(apiFetchEnvelope).mock.calls[0]!;
    expect(path).toContain('/plans/plan-1/schedule/resource-histogram');
    expect(path).toContain('granularity=WEEK');
  });

  it('surfaces the N29 normalise notice when curveNormalisedCount > 0', async () => {
    vi.mocked(apiFetchEnvelope).mockResolvedValue({
      data: [{ resourceId: 'res-1', values: [21, 21], total: 42 }],
      meta: {
        granularity: 'WEEK',
        buckets: [
          { start: '2026-01-05', end: '2026-01-12' },
          { start: '2026-01-12', end: '2026-01-19' },
        ],
        curveNormalisedCount: 1,
      },
    });
    renderHistogram();
    expect(await screen.findByText(/didn’t sum to 100%/)).toBeInTheDocument();
  });

  it('says how much of the plan it is showing when the histogram is truncated', async () => {
    // `use-resources.ts` raised the page limit 50 -> 200 and started surfacing `hasMore`/`total`
    // rather than truncating in silence. That branch had no test: a reader would have been told
    // nothing about the resources missing from the totals in front of them.
    vi.mocked(apiFetchEnvelope).mockResolvedValue({
      data: [
        { resourceId: 'res-1', values: [21, 21], total: 42 },
        { resourceId: 'res-2', values: [5, 5], total: 10 },
      ],
      meta: {
        granularity: 'WEEK',
        buckets: [
          { start: '2026-01-05', end: '2026-01-12' },
          { start: '2026-01-12', end: '2026-01-19' },
        ],
        curveNormalisedCount: 0,
        hasMore: true,
        total: 247,
      },
    });
    renderHistogram();
    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain('Showing 2 of 247 resources');
    // …and it says what that costs the numbers, not merely that something is missing.
    expect(notice.textContent).toContain('rather than of the whole plan');
  });

  it('shows an empty state when no resource is loaded', async () => {
    vi.mocked(apiFetchEnvelope).mockResolvedValue({
      data: [],
      meta: { granularity: 'WEEK', buckets: [], curveNormalisedCount: 0 },
    });
    renderHistogram();
    expect(await screen.findByText(/No resource loading to show yet/)).toBeInTheDocument();
  });

  it('shows a loading state while the histogram is pending', () => {
    // A never-resolving fetch keeps the query pending.
    vi.mocked(apiFetchEnvelope)
      .mockReset()
      .mockReturnValue(new Promise(() => {}));
    renderHistogram();
    expect(screen.getByText('Loading histogram…')).toBeInTheDocument();
  });

  it('shows a retryable error state and recovers on Try again', async () => {
    vi.mocked(apiFetchEnvelope).mockReset().mockRejectedValueOnce(new Error('boom'));
    renderHistogram();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Couldn’t load the resource histogram/,
    );
    // The next attempt succeeds → clicking Try again refetches and resolves to the empty state.
    vi.mocked(apiFetchEnvelope).mockResolvedValue({
      data: [],
      meta: { granularity: 'WEEK', buckets: [], curveNormalisedCount: 0 },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/No resource loading to show yet/)).toBeInTheDocument();
  });

  it('refetches the endpoint when the bucket size changes', async () => {
    renderHistogram();
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Bucket size'), { target: { value: 'DAY' } });
    await waitFor(() => {
      const paths = vi.mocked(apiFetchEnvelope).mock.calls.map(([path]) => String(path));
      expect(paths.some((path) => path.includes('granularity=DAY'))).toBe(true);
    });
  });
});

/**
 * **The `Stack by` modes reach the chart from the dialog** — the entry-point half (ADR-0081).
 *
 * `StackByControl.test.tsx` proves the picker offers three modes and `stack-series.test.ts` proves
 * each partition is correct; neither can say the dialog wires the choice to the derivation. `Kind`
 * shipped in the approved spec and plan and was never built (`docs/TECH_DEBT.md` #228 item 4), so
 * this is exactly the seam that had nothing watching it.
 */
describe('ResourceHistogram — stacking modes', () => {
  const CHIPPY: ResourceSummary = { ...CREW, id: 'res-1', name: 'Chippies', kind: 'LABOUR' };
  const CRANE: ResourceSummary = { ...CREW, id: 'res-2', name: 'Tower crane', kind: 'EQUIPMENT' };

  function renderTwoKinds() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(resourceKeys.list('acme'), [CHIPPY, CRANE]);
    return render(
      <QueryClientProvider client={queryClient}>
        <ResourceHistogram orgSlug="acme" planId="plan-1" />
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    vi.mocked(apiFetchEnvelope)
      .mockReset()
      .mockResolvedValue({
        data: [
          { resourceId: 'res-1', values: [10, 20], total: 30 },
          { resourceId: 'res-2', values: [4, 6], total: 10 },
        ],
        meta: {
          granularity: 'WEEK',
          buckets: [
            { start: '2026-01-05', end: '2026-01-12' },
            { start: '2026-01-12', end: '2026-01-19' },
          ],
          curveNormalisedCount: 0,
        },
      });
  });

  it('re-bands the chart legend by kind when Kind is chosen', async () => {
    renderTwoKinds();
    const legend = await screen.findByRole('list', { name: 'Legend' });
    expect(within(legend).getByText('Chippies')).toBeInTheDocument();
    expect(within(legend).getByText('Tower crane')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Stack by' }), {
      target: { value: 'kind' },
    });

    await waitFor(() => {
      expect(within(legend).getByText('Labour')).toBeInTheDocument();
    });
    expect(within(legend).getByText('Equipment')).toBeInTheDocument();
    expect(within(legend).queryByText('Chippies')).not.toBeInTheDocument();
  });

  it('leaves the data table per-resource in every mode, which is deliberate', async () => {
    // **Written after the first version of the test above asserted the opposite and failed.**
    // The table is the chart's accessible equivalent and it never aggregates
    // (`stack-series.ts`: "the table, which never aggregates, still carries it"), so it carries
    // MORE than the chart and never less. Stacking is a display lens over the same numbers; a
    // table that followed it would take the per-resource figures away from the one representation
    // a screen-reader user has. Asserted so nobody "fixes" the asymmetry into a regression.
    renderTwoKinds();
    const table = await screen.findByRole('table');
    const before = within(table).getByRole('row', { name: /2026-01-05/ }).textContent;

    fireEvent.change(screen.getByRole('combobox', { name: 'Stack by' }), {
      target: { value: 'kind' },
    });

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Stack by' })).toHaveValue('kind');
    });
    expect(within(table).getByRole('columnheader', { name: 'Chippies' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Tower crane' })).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /2026-01-05/ }).textContent).toBe(before);
  });
});
