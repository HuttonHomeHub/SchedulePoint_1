import type { PlanSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanCriticalFloatThresholdField } from './PlanCriticalFloatThresholdField';

import type * as AnnouncerModule from '@/components/ui/announcer';
import { useAnnounce } from '@/components/ui/announcer';
import { apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const { announceSpy } = vi.hoisted(() => ({ announceSpy: vi.fn() }));
vi.mock('@/components/ui/announcer', async (importOriginal) => {
  const actual = await importOriginal<typeof AnnouncerModule>();
  return { ...actual, useAnnounce: vi.fn(() => announceSpy) };
});

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
  criticalFloatThresholdMinutes: 0,
  totalFloatMode: 'FINISH',
  makeOpenEndsCritical: false,
  ignoreExternalRelationships: false,
  levelResources: false,
  levelWithinFloatOnly: false,
  eacMethod: 'CPI',
  currencyCode: null,
  plannedStart: '2026-01-01',
  calendarId: 'cal-standard',
  version: 4,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

/** An eight-hour working day: the whole point of F8 is that this is not 1440. */
const EIGHT_HOUR_DAY = 8;

function renderField(
  props: Partial<React.ComponentProps<typeof PlanCriticalFloatThresholdField>> = {},
) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <PlanCriticalFloatThresholdField
        orgSlug="acme"
        plan={PLAN}
        hoursPerDay={EIGHT_HOUR_DAY}
        canEdit
        {...props}
      />
    </QueryClientProvider>,
  );
}

function field(): HTMLElement {
  return screen.getByLabelText('Critical float threshold');
}

