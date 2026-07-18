import type { EarnedValueMetrics, PlanEarnedValue } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EarnedValuePanel } from './EarnedValuePanel';

import { ApiFetchError, apiFetch } from '@/lib/api/client';

/**
 * The Earned-Value analysis panel (EV4b / ADR-0042): renders the plan-total KPI tiles + the
 * per-activity table from the mocked `GET …/schedule/earned-value` read, flags a behind-schedule /
 * over-budget index with a word (not colour alone), and shows the friendly "restricted" state on a
 * 403 (a non-cost-reader) rather than a generic error. Keeps `ApiFetchError` real so the 403 branch
 * (an `instanceof` check) fires.
 */
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: vi.fn(),
}));

function metrics(over: Partial<EarnedValueMetrics> = {}): EarnedValueMetrics {
  return {
    bac: 0,
    pv: 0,
    ev: 0,
    ac: 0,
    sv: 0,
    cv: 0,
    spi: null,
    cpi: null,
    eac: 0,
    etc: 0,
    tcpi: null,
    vac: 0,
    ...over,
  };
}

const EV: PlanEarnedValue = {
  dataDate: '2026-01-01',
  eacMethod: 'CPI',
  currencyCode: 'USD',
  costBaselineMissing: false,
  costWarningCount: 0,
  total: metrics({
    bac: 1000000,
    ev: 800000,
    ac: 666667,
    sv: -200000,
    cv: 133333,
    spi: 0.8,
    cpi: 1.2,
    eac: 833333,
    vac: 166667,
  }),
  activities: [
    {
      activityId: 'a1',
      performancePercent: 80,
      ...metrics({
        bac: 1000000,
        pv: 1000000,
        ev: 800000,
        ac: 666667,
        sv: -200000,
        cv: 133333,
        spi: 0.8,
        cpi: 1.2,
        eac: 833333,
      }),
    },
  ],
};

function renderPanel() {
  // `retryDelay: 0` so the hook's non-403 retries (a transient 500) settle instantly in the test; the
  // hook's own `retry` predicate still governs whether it retries (never on a 403).
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EarnedValuePanel
        orgSlug="acme"
        planId="pl1"
        activities={[{ id: 'a1', name: 'Excavate', code: 'A100' }]}
      />
    </QueryClientProvider>,
  );
}

describe('EarnedValuePanel', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('renders the KPI tiles and the per-activity table from the read', async () => {
    vi.mocked(apiFetch).mockResolvedValue(EV);
    renderPanel();

    // KPI money via formatMoney (USD, narrowSymbol) — EAC = 833333 minor = $8,333.33 (KPI tile + row).
    expect(await screen.findAllByText('$8,333.33')).not.toHaveLength(0);
    // BAC = 1,000,000 minor = $10,000.00.
    expect(screen.getAllByText('$10,000.00').length).toBeGreaterThan(0);
    // Ratios to two decimals.
    expect(screen.getAllByText('0.80').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1.20').length).toBeGreaterThan(0);
    // The row resolves its display name from the composed activities list.
    expect(screen.getByText('A100 · Excavate')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('flags a behind-schedule index with a word, not colour alone (WCAG 1.4.1)', async () => {
    vi.mocked(apiFetch).mockResolvedValue(EV);
    renderPanel();
    // SPI 0.8 < 1 → "Behind"; CPI 1.2 ≥ 1 → no "Over".
    expect(await screen.findAllByText('Behind')).not.toHaveLength(0);
    expect(screen.queryByText('Over')).not.toBeInTheDocument();
  });

  it('shows the restricted state on a 403 (non-cost-reader), not a generic error', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(403, { code: 'FORBIDDEN', message: 'Forbidden' }),
    );
    renderPanel();
    expect(await screen.findByText('Cost & earned value is restricted')).toBeInTheDocument();
    expect(
      screen.queryByText('Couldn’t load earned value. Please try again.'),
    ).not.toBeInTheDocument();
  });

  it('shows a retryable error for any other failure', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(500, { code: 'INTERNAL', message: 'Boom' }),
    );
    renderPanel();
    expect(
      await screen.findByText('Couldn’t load earned value. Please try again.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
