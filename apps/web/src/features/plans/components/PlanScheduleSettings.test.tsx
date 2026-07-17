import type { PlanSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanScheduleSettings } from './PlanScheduleSettings';

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
  criticalFloatThreshold: 0,
  totalFloatMode: 'FINISH',
  makeOpenEndsCritical: false,
  levelResources: false,
  levelWithinFloatOnly: false,
  plannedStart: '2026-01-01',
  calendarId: 'cal-standard',
  version: 4,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderSettings(props: Partial<React.ComponentProps<typeof PlanScheduleSettings>> = {}) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <PlanScheduleSettings orgSlug="acme" plan={PLAN} canEdit {...props} />
    </QueryClientProvider>,
  );
}

describe('PlanScheduleSettings', () => {
  beforeEach(() => {
    announceSpy.mockReset();
    vi.mocked(useAnnounce).mockReturnValue(announceSpy);
    vi.mocked(apiFetch)
      .mockReset()
      .mockResolvedValue({ ...PLAN, version: 5 });
  });

  it('PATCHes the plan with the chosen critical-path definition and version', async () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText('Critical-path definition'), {
      target: { value: 'LONGEST_PATH' },
    });

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/plan-1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({
      criticalPathDefinition: 'LONGEST_PATH',
      version: 4,
    });
  });

  it('PATCHes the plan with the chosen total-float measure and version', async () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText('Total-float measure'), {
      target: { value: 'SMALLEST' },
    });

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toEqual({
      totalFloatMode: 'SMALLEST',
      version: 4,
    });
  });

  it('PATCHes the plan with the make-open-ends boolean and version when turned on', async () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText('Open-ends criticality'), {
      target: { value: 'on' },
    });

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toEqual({
      makeOpenEndsCritical: true,
      version: 4,
    });
  });

  it('renders read-only (no selects) for a non-editor, showing all three values', () => {
    renderSettings({
      canEdit: false,
      plan: { ...PLAN, criticalPathDefinition: 'LONGEST_PATH', makeOpenEndsCritical: true },
    });
    expect(screen.queryByLabelText('Critical-path definition')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Total-float measure')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Open-ends criticality')).not.toBeInTheDocument();
    expect(screen.getByText('Longest path')).toBeInTheDocument();
    expect(screen.getByText('Finish float')).toBeInTheDocument();
    expect(screen.getByText('On')).toBeInTheDocument();
  });

  it('announces a successful change', async () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText('Critical-path definition'), {
      target: { value: 'LONGEST_PATH' },
    });

    await waitFor(() =>
      expect(announceSpy).toHaveBeenCalledWith('Critical-path definition set to Longest path.'),
    );
  });

  it('shows the current values selected and lists every option', () => {
    renderSettings();
    expect(screen.getByLabelText('Critical-path definition')).toHaveValue('TOTAL_FLOAT');
    expect(screen.getByRole('option', { name: 'Total float' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Longest path' })).toBeInTheDocument();
    expect(screen.getByLabelText('Total-float measure')).toHaveValue('FINISH');
    expect(screen.getByRole('option', { name: 'Finish float' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Start float' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Smallest' })).toBeInTheDocument();
    expect(screen.getByLabelText('Open-ends criticality')).toHaveValue('off');
  });

  it('disables just the changed control while its save is in flight', async () => {
    // Hold the mutation open so the picked control stays busy (optimistic value != stale server value).
    let resolve: (plan: unknown) => void = () => {};
    vi.mocked(apiFetch).mockReturnValue(new Promise((r) => (resolve = r)));
    renderSettings();
    const critical = screen.getByLabelText('Critical-path definition');
    fireEvent.change(critical, { target: { value: 'LONGEST_PATH' } });

    await waitFor(() => expect(critical).toBeDisabled());
    expect(critical).toHaveAttribute('aria-busy', 'true');
    // Each control owns its mutation, so a save on one never marks the others busy.
    expect(screen.getByLabelText('Total-float measure')).not.toBeDisabled();
    resolve({ ...PLAN, criticalPathDefinition: 'LONGEST_PATH', version: 5 });
  });

  it('rolls the choice back and surfaces an error when the save fails', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('Version conflict.'));
    renderSettings();
    fireEvent.change(screen.getByLabelText('Total-float measure'), { target: { value: 'START' } });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Version conflict.'));
    // The visible choice rolled back to the server value (not stuck on the failed pick).
    expect(screen.getByLabelText('Total-float measure')).toHaveValue('FINISH');
  });
});
