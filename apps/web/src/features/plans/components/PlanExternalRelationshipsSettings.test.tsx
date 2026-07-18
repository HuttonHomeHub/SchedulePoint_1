import type { PlanSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanExternalRelationshipsSettings } from './PlanExternalRelationshipsSettings';

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
  ignoreExternalRelationships: false,
  eacMethod: 'CPI',
  currencyCode: null,
  plannedStart: '2026-01-01',
  calendarId: 'cal-standard',
  version: 4,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderSettings(
  props: Partial<React.ComponentProps<typeof PlanExternalRelationshipsSettings>> = {},
) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <PlanExternalRelationshipsSettings orgSlug="acme" plan={PLAN} canEdit {...props} />
    </QueryClientProvider>,
  );
}

describe('PlanExternalRelationshipsSettings', () => {
  beforeEach(() => {
    announceSpy.mockReset();
    vi.mocked(useAnnounce).mockReturnValue(announceSpy);
    vi.mocked(apiFetch)
      .mockReset()
      .mockResolvedValue({ ...PLAN, ignoreExternalRelationships: true, version: 5 });
  });

  it('PATCHes the plan turning ignore-external on, with the version', async () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText('Ignore external relationships'), {
      target: { value: 'on' },
    });

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/plan-1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({
      ignoreExternalRelationships: true,
      version: 4,
    });
    await waitFor(() =>
      expect(announceSpy).toHaveBeenCalledWith('Ignore external relationships turned on.'),
    );
  });

  it('renders read-only (no select) for a non-editor', () => {
    renderSettings({ canEdit: false });
    expect(screen.getByText('Ignore external relationships')).toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
