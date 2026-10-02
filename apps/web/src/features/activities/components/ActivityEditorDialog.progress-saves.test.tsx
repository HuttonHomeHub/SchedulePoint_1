import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityEditorDialog } from './ActivityEditorDialog';

import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';

/**
 * **The Progress tab's writes go through the frame too** (docs/specs/activity-editor-seeding, M4;
 * ADR-0169 D-10): the reported-progress and steps mutations moved out of the panels, so a failure is
 * held by the session — shown beside the panel that made the write, and gone with the opening — and
 * the success announcement keeps its warnings-aware wording.
 */

const announce = vi.hoisted(() => vi.fn());

vi.mock('@/components/ui/announcer', () => ({
  useAnnounce: () => announce,
  AnnouncerProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const GATING = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: true,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});

const ROW = {
  id: 'act-1',
  planId: 'plan-1',
  name: 'Pour slab',
  code: 'A100',
  type: 'TASK',
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  durationDays: 5,
  percentCompleteType: 'DURATION',
  accrualType: 'UNIFORM',
  percentComplete: 10,
  version: 1,
} as ActivitySummary;

let progressResponse: { ok: boolean; status: number; body: unknown };
/** When set, the PATCH waits for it — so a test can move the reader before the save settles. */
let holdProgress: Promise<void> | null;

beforeEach(() => {
  announce.mockReset();
  holdProgress = null;
  progressResponse = { ok: true, status: 200, body: { data: { ...ROW, percentComplete: 55 } } };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') await holdProgress;
      return {
        ok: init?.method === 'PATCH' ? progressResponse.ok : true,
        status: init?.method === 'PATCH' ? progressResponse.status : 200,
        json: () =>
          Promise.resolve(init?.method === 'PATCH' ? progressResponse.body : { data: [] }),
        url,
      } as unknown as Response;
    }),
  );
});

function Host(): React.ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>reopen</button>
      <ActivityEditorDialog
        orgSlug="acme"
        planId="plan-1"
        open={open}
        onClose={() => setOpen(false)}
        activity={open ? ROW : undefined}
        intent={{ activityId: ROW.id, tab: 'progress' }}
        gating={GATING}
      />
    </>
  );
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Host />
    </QueryClientProvider>,
  );
}

describe('a Reported-progress save', () => {
  it('announces the repairs the server applied', async () => {
    progressResponse = {
      ok: true,
      status: 200,
      body: { data: { ...ROW, percentComplete: 55 }, meta: { warnings: [{}, {}] } },
    };
    mount();
    fireEvent.change(screen.getByLabelText('Percent complete'), { target: { value: '55' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));

    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith('Progress saved with 2 adjustments.'),
    );
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('shows its failure beside the panel, and the next opening does not inherit it', async () => {
    progressResponse = {
      ok: false,
      status: 409,
      body: { error: { message: 'This activity changed elsewhere.' } },
    };
    mount();
    fireEvent.change(screen.getByLabelText('Percent complete'), { target: { value: '55' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This activity changed elsewhere.');
    // Shown by the mounted session, so the live region is not asked to say it as well.
    expect(announce).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('tablist')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'reopen' }));

    expect(await screen.findByLabelText('Percent complete')).toHaveValue(10);
    expect(screen.queryByText('This activity changed elsewhere.')).not.toBeInTheDocument();
  });
});

describe('a Reported-progress save that fails while the reader is on another tab', () => {
  it('is announced, because the panel that would show it is not on screen', async () => {
    progressResponse = {
      ok: false,
      status: 409,
      body: { error: { message: 'This activity changed elsewhere.' } },
    };
    let release!: () => void;
    holdProgress = new Promise<void>((resolve) => (release = resolve));
    mount();
    fireEvent.change(screen.getByLabelText('Percent complete'), { target: { value: '55' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));
    fireEvent.click(screen.getByRole('tab', { name: /^General/ }));

    release();

    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith('Progress not saved: This activity changed elsewhere.'),
    );
    // And the failure is waiting where it belongs when the reader comes back.
    fireEvent.click(screen.getByRole('tab', { name: /^Progress/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('This activity changed elsewhere.');
  });
});
