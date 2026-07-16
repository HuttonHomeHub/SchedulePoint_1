import type { PlanSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanExpectedFinishToggle } from './PlanExpectedFinishToggle';

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
  useExpectedFinishDates: false,
  criticalPathDefinition: 'TOTAL_FLOAT',
  criticalFloatThreshold: 0,
  totalFloatMode: 'FINISH',
  plannedStart: '2026-01-01',
  calendarId: 'cal-standard',
  version: 4,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderToggle(props: Partial<React.ComponentProps<typeof PlanExpectedFinishToggle>> = {}) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <PlanExpectedFinishToggle orgSlug="acme" plan={PLAN} canEdit {...props} />
    </QueryClientProvider>,
  );
}

describe('PlanExpectedFinishToggle', () => {
  beforeEach(() => {
    vi.mocked(apiFetch)
      .mockReset()
      .mockResolvedValue({ ...PLAN, useExpectedFinishDates: true, version: 5 });
  });

  it('reflects the current off state and offers On/Off', () => {
    renderToggle();
    const select = screen.getByLabelText('Expected-finish scheduling');
    expect(select).toHaveValue('off');
    expect(screen.getByRole('option', { name: 'On' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Off' })).toBeInTheDocument();
  });

  it('PATCHes the plan with the boolean and version when turned on', async () => {
    renderToggle();
    fireEvent.change(screen.getByLabelText('Expected-finish scheduling'), {
      target: { value: 'on' },
    });

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/plan-1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({
      useExpectedFinishDates: true,
      version: 4,
    });
  });

  it('renders read-only for a non-editor, showing the state', () => {
    renderToggle({ canEdit: false, plan: { ...PLAN, useExpectedFinishDates: true } });
    expect(screen.queryByLabelText('Expected-finish scheduling')).not.toBeInTheDocument();
    expect(screen.getByText('On')).toBeInTheDocument();
  });

  it('rolls back and surfaces an error when the save fails', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('Version conflict.'));
    renderToggle();
    fireEvent.change(screen.getByLabelText('Expected-finish scheduling'), {
      target: { value: 'on' },
    });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Version conflict.'));
    expect(screen.getByLabelText('Expected-finish scheduling')).toHaveValue('off');
  });
});
