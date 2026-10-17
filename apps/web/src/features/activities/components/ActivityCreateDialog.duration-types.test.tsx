import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityCreateDialog } from './ActivityCreateDialog';

import { apiFetch } from '@/lib/api/client';
import { anActivity } from '@/test/activity-fixture';

/**
 * The duration-type picker (ADR-0040, M7 rung 4) with `VITE_DURATION_TYPES` forced ON — the surface
 * ships dark by default, so this suite pins the flag to prove the picker renders, persists, and is
 * hidden for a type with no entered duration (a milestone). (The flag-off behaviour — picker hidden,
 * seeded value still round-trips — is covered by `ActivityCreateDialog.test.tsx`.)
 *
 * **The seed+round-trip case moved.** `ActivityCreateDialog` lost its edit path in the
 * activity-dialog-unification epic (create-only now, no `activity` prop), so "seeds the duration
 * type from the row and round-trips it on save" ported to
 * `ActivityEditorDialog.round-trips.test.tsx` — "seeds the duration type from the row and
 * round-trips it on a General save".
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  DURATION_TYPES_ENABLED: true,
}));

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

const ACTIVITY: ActivitySummary = anActivity({
  planId: 'pl1',
  earlyStart: null,
  earlyFinish: null,
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

describe('ActivityCreateDialog — duration type (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue(ACTIVITY);
  });

  it('creates an activity carrying the chosen duration type', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pour slab' } });
    fireEvent.change(screen.getByLabelText('Duration type'), { target: { value: 'FIXED_UNITS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/pl1/activities');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      name: 'Pour slab',
      durationType: 'FIXED_UNITS',
    });
  });

  it('hides the picker for a milestone (no entered duration / units)', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'START_MILESTONE' } });
    expect(screen.queryByLabelText('Duration type')).not.toBeInTheDocument();
  });
});
