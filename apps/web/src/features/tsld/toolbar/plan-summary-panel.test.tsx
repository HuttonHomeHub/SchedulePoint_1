import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Stub the computed schedule strip — its data-fetching isn't the subject here.
vi.mock('@/features/schedule', () => ({
  ScheduleSummaryStrip: () => <div data-testid="schedule-strip" />,
}));

const { PlanSummaryPanel } = await import('./plan-summary-panel');
const { formatCalendarDate } = await import('@/lib/format-date');

function renderPanel(over: Partial<Parameters<typeof PlanSummaryPanel>[0]> = {}) {
  return render(
    <PlanSummaryPanel
      statusLabel="Active"
      dataDate="2026-01-01"
      orgSlug="acme"
      planId="p1"
      {...over}
    />,
  );
}

describe('PlanSummaryPanel', () => {
  it('shows the status and data date, and embeds the schedule strip', () => {
    renderPanel();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Data date')).toBeInTheDocument();
    expect(screen.getByText(formatCalendarDate('2026-01-01'))).toBeInTheDocument();
    expect(screen.getByTestId('schedule-strip')).toBeInTheDocument();
  });

  it('renders a dash when the data date is unset', () => {
    renderPanel({ dataDate: null });
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows the scheduling mode only when a label is given', () => {
    const { rerender } = renderPanel();
    expect(screen.queryByText('Mode')).not.toBeInTheDocument();
    rerender(
      <PlanSummaryPanel
        statusLabel="Active"
        dataDate="2026-01-01"
        schedulingModeLabel="Visual"
        orgSlug="acme"
        planId="p1"
      />,
    );
    expect(screen.getByText('Mode')).toBeInTheDocument();
    expect(screen.getByText('Visual')).toBeInTheDocument();
  });

  /**
   * **The panel no longer offers `Edit plan…` at all** (foot-row-and-deck M5).
   *
   * This case used to assert the writer/viewer split: absent for `onEdit: null`, present and wired
   * for a writer. Both halves are now wrong, because the control is gone from this surface for
   * everyone — it was rendered twice from ONE `editPlan` memo, here and on the header's
   * edit-pencil, and the product owner chose the pencil.
   *
   * Replaced rather than deleted. A suite that simply loses its Edit-plan case leaves nothing
   * saying the absence is deliberate, and the next reader adding a shortcut back to this popover
   * would meet no resistance at all.
   */
  it('offers no Edit plan control — the header pencil is the one route', () => {
    render(
      <PlanSummaryPanel statusLabel="Active" dataDate="2026-01-01" orgSlug="acme" planId="p1" />,
    );
    expect(screen.queryByRole('button', { name: /Edit plan/ })).not.toBeInTheDocument();
    // The pinned positive: the panel still renders its facts, so the assertion above cannot pass
    // by the panel having failed to render at all.
    expect(screen.getByText('Data date')).toBeInTheDocument();
  });
});