describe('PlanCriticalFloatThresholdField', () => {
  beforeEach(() => {
    announceSpy.mockReset();
    vi.mocked(useAnnounce).mockReturnValue(announceSpy);
    vi.mocked(apiFetch)
      .mockReset()
      .mockResolvedValue({ ...PLAN, criticalFloatThresholdMinutes: 2400, version: 5 });
  });

  it('renders the stored minutes in the plan calendar’s days', () => {
    // 2,400 working minutes on an eight-hour day is five days — 1,440 would make it under two.
    renderField({ plan: { ...PLAN, criticalFloatThresholdMinutes: 2400 } });
    expect(field()).toHaveValue('5d');
  });

  it('PATCHes minutes converted on the plan calendar, not at a flat 1440 (F8)', async () => {
    renderField();
    fireEvent.change(field(), { target: { value: '5d' } });
    fireEvent.blur(field());

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/plan-1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({
      criticalFloatThresholdMinutes: 5 * EIGHT_HOUR_DAY * 60,
      version: 4,
    });
  });

  it('accepts a sub-day threshold (ADR-0070 grammar)', async () => {
    renderField();
    fireEvent.change(field(), { target: { value: '4h' } });
    fireEvent.keyDown(field(), { key: 'Enter' });

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({
      criticalFloatThresholdMinutes: 240,
    });
  });

  it('does not save a value that is the same as the server’s, spelled differently', async () => {
    renderField({ plan: { ...PLAN, criticalFloatThresholdMinutes: 120 } });
    fireEvent.change(field(), { target: { value: '120m' } });
    fireEvent.blur(field());

    await waitFor(() => expect(field()).toHaveValue('2h')); // snapped back to the canonical form
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('refuses a value it cannot read, and does not save it', async () => {
    renderField();
    fireEvent.change(field(), { target: { value: '1w' } });
    fireEvent.blur(field());

    await waitFor(() =>
      expect(
        screen.getByText('Use d for days, h for hours or m for minutes. Weeks are not supported.'),
      ).toBeInTheDocument(),
    );
    expect(apiFetch).not.toHaveBeenCalled();
    // Blur has already moved focus off the control the message is bound to (WCAG 4.1.3).
    expect(announceSpy).toHaveBeenCalledWith(
      'Use d for days, h for hours or m for minutes. Weeks are not supported.',
    );
  });

  it('announces the saved value', async () => {
    renderField();
    fireEvent.change(field(), { target: { value: '5d' } });
    fireEvent.blur(field());

    await waitFor(() =>
      expect(announceSpy).toHaveBeenCalledWith('Critical float threshold set to 5d.'),
    );
  });

  it('rolls back to the server value and surfaces the error when the save fails', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('Version conflict.'));
    renderField({ plan: { ...PLAN, criticalFloatThresholdMinutes: 480 } });
    fireEvent.change(field(), { target: { value: '5d' } });
    fireEvent.blur(field());

    await waitFor(() => expect(screen.getByText('Version conflict.')).toBeInTheDocument());
    expect(field()).toHaveValue('1d');
  });

  it('degrades to raw working minutes when the calendar’s hours cannot be resolved', async () => {
    renderField({
      hoursPerDay: undefined,
      plan: { ...PLAN, criticalFloatThresholdMinutes: 2400 },
    });
    expect(field()).toHaveValue('2400');
    expect(screen.getByText(/Working minutes\./)).toBeInTheDocument();

    fireEvent.change(field(), { target: { value: '600' } });
    fireEvent.blur(field());
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    // 600 means 600 minutes here, NOT 600 days — the one unit that needs no factor.
    expect(JSON.parse(init?.body as string)).toMatchObject({
      criticalFloatThresholdMinutes: 600,
    });
  });

  it('refuses days in the degraded path rather than guessing a factor', async () => {
    renderField({ hoursPerDay: undefined });
    fireEvent.change(field(), { target: { value: '5d' } });
    fireEvent.blur(field());

    await waitFor(() => expect(screen.getByText(/Use a number and a unit/)).toBeInTheDocument());
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('does not overwrite what the planner has typed when the calendar resolves late', () => {
    // TECH_DEBT #83's shape: a keystroke and the calendar list settling are independent events, so
    // a field that re-seeds from the server on a `hoursPerDay` change eats the keystroke.
    const { rerender } = renderField({ hoursPerDay: undefined });
    fireEvent.change(field(), { target: { value: '600' } });

    const queryClient = new QueryClient();
    rerender(
      <QueryClientProvider client={queryClient}>
        <PlanCriticalFloatThresholdField
          orgSlug="acme"
          plan={PLAN}
          hoursPerDay={EIGHT_HOUR_DAY}
          canEdit
        />
      </QueryClientProvider>,
    );

    expect(field()).toHaveValue('600');
  });

  it('names the plan calendar’s day in the hint, because the threshold is plan-level', () => {
    renderField();
    expect(screen.getByText(/A day is 8 working hours on the PLAN calendar/)).toBeInTheDocument();
  });

  it('renders read-only for a non-editor, showing the value', () => {
    renderField({ canEdit: false, plan: { ...PLAN, criticalFloatThresholdMinutes: 240 } });
    expect(screen.queryByLabelText('Critical float threshold')).not.toBeInTheDocument();
    expect(screen.getByText('Critical float threshold')).toBeInTheDocument();
    expect(screen.getByText('4h')).toBeInTheDocument();
  });

  it('shuts the field while its save is in flight, without taking the value away', async () => {
    let resolve: (plan: unknown) => void = () => {};
    vi.mocked(apiFetch).mockReturnValue(new Promise((r) => (resolve = r)));
    renderField();
    fireEvent.change(field(), { target: { value: '5d' } });
    fireEvent.blur(field());

    // `readOnly`, not `disabled` (ADR-0083 D2): an in-flight save flips under a reader who is not
    // the one causing it, and the native attribute would throw a keyboard user to `<body>` and back
    // twice per save — the `ScopeSaveBar` lesson, applied to the field tier.
    await waitFor(() => expect(field()).toHaveAttribute('readonly'));
    expect(field()).toBeEnabled();
    expect(field()).toHaveAttribute('aria-busy', 'true');
    resolve({ ...PLAN, criticalFloatThresholdMinutes: 2400, version: 5 });
  });
});
