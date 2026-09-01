import type { ActivitySummary, CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * `docs/TECH_DEBT.md` #66 — **the fields answer to the same gate as the Save.**
 *
 * `ScopeSaveBar` implemented shade-with-a-reason correctly and the fields above it did not, so a
 * member who could not add a link could fill in the whole form and meet the refusal at the end of
 * it. The remedy is ADR-0083's, already decided and already built as `FieldGateProvider` — this
 * form just never used it.
 *
 * **Read-only, never native `disabled`** (ADR-0083 D1): a shut field keeps its caret, its selection
 * and its value in a reader's reach. Native `disabled` here would be #64's defect reintroduced.
 * The one exception ADR-0083 names is the `<select>`, which has no read-only state at all.
 */
vi.mock('../api/use-dependencies', () => ({
  useCreateDependency: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

const { AddLinkSection } = await import('./AddLinkSection');

const CAL = { id: 'cal-8', name: 'Site week', hoursPerDay: 8 } as CalendarSummary;
const anchor = { id: 'a1', name: 'Pour slab', calendarId: null } as ActivitySummary;
const other = { id: 'a2', name: 'Strike formwork', calendarId: null } as ActivitySummary;

const REASON = 'Start editing this plan to add links.';

function renderSection(gate: { writable: boolean; reason: string | null }): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AddLinkSection
        orgSlug="acme"
        planId="pl1"
        anchor={anchor}
        options={[other]}
        calendars={[CAL]}
        planCalendarId="cal-8"
        gate={gate}
      />
    </QueryClientProvider>,
  );
}

describe('AddLinkSection field gating (#66)', () => {
  it('shades the lag field read-only, with the reason, when the member cannot add a link', () => {
    renderSection({ writable: false, reason: REASON });

    const lag = screen.getByLabelText(/^Lag \(/);
    expect(lag).toHaveAttribute('readonly');
    // Not `disabled` — the value must stay readable and selectable (ADR-0083, #64).
    expect(lag).not.toBeDisabled();

    // The reason is rendered ONCE, above the fields, and pointed at rather than repeated.
    expect(screen.getAllByText(REASON)).toHaveLength(1);
    const describedBy = lag.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(
      describedBy!
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent)
        .join(' '),
    ).toContain(REASON);
  });

  it('leaves every field open for a member who can add a link', () => {
    renderSection({ writable: true, reason: null });
    const lag = screen.getByLabelText(/^Lag \(/);
    expect(lag).not.toHaveAttribute('readonly');
    expect(screen.queryByText(REASON)).not.toBeInTheDocument();
  });
});
