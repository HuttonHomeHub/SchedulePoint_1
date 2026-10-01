import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityCreateDialog } from './ActivityCreateDialog';
import { ActivityEditorDialog } from './ActivityEditorDialog';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';
import type { ActivityEditorIntent } from '@/features/activities/lib/activity-editor-intent';

/**
 * **State that carries from one opening of the editor to the next, and a draft that does not
 * survive a tab switch** (docs/specs/activity-editor-seeding, M0 task T0.3 — findings F1–F4).
 *
 * Every other editor suite holds `onClose` as a mock, so `open` never goes back to `false` and
 * nothing here could be seen. These cases mount the editor the way `activity-crud-dialogs.tsx`
 * does: `open` is "an intent exists", closing clears the intent, and the next click builds a fresh
 * one. The dialogs stay mounted across openings; that is the whole defect.
 *
 * **F2 and F4 are `it.fails`, and that is a statement about today's code.** Each asserts the
 * behaviour the epic delivers, so each FAILS on this tree and `it.fails` keeps the suite green
 * while recording that. F3 was flipped to a plain `it` by M2 and F1 by M3a. The milestone that fixes a finding (M3b F2, M4 F4)
 * turns its case into a plain `it` — vitest reports an `it.fails` that starts passing as a failure, so the
 * flip cannot be forgotten.
 *
 * jsdom has no top layer, so F1 asserts only that a confirmation is ARMED for the next opening;
 * that it opens beneath the editor is the Playwright journey J2's question.
 */

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

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  RESOURCE_LEVELLING_ENABLED: true,
}));

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            url.includes('/steps')
              ? { data: [] }
              : { data: { ...ROW, version: 2, name: 'Edited' } },
          ),
      } as unknown as Response),
    ),
  );
});

afterEach(() => vi.unstubAllGlobals());

/** The host `activity-crud-dialogs.tsx` is: an intent is `open`, and closing clears it. */
function EditorHost(): React.ReactElement {
  const [intent, setIntent] = useState<ActivityEditorIntent | null>(null);
  const open = (tab: ActivityEditorIntent['tab']) => () => setIntent({ activityId: ROW.id, tab });
  return (
    <>
      <button onClick={open('general')}>open editor</button>
      <button onClick={open('progress')}>open progress</button>
      <ActivityEditorDialog
        orgSlug="acme"
        planId="plan-1"
        open={intent !== null}
        onClose={() => setIntent(null)}
        activity={intent ? ROW : undefined}
        {...(intent ? { intent } : {})}
        gating={GATING}
      />
    </>
  );
}

function CreateHost(): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>open create</button>
      <ActivityCreateDialog
        orgSlug="acme"
        planId="plan-1"
        open={open}
        onClose={() => setOpen(false)}
        planActivities={[]}
      />
    </>
  );
}

function mount(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe('F1 — a discarded draft leaves a confirmation armed for the next opening', () => {
  async function dirtyThenDiscard(): Promise<void> {
    fireEvent.click(screen.getByRole('button', { name: 'open editor' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pour slab B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    // The control: a dirty close asks, on the FIRST opening. Without it a probe that never reached
    // the confirmation would pass the assertion below for the wrong reason.
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('tablist')).not.toBeInTheDocument());
  }

  it('opens the same activity again with no confirmation armed', async () => {
    mount(<EditorHost />);
    await dirtyThenDiscard();
    fireEvent.click(screen.getByRole('button', { name: 'open editor' }));
    expect(screen.getByRole('tablist', { name: 'Activity sections' })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('F2 — "Saved." survives into the next opening', () => {
  it.fails('shows no save confirmation when the editor is opened again', async () => {
    mount(<EditorHost />);
    fireEvent.click(screen.getByRole('button', { name: 'open editor' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Edited' } });
    fireEvent.click(screen.getByRole('button', { name: /save general/i }));
    // The control: the confirmation does appear after the save, in the opening that made it.
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('tablist')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'open editor' }));
    expect(screen.getByRole('tablist', { name: 'Activity sections' })).toBeInTheDocument();
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument();
  });
});

describe('F3 — New activity’s hidden-field alert survives into the next opening', () => {
  it('shows no alert when the dialog is opened again', async () => {
    mount(<CreateHost />);
    fireEvent.click(screen.getByRole('button', { name: 'open create' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pour slab' } });
    // A negative priority is invalid; a milestone then hides the only field that holds it, so the
    // submit fails with nothing on screen to carry the message and the form says so itself.
    fireEvent.change(screen.getByLabelText('Levelling priority'), { target: { value: '-1' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'START_MILESTONE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));
    // The control: the alert is real in the opening that caused it.
    expect(await screen.findByRole('alert')).toHaveTextContent(/field holding it is one this/);

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByLabelText('Name')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'open create' }));
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('New activity — a failed create does not greet the next opening', () => {
  it('shows no server error when the dialog is opened again', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: { code: 'BOOM', message: 'The server refused.' } }),
        } as unknown as Response),
      ),
    );
    mount(<CreateHost />);
    fireEvent.click(screen.getByRole('button', { name: 'open create' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pour slab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));
    // The control: the error is real in the opening that caused it.
    expect(await screen.findByRole('alert')).toHaveTextContent('The server refused.');

    // The form is now dirty, so closing asks first; the mutation outlives the form it was made by.
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByLabelText('Name')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'open create' }));
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('F4 — a Progress draft dies on a tab switch', () => {
  it.fails('shows the draft again when the reader returns to Progress', () => {
    mount(<EditorHost />);
    fireEvent.click(screen.getByRole('button', { name: 'open progress' }));
    fireEvent.change(screen.getByLabelText('Percent complete'), { target: { value: '55' } });
    expect(screen.getByRole('tab', { name: /Progress.*unsaved changes/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /^General/ }));
    fireEvent.click(screen.getByRole('tab', { name: /^Progress/ }));
    expect(screen.getByLabelText<HTMLInputElement>('Percent complete').value).toBe('55');
  });
});

describe('New activity — a create that resolves after its opening closed', () => {
  /** Holds the create's response until the test releases it. */
  function deferredCreate(): { release: () => void } {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await gate;
        return {
          ok: true,
          status: 201,
          json: () => Promise.resolve({ data: { id: 'act-1', name: 'First' } }),
        } as unknown as Response;
      }),
    );
    return { release };
  }

  async function createThenDiscardWhilePending(): Promise<void> {
    fireEvent.click(screen.getByRole('button', { name: 'open create' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'First' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create activity' }));
    await screen.findByRole('button', { name: 'Saving…' });
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByLabelText('Name')).not.toBeInTheDocument());
  }

  it('does not close the next opening, and keeps what was typed into it', async () => {
    const { release } = deferredCreate();
    mount(
      <AnnouncerProvider>
        <CreateHost />
      </AnnouncerProvider>,
    );
    await createThenDiscardWhilePending();

    fireEvent.click(screen.getByRole('button', { name: 'open create' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Second' } });
    // The reopened form says why its button reads "Saving…".
    expect(screen.getByText('A previous activity is still being saved.')).toBeInTheDocument();

    release();
    await waitFor(() =>
      expect(
        screen.queryByText('A previous activity is still being saved.'),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Name')).toHaveValue('Second');
  });

  it('still announces the create after its opening closed', async () => {
    const { release } = deferredCreate();
    mount(
      <AnnouncerProvider>
        <CreateHost />
      </AnnouncerProvider>,
    );
    await createThenDiscardWhilePending();

    release();
    await waitFor(() => expect(document.body).toHaveTextContent('Activity “First” created.'));
  });
});
