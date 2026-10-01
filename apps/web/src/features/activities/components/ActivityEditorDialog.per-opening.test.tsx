import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityEditorDialog } from './ActivityEditorDialog';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';

/**
 * **The editor is built per opening, and what must outlive an opening lives in the frame**
 * (docs/specs/activity-editor-seeding, M3b; ADR-0169 D3).
 *
 * Two rules, each asserted against the host shape `activity-crud-dialogs.tsx` is — `open` is "a row
 * is chosen", closing clears it:
 *
 * 1. **The session is keyed by the row.** A subject that changed under an open editor (unreachable
 *    behind a modal, ADR-0108 D7) remounts the session, so the title and the forms can never describe
 *    different activities. This replaces `ActivityEditor.subject-guard.test.tsx`, which pinned the
 *    guard that rule makes unnecessary.
 * 2. **A save that finishes after the editor closed is still recorded and announced.** The scope-save
 *    mutation lives in the frame; a per-call callback on a mutation observer that unmounted with the
 *    session is dropped, which would lose the undo record (ADR-0048) and the live-region message —
 *    the only two signals a closed editor's save has left.
 */

const GATING = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: true,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});

function row(id: string, name: string): ActivitySummary {
  return {
    id,
    planId: 'plan-1',
    name,
    code: id.toUpperCase(),
    type: 'TASK',
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    durationDays: 5,
    percentCompleteType: 'DURATION',
    accrualType: 'UNIFORM',
    percentComplete: 0,
    version: 1,
  } as ActivitySummary;
}

const A = row('act-a', 'Pour slab');
const B = row('act-b', 'Strip formwork');

function mount(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AnnouncerProvider>{node}</AnnouncerProvider>
    </QueryClientProvider>,
  );
}

describe('the session is keyed by the activity it edits', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  function Swap(): React.ReactElement {
    const [target, setTarget] = useState(A);
    return (
      <>
        <button onClick={() => setTarget(B)}>swap subject</button>
        <ActivityEditorDialog
          orgSlug="acme"
          planId="plan-1"
          open
          onClose={vi.fn()}
          activity={target}
          gating={GATING}
        />
      </>
    );
  }

  it('does not carry one activity’s draft under another’s title', () => {
    mount(<Swap />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'A half-typed rename' } });
    expect(screen.getByLabelText('Name')).toHaveValue('A half-typed rename');

    fireEvent.click(screen.getByRole('button', { name: 'swap subject' }));

    expect(screen.getByRole('heading', { name: 'Strip formwork' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Strip formwork');
    // The first row's draft is gone with its session, so no tab claims unsaved work for the second.
    expect(screen.queryByText('unsaved changes')).not.toBeInTheDocument();
  });
});

describe('a save that completes after the editor closed', () => {
  let finishPatch: (() => void) | null = null;

  beforeEach(() => {
    finishPatch = null;
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
        // Held until the test releases it: the save is in flight while the editor closes.
        return new Promise<Response>((resolve) => {
          finishPatch = () =>
            resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ data: { ...A, version: 2, name: 'Renamed' } }),
            } as unknown as Response);
        });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  function Host({ onSaved }: { onSaved: (b: ActivitySummary, a: ActivitySummary) => void }) {
    const [open, setOpen] = useState(true);
    return (
      <ActivityEditorDialog
        orgSlug="acme"
        planId="plan-1"
        open={open}
        onClose={() => setOpen(false)}
        onSaved={onSaved}
        activity={open ? A : undefined}
        gating={GATING}
      />
    );
  }

  it('still records the undo and announces, with the session gone', async () => {
    const onSaved = vi.fn();
    mount(<Host onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: /save general/i }));
    await waitFor(() => expect(finishPatch).not.toBeNull());

    // Close mid-save. The form is dirty until the save lands, so the editor asks first.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('tablist')).not.toBeInTheDocument());
    expect(onSaved).not.toHaveBeenCalled();

    finishPatch?.();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledWith(A, expect.objectContaining({ version: 2 }));
    await waitFor(() =>
      expect(screen.getByTestId('announcer')).toHaveTextContent('General saved.'),
    );
  });
});
