import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityCreateDialog } from './ActivityCreateDialog';

import { apiFetch } from '@/lib/api/client';
import { anActivity } from '@/test/activity-fixture';

/**
 * The activity levelling-priority field (`levelingPriority`, ADR-0041) with `VITE_RESOURCE_LEVELLING`
 * forced ON — the surface ships dark by default, so this suite pins the flag to prove the field renders,
 * persists (omitted when blank), and is hidden for a type levelling never moves (a milestone). The
 * flag-off behaviour is covered by `ActivityCreateDialog.test.tsx`.
 *
 * **Two edit-mode cases moved** when `ActivityCreateDialog` lost its edit path
 * (activity-dialog-unification epic): "seeds the priority from the row and round-trips it on save"
 * ported to `ActivityEditorDialog.round-trips.test.tsx` — "seeds the priority from the row and
 * round-trips it on a Scheduling save"; "clears the priority to null when the field is emptied on
 * edit" is covered by
 * `apps/web/src/features/activities/api/activity-body-builders.structural.test.ts`
 * (`levelingPriority` is in its `CLEARABLE_KEYS`).
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  RESOURCE_LEVELLING_ENABLED: true,
}));

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const ACTIVITY: ActivitySummary = anActivity({
  planId: 'pl1',
  earlyStart: null,
  earlyFinish: null,
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  levelingPriority: 10,
  accrualType: 'UNIFORM',
  version: 4,
});

function renderDialog(props: Partial<React.ComponentProps<typeof ActivityCreateDialog>> = {}) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityCreateDialog orgSlug="acme" planId="pl1" open onClose={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

describe('ActivityCreateDialog — levelling priority (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(ACTIVITY);
  });

  it('creates an activity carrying the entered levelling priority', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pour slab' } });
    fireEvent.change(screen.getByLabelText('Levelling priority'), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({
      name: 'Pour slab',
      levelingPriority: 5,
    });
  });

  it('omits priority on create when the field is left blank', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Unprioritised' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).not.toHaveProperty('levelingPriority');
  });

  it('hides the priority field for a milestone (never levelled)', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'START_MILESTONE' } });
    expect(screen.queryByLabelText('Levelling priority')).not.toBeInTheDocument();
  });
});
