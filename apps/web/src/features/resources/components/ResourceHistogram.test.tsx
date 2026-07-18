import type { ResourceSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
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
  maxUnitsPerHour: null,
  costPerUnit: null,
  calendarId: null,
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
    expect(within(table).getByRole('rowheader', { name: '2026-01-05' })).toBeInTheDocument();
    // The bucket values are present as cells.
    expect(within(table).getByText('20')).toBeInTheDocument();
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

  it('shows an empty state when no resource is loaded', async () => {
    vi.mocked(apiFetchEnvelope).mockResolvedValue({
      data: [],
      meta: { granularity: 'WEEK', buckets: [], curveNormalisedCount: 0 },
    });
    renderHistogram();
    expect(await screen.findByText(/No resource loading to show yet/)).toBeInTheDocument();
  });
});
