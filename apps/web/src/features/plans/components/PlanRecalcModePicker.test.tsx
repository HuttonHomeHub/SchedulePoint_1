import type { PlanSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanRecalcModePicker } from './PlanRecalcModePicker';

import { apiFetch } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const PLAN: PlanSummary = {
  id: 'plan-1',
  projectId: 'proj-1',
  name: 'Baseline',
  description: null,
  status: 'DRAFT',
  schedulingMode: 'EARLY',
  progressRecalcMode: 'RETAINED_LOGIC',
  plannedStart: '2026-01-01',
  calendarId: 'cal-standard',
  version: 4,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderPicker(props: Partial<React.ComponentProps<typeof PlanRecalcModePicker>> = {}) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <PlanRecalcModePicker orgSlug="acme" plan={PLAN} canEdit {...props} />
    </QueryClientProvider>,
  );
}

describe('PlanRecalcModePicker', () => {
  beforeEach(() => {
    vi.mocked(apiFetch)
      .mockReset()
      .mockResolvedValue({ ...PLAN, progressRecalcMode: 'PROGRESS_OVERRIDE', version: 5 });
  });

  it('shows the current mode selected and lists the three modes', () => {
    renderPicker();
    const select = screen.getByLabelText('Recalc mode');
    expect(select).toHaveValue('RETAINED_LOGIC');
    expect(screen.getByRole('option', { name: 'Retained Logic' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Progress Override' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Actual Dates' })).toBeInTheDocument();
  });

  it('PATCHes the plan with the chosen mode and version', async () => {
    renderPicker();
    fireEvent.change(screen.getByLabelText('Recalc mode'), {
      target: { value: 'PROGRESS_OVERRIDE' },
    });

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/plan-1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({
      progressRecalcMode: 'PROGRESS_OVERRIDE',
      version: 4,
    });
  });

  it('renders read-only (no select) for a non-editor, showing the mode label', () => {
    renderPicker({ canEdit: false });
    expect(screen.queryByLabelText('Recalc mode')).not.toBeInTheDocument();
    expect(screen.getByText('Retained Logic')).toBeInTheDocument();
  });
});
