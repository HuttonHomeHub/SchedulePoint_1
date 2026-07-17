import type { PlanSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanLevellingSettings } from './PlanLevellingSettings';

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

function renderSettings(props: Partial<React.ComponentProps<typeof PlanLevellingSettings>> = {}) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <PlanLevellingSettings orgSlug="acme" plan={PLAN} canEdit {...props} />
    </QueryClientProvider>,
  );
}

describe('PlanLevellingSettings', () => {
  beforeEach(() => {
    announceSpy.mockReset();
    vi.mocked(useAnnounce).mockReturnValue(announceSpy);
    vi.mocked(apiFetch)
      .mockReset()
      .mockResolvedValue({ ...PLAN, levelResources: true, version: 5 });
  });

  it('PATCHes the plan turning resource levelling on, with the version', async () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText('Level resources'), { target: { value: 'on' } });

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/plan-1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({ levelResources: true, version: 4 });
    await waitFor(() => expect(announceSpy).toHaveBeenCalledWith('Level resources turned on.'));
  });

  it('hides the within-float control while levelling is off, and shows it when on', () => {
    const { rerender } = renderSettings();
    expect(screen.queryByLabelText('Level within float only')).not.toBeInTheDocument();

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <PlanLevellingSettings orgSlug="acme" plan={{ ...PLAN, levelResources: true }} canEdit />
      </QueryClientProvider>,
    );
    expect(screen.getByLabelText('Level within float only')).toBeInTheDocument();
  });

  it('PATCHes the within-float option when levelling is on', async () => {
    renderSettings({ plan: { ...PLAN, levelResources: true } });
    fireEvent.change(screen.getByLabelText('Level within float only'), {
      target: { value: 'on' },
    });

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toEqual({ levelWithinFloatOnly: true, version: 4 });
  });

  it('renders read-only for a reader, hiding within-float until levelling is on', () => {
    const { rerender } = renderSettings({ canEdit: false });
    expect(screen.getByText('Level resources')).toBeInTheDocument();
    expect(screen.queryByText('Level within float only')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <PlanLevellingSettings
          orgSlug="acme"
          plan={{ ...PLAN, levelResources: true }}
          canEdit={false}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Level within float only')).toBeInTheDocument();
  });
});
