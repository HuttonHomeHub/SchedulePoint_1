import { fireEvent, render, screen } from '@testing-library/react';
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
      onEdit={null}
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
        onEdit={null}
      />,
    );
    expect(screen.getByText('Mode')).toBeInTheDocument();
    expect(screen.getByText('Visual')).toBeInTheDocument();
  });

  it('offers Edit plan only to writers (onEdit present) and wires it', () => {
    const onEdit = vi.fn();
    const { rerender } = renderPanel();
    expect(screen.queryByRole('button', { name: /Edit plan/ })).not.toBeInTheDocument();
    rerender(
      <PlanSummaryPanel
        statusLabel="Active"
        dataDate="2026-01-01"
        orgSlug="acme"
        planId="p1"
        onEdit={onEdit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Edit plan/ }));
    expect(onEdit).toHaveBeenCalledOnce();
  });
});
