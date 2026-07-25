import type { CalendarSummary, PlanSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanCalendarPicker } from './PlanCalendarPicker';

import type * as ApiClient from '@/lib/api/client';
import { ApiFetchError, apiFetch } from '@/lib/api/client';

// Flag ON: tier-grouped options (ADR-0053 §1). The flag-OFF parity assertions — a flat option list,
// no groups — live in the sibling `PlanCalendarPicker.test.tsx` against the real config.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  LIBRARY_SCOPING_ENABLED: true,
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiFetch: vi.fn(),
}));

const PLAN: PlanSummary = {
  id: 'plan-1',
  projectId: 'proj-1',
  name: 'Baseline',
  description: null,
  status: 'DRAFT',
  schedulingMode: 'EARLY',
  progressRecalcMode: 'RETAINED_LOGIC',
  useExpectedFinishDates: false,
  criticalPathDefinition: 'TOTAL_FLOAT',
  criticalFloatThreshold: 0,
  totalFloatMode: 'FINISH',
  makeOpenEndsCritical: false,
  ignoreExternalRelationships: false,
  levelResources: false,
  levelWithinFloatOnly: false,
  eacMethod: 'CPI',
  currencyCode: null,
  plannedStart: '2026-01-01',
  calendarId: 'cal-org',
  version: 4,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function calendar(overrides: Partial<CalendarSummary> & { id: string }): CalendarSummary {
  return {
    name: overrides.id,
    description: null,
    workingWeekdays: 31,
    scope: 'ORG',
    projectId: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const ORG = calendar({ id: 'cal-org', name: 'Standard' });
const OWN = calendar({
  id: 'cal-own',
  name: 'Site shutdown',
  scope: 'PROJECT',
  projectId: 'proj-1',
});

function renderPicker(props: Partial<React.ComponentProps<typeof PlanCalendarPicker>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PlanCalendarPicker orgSlug="acme" plan={PLAN} calendars={[ORG, OWN]} canEdit {...props} />
    </QueryClientProvider>,
  );
}

/** The `<optgroup>` labels present in the picker, in DOM order. */
function groupLabels(): string[] {
  return Array.from(document.querySelectorAll('optgroup')).map(
    (group) => group.getAttribute('label') ?? '',
  );
}

describe('PlanCalendarPicker — tier grouping (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch)
      .mockReset()
      .mockResolvedValue({ ...PLAN, version: 5 });
  });

  it('groups the options by tier, organisation first', () => {
    renderPicker();

    expect(groupLabels()).toEqual(['Organisation calendars', 'This project’s calendars']);
    // Both tiers' calendars are selectable, and the group owns the option (announced with it).
    expect(screen.getByRole('option', { name: 'Standard' }).parentElement).toHaveAttribute(
      'label',
      'Organisation calendars',
    );
    expect(screen.getByRole('option', { name: 'Site shutdown' }).parentElement).toHaveAttribute(
      'label',
      'This project’s calendars',
    );
  });

  it('stays a flat list when the project has no calendars of its own', () => {
    renderPicker({ calendars: [ORG] });

    expect(groupLabels()).toEqual([]);
    expect(screen.getByRole('option', { name: 'Standard' })).toBeInTheDocument();
  });

  it('omits the empty organisation group rather than rendering a headed void', () => {
    renderPicker({ calendars: [OWN] });
    expect(groupLabels()).toEqual(['This project’s calendars']);
  });

  it('still renders the current value when it is absent from the list (never blank)', () => {
    renderPicker({ calendars: [OWN], calendarsLoading: true });
    const select = screen.getByLabelText('Calendar');

    expect(select).toHaveValue('cal-org');
    expect(screen.getByRole('option', { name: 'Loading…' })).toBeInTheDocument();
  });

  it('maps a 422 CALENDAR_WRONG_SCOPE to an actionable message', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(422, {
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Validation failed.',
        details: { reason: 'CALENDAR_WRONG_SCOPE' },
      }),
    );
    renderPicker();
    fireEvent.change(screen.getByLabelText('Calendar'), { target: { value: 'cal-own' } });

    expect(
      await screen.findByText(/belongs to another project and can’t be used here/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Pick an organisation calendar/)).toBeInTheDocument();
  });
});
