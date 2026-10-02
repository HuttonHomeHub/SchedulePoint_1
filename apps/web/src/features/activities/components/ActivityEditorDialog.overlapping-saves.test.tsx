import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityEditorDialog } from './ActivityEditorDialog';

import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';

/**
 * **Saves that overlap each settle their own callbacks** (docs/specs/activity-editor-seeding, M4;
 * ADR-0169 D3, D-10).
 *
 * react-query v5 fires a `mutate(vars, { onSuccess })` callback only for the LATEST call made through
 * an observer (`mutationObserver.js` ~126-147): an earlier call's callbacks are dropped, so its undo
 * record, its "Saved." and its announcement were silently lost. The frame therefore settles each
 * call through the promise `mutateAsync` returns, which belongs to that call alone.
 *
 * **Reachability, stated rather than hidden.** `ScopeSaveBar` blocks its click while a save is
 * pending, so a second Save PRESS cannot overlap a first on the same observer. A form submit that
 * bypasses the bar can (that is what this drives), and so can the Progress tab's three observers
 * against one another. The seam must not depend on the bar being the only door.
 */

const announce = vi.hoisted(() => vi.fn());

vi.mock('@/components/ui/announcer', () => ({
  useAnnounce: () => announce,
  AnnouncerProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  RESOURCE_LEVELLING_ENABLED: true,
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
  percentComplete: 0,
  version: 1,
} as ActivitySummary;

/** Each PATCH is held until the test releases it, in whatever order the test chooses. */
let releases: Array<(after: ActivitySummary) => void> = [];

beforeEach(() => {
  announce.mockReset();
  releases = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method !== 'PATCH') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: [] }),
        } as unknown as Response);
      }
      return new Promise<Response>((resolve) => {
        releases.push((after) =>
          resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: after }),
          } as unknown as Response),
        );
      });
    }),
  );
});

function mount(onSaved: (before: ActivitySummary, after: ActivitySummary) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ActivityEditorDialog
        orgSlug="acme"
        planId="plan-1"
        open
        onClose={vi.fn()}
        onSaved={onSaved}
        activity={ROW}
        gating={GATING}
      />
    </QueryClientProvider>,
  );
}

describe('two saves of different scopes in flight at once', () => {
  it('settle one undo record, one announcement and one clean form each', async () => {
    const onSaved = vi.fn();
    mount(onSaved);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: /save general/i }));
    await waitFor(() => expect(releases).toHaveLength(1));

    fireEvent.click(screen.getByRole('tab', { name: /^Scheduling/ }));
    const late = screen.getByLabelText(/schedule as late as possible/i);
    fireEvent.click(late);
    // The bar is blocked (and reads "Saving…") while the first save is pending: submit the form.
    fireEvent.submit(late.closest('form')!);
    await waitFor(() => expect(releases).toHaveLength(2));

    releases[0]!({ ...ROW, version: 2, name: 'Renamed' });
    releases[1]!({ ...ROW, version: 3 });

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
    expect(onSaved).toHaveBeenNthCalledWith(1, ROW, expect.objectContaining({ version: 2 }));
    expect(onSaved).toHaveBeenNthCalledWith(2, ROW, expect.objectContaining({ version: 3 }));
    expect(announce.mock.calls.map(([message]) => message)).toEqual([
      'General saved.',
      'Scheduling saved.',
    ]);

    // Neither bar is left reading "Saving…", and both forms are clean: Scheduling is on screen, and
    // General is checked by returning to it.
    expect(screen.queryByRole('button', { name: 'Saving…' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /^General/ }));
    expect(screen.queryByRole('button', { name: 'Saving…' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /unsaved changes/ })).not.toBeInTheDocument();
  });
});

describe('a Save busy only because another scope’s save is finishing', () => {
  it('says so, rather than reading as stuck, and is released when that save settles', async () => {
    mount(vi.fn());
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: /save general/i }));
    await waitFor(() => expect(releases).toHaveLength(1));

    fireEvent.click(screen.getByRole('tab', { name: /^Scheduling/ }));
    fireEvent.click(screen.getByLabelText(/schedule as late as possible/i));

    const save = screen.getByRole('button', { name: 'Saving…' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(document.getElementById(save.getAttribute('aria-describedby')!)).toHaveTextContent(
      'Another save is finishing.',
    );

    releases[0]!({ ...ROW, version: 2, name: 'Renamed' });

    // Scheduling's own edit is still unsaved and now savable; its bar is no longer busy.
    expect(await screen.findByRole('button', { name: 'Save scheduling' })).toHaveAttribute(
      'aria-disabled',
      'false',
    );
    expect(screen.queryByText('Another save is finishing.')).not.toBeInTheDocument();
  });
});
