import type { CalendarSummary, PlanSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { PlanCalendarPicker } from './PlanCalendarPicker';

import type * as ApiClient from '@/lib/api/client';
import { ApiFetchError, apiFetch } from '@/lib/api/client';

// Flag ON: the combobox picker with tier-grouped options (ADR-0053 §1 + §4). The flag-OFF parity
// assertions — a native `<select>`, a flat option list, no groups — live in the sibling
// `PlanCalendarPicker.test.tsx` against the real config.
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
    archivedAt: null,
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

const field = (): HTMLElement => screen.getByRole('combobox', { name: 'Calendar' });
/** Open the popup exactly as a keyboard user does (APG: ↓ opens at the first option). */
const open = (): void => {
  fireEvent.keyDown(field(), { key: 'ArrowDown' });
};
/** The visible tier group headings, in DOM order (each `role="group"`'s associated label). */
function groupLabels(): string[] {
  return screen.queryAllByRole('group').map((group) => {
    const labelId = group.getAttribute('aria-labelledby') ?? '';
    return document.getElementById(labelId)?.textContent ?? '';
  });
}

describe('PlanCalendarPicker — combobox + tier grouping (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch)
      .mockReset()
      .mockResolvedValue({ ...PLAN, version: 5 });
  });

  it('is an APG combobox, not a native select', () => {
    renderPicker();
    expect(field()).toHaveAttribute('aria-autocomplete', 'list');
    expect(document.querySelector('select')).toBeNull();
  });

  it('groups the options by tier, organisation first', () => {
    renderPicker();
    open();

    // `role="group"` + an associated visible label is the APG successor of `<optgroup label>`.
    expect(groupLabels()).toEqual(['Organisation calendars', 'This project’s calendars']);
    const org = screen.getByRole('group', { name: 'Organisation calendars' });
    expect(within(org).getByRole('option', { name: 'Standard' })).toBeInTheDocument();
    const project = screen.getByRole('group', { name: 'This project’s calendars' });
    expect(within(project).getByRole('option', { name: 'Site shutdown' })).toBeInTheDocument();
  });

  it('stays a flat list when the project has no calendars of its own', () => {
    renderPicker({ calendars: [ORG] });
    open();

    expect(groupLabels()).toEqual([]);
    expect(screen.getByRole('option', { name: 'Standard' })).toBeInTheDocument();
  });

  it('omits the empty organisation group rather than rendering a headed void', () => {
    renderPicker({ calendars: [OWN] });
    open();
    expect(groupLabels()).toEqual(['This project’s calendars']);
  });

  it('still renders the current value when it is absent from the list (never blank)', () => {
    renderPicker({ calendars: [OWN], calendarsLoading: true });

    // The combobox falls back to its "Loading…" placeholder rather than showing an empty field,
    // which would read as "None".
    expect(field()).toHaveValue('Loading…');
  });

  it('renders the current value as selected even when a search filters it out', () => {
    renderPicker();
    fireEvent.change(field(), { target: { value: 'site' } });

    // Only "Site shutdown" matches, yet the selected "Standard" is still offered and marked.
    expect(screen.getByRole('option', { name: 'Standard' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('option', { name: 'Site shutdown' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'None (all days work)' })).toBeInTheDocument();
  });

  it('filters the offered calendars as the planner types', () => {
    renderPicker();
    fireEvent.change(field(), { target: { value: 'shut' } });

    // "Standard" survives only because it IS the current value; nothing else non-matching does.
    const options = screen
      .getAllByRole('option')
      .map((option) => option.getAttribute('aria-label'));
    expect(options).toContain('Site shutdown');
    expect(options).not.toContain('Winter');
  });

  it('shows a no-matches message rather than a blank popover', () => {
    renderPicker({ plan: { ...PLAN, calendarId: null } });
    fireEvent.change(field(), { target: { value: 'zzz' } });

    // "None" stays reachable (it is not a search result), but the popover says plainly that the
    // search matched nothing rather than looking like a one-item library.
    expect(screen.getByText('No calendars match your search.')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'None (all days work)' })).toBeInTheDocument();
  });

  it('selects with the keyboard and persists the choice', async () => {
    renderPicker();
    open();
    // ↓ opened at "None"; End jumps to the last option (the project calendar), Enter commits.
    fireEvent.keyDown(field(), { key: 'End' });
    fireEvent.keyDown(field(), { key: 'Enter' });

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenCalledWith(
      '/organizations/acme/plans/plan-1',
      expect.objectContaining({ method: 'PATCH' }),
    );
    const body = JSON.parse(vi.mocked(apiFetch).mock.calls[0]![1]?.body as string) as {
      calendarId: string;
    };
    expect(body.calendarId).toBe('cal-own');
  });

  it('keeps an archived current value selected, badged Archived', () => {
    const archived = calendar({
      id: 'cal-org',
      name: 'Standard',
      archivedAt: '2026-07-01T00:00:00Z',
    });
    renderPicker({ calendars: [archived, OWN] });

    // Closed, the field shows the selection itself — never a blank or "Unavailable".
    expect(field()).toHaveValue('Standard');
    open();
    // The badge rides in the accessible name, so the state is announced, not merely drawn.
    expect(screen.getByRole('option', { name: 'Standard, Archived' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('never offers an archived calendar that is not the current value', () => {
    const retired = calendar({
      id: 'cal-retired',
      name: 'Winter shutdown',
      archivedAt: '2026-07-01T00:00:00Z',
    });
    renderPicker({ calendars: [ORG, retired] });
    open();

    expect(screen.queryByRole('option', { name: /Winter shutdown/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Standard' })).toBeInTheDocument();
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
    open();
    fireEvent.keyDown(field(), { key: 'End' });
    fireEvent.keyDown(field(), { key: 'Enter' });

    expect(
      await screen.findByText(/belongs to another project and can’t be used here/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Pick an organisation calendar/)).toBeInTheDocument();
  });

  it('maps a 422 CALENDAR_ARCHIVED to an actionable message', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(422, {
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Validation failed.',
        details: { reason: 'CALENDAR_ARCHIVED' },
      }),
    );
    renderPicker();
    open();
    fireEvent.keyDown(field(), { key: 'End' });
    fireEvent.keyDown(field(), { key: 'Enter' });

    expect(await screen.findByText(/This calendar is archived/)).toBeInTheDocument();
    expect(screen.getByText(/still schedules the same/)).toBeInTheDocument();
  });

  it('has no axe violations, closed or open', async () => {
    const { container } = renderPicker();
    expect((await axe(container)).violations).toEqual([]);
    open();
    expect((await axe(container)).violations).toEqual([]);
  });
});
