import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CrashReportRow } from '@/features/staff/api/staff-crash-reports';
import { CrashReportsPanel } from '@/features/staff/ui/crash-reports-panel';

const apiFetchEnvelope = vi.fn<(path: string) => Promise<unknown>>();
vi.mock('@/lib/api/client', () => ({
  apiFetchEnvelope: (path: string) => apiFetchEnvelope(path),
}));

const crash = (overrides: Partial<CrashReportRow> = {}): CrashReportRow => ({
  id: 'c1',
  reference: 'ABCDEF',
  boundary: 'route',
  errorName: 'TypeError',
  message: "Cannot read properties of null (reading 'startAt')",
  routePattern: '/_authed/orgs/$orgSlug/plans/$planId',
  webVersion: '0.200.7',
  browser: 'chrome',
  browserMajor: 131,
  stack: 'at Plan (/assets/plan-abc)',
  componentStack: 'at PlanScreen',
  count: 4,
  firstSeenAt: '2026-11-01T10:00:00.000Z',
  lastSeenAt: '2026-11-01T11:00:00.000Z',
  ...overrides,
});

const answer = (
  rows: CrashReportRow[],
  meta: Partial<{ total: number; capReached: boolean; seenLast7Days: number }> = {},
) =>
  Promise.resolve({
    data: rows,
    meta: { total: rows.length, cap: 1000, capReached: false, seenLast7Days: rows.length, ...meta },
  });

function mount(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CrashReportsPanel />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiFetchEnvelope.mockReset();
});

describe('CrashReportsPanel', () => {
  it('draws the settled shape while the read is held, with no status of its own', async () => {
    apiFetchEnvelope.mockReturnValue(new Promise(() => undefined));
    mount();

    const region = await screen.findByRole('region', { name: 'Screen crashes' });
    expect(within(region).getByText('Loading screen crashes…')).toBeInTheDocument();
  });

  it('says the read failed, and offers a retry, rather than showing an empty list', async () => {
    apiFetchEnvelope.mockRejectedValue(new Error('boom'));
    mount();

    expect(await screen.findByText("Couldn't load screen crashes.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again|retry/i })).toBeInTheDocument();
    expect(screen.queryByText('No crashes received.')).toBeNull();
  });

  /**
   * "Nothing arrived" is not "nothing happened": signed-out screens are not reported. Verified red
   * against copy that said "No crashes", which is a claim about the product and not about the list.
   */
  it('says an empty list means nothing arrived, not that nothing happened', async () => {
    apiFetchEnvelope.mockReturnValue(answer([]));
    mount();

    expect(await screen.findByText('No crashes received.')).toBeInTheDocument();
    const caveat = screen.getByText(/means nothing arrived, not that nothing happened/);
    // The empty state is the region the caveat describes, so a reader landing in it hears it.
    expect(screen.getByText('No crashes received.').closest('[aria-describedby]')).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining(caveat.id),
    );
    expect(screen.queryByText('Not recording new kinds of crash.')).toBeNull();
  });

  it('shows a row with its reference, screen, release, browser, count and times', async () => {
    apiFetchEnvelope.mockReturnValue(answer([crash()]));
    mount();

    const table = await screen.findByRole('table');
    expect(within(table).getByText('TypeError')).toBeInTheDocument();
    expect(within(table).getByText(/Cannot read properties of null/)).toBeInTheDocument();
    expect(within(table).getByText('/_authed/orgs/$orgSlug/plans/$planId')).toBeInTheDocument();
    expect(within(table).getByText('Release 0.200.7, Chrome 131')).toBeInTheDocument();
    expect(within(table).getByText('ABCDEF')).toBeInTheDocument();
    expect(within(table).getByText('4')).toBeInTheDocument();
  });

  it('keeps the stack behind a disclosure named for its row, and renders it as text', async () => {
    apiFetchEnvelope.mockReturnValue(
      answer([crash({ stack: 'at <img src=x onerror=alert(1)> @ /assets/a' })]),
    );
    mount();

    const button = await screen.findByRole('button', { name: 'Stack for TypeError, ABCDEF' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/onerror/)).toBeNull();

    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    const stack = screen.getByText(/onerror/);
    expect(stack.tagName).toBe('PRE');
    // Text, never markup: the string is shown, and no element was made from it.
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('at PlanScreen')).toBeInTheDocument();
  });

  it('says so when a crash carried no stack at all', async () => {
    apiFetchEnvelope.mockReturnValue(answer([crash({ stack: null, componentStack: null })]));
    mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Stack for TypeError, ABCDEF' }));

    expect(screen.getByText('No stack was reported.')).toBeInTheDocument();
  });

  it('shows a crash that was on no screen without inventing one', async () => {
    apiFetchEnvelope.mockReturnValue(answer([crash({ routePattern: null })]));
    mount();

    expect(await screen.findByText('No screen')).toBeInTheDocument();
  });

  /**
   * The session decision: a full table must not read as a quiet one. Verified red against a panel
   * that did not read `capReached`, which showed 1,000 steady rows and no sentence.
   */
  it('says new kinds of crash are not being recorded when the cap is reached', async () => {
    apiFetchEnvelope.mockReturnValue(answer([crash()], { total: 1000, capReached: true }));
    mount();

    const strip = await screen.findByText(/Not recording new kinds of crash\./);
    expect(strip).toHaveTextContent(
      'The list holds 1,000 different crashes, which is as many as it keeps. A new kind of crash is not being recorded until older ones are cleared out automatically. Crashes already listed are still counted.',
    );
    expect(
      screen.getByRole('table').closest('[aria-describedby]')?.getAttribute('aria-describedby'),
    ).toContain('staff-crashes-cap');
    // And the count of what is shown against what is held, so 50 rows are not mistaken for all.
    expect(screen.getByText('Showing the 1 most recent of 1,000.')).toBeInTheDocument();
  });

  it('says how many of the held crashes the 50 rows are', async () => {
    const rows = Array.from({ length: 50 }, (_, n) =>
      crash({ id: `c${String(n)}`, reference: `R${String(n)}` }),
    );
    apiFetchEnvelope.mockReturnValue(answer(rows, { total: 73 }));
    mount();

    expect(await screen.findByText('Showing the 50 most recent of 73.')).toBeInTheDocument();
  });

  it('opens a stack as a full-width row under its crash, by keyboard, and closes it again', async () => {
    apiFetchEnvelope.mockReturnValue(answer([crash()]));
    mount();

    const button = await screen.findByRole('button', { name: 'Stack for TypeError, ABCDEF' });
    button.focus();
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button);

    const detail = document.getElementById(button.getAttribute('aria-controls') ?? 'none');
    expect(detail).not.toBeNull();
    expect(detail?.closest('td')).toHaveAttribute('colspan');
    expect(within(detail as HTMLElement).getByText(/plan-abc/).className).toContain(
      'text-foreground',
    );

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/plan-abc/)).toBeNull();
  });

  it('does not say it when the cap is not reached', async () => {
    apiFetchEnvelope.mockReturnValue(answer([crash()], { total: 999 }));
    mount();

    await screen.findByRole('table');
    expect(screen.queryByText(/Not recording new kinds of crash/)).toBeNull();
  });
});
