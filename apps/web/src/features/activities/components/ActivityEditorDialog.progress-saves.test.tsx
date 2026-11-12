import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityEditorDialog } from './ActivityEditorDialog';

import { expectRefusalBesideSave } from '@/components/ui/scope-save-bar-assertions';
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
  gatingUnderTest = GATING;
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

const CONTRIBUTOR_GATING = deriveActivityEditorGating({
  holdsPen: false,
  canWrite: false,
  canProgress: true,
  canReadCost: false,
});

/** The API's 422 for an actual after the data date, carrying what M1 added to `details`. */
function afterDataDate(fields: string[], latestActual: string): typeof progressResponse {
  return {
    ok: false,
    status: 422,
    body: {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'An actual date cannot be after the plan’s data date.',
        details: { reason: 'ACTUAL_AFTER_DATA_DATE', fields, dataDate: '2026-11-10', latestActual },
      },
    },
  };
}

let gatingUnderTest = GATING;

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
        gating={gatingUnderTest}
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

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This activity changed elsewhere.');
    expectRefusalBesideSave(alert, screen.getByRole('button', { name: 'Save progress' }));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
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

describe('a Reported-progress save refused for an actual after the data date', () => {
  it('marks the field, moves the cursor there and says who can move the data date', async () => {
    progressResponse = afterDataDate(['actualFinish'], '2026-11-14');
    mount();
    fireEvent.change(screen.getByLabelText('Actual start'), { target: { value: '2026-11-02' } });
    fireEvent.change(screen.getByLabelText('Actual finish'), { target: { value: '2026-11-14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));

    const finish = screen.getByLabelText('Actual finish');
    await waitFor(() => expect(finish).toHaveAttribute('aria-invalid', 'true'));
    expect(finish).toHaveFocus();
    expect(finish).toHaveAccessibleDescription(
      'Actual finish, 14 Nov 2026, is after the plan’s data date, 10 Nov 2026. ' +
        'Move the data date (the Planned start box in Edit plan details) to 14 Nov 2026 or later, ' +
        'then save again. ' +
        'What you typed stays here until you close the editor.',
    );
    // The sentence lives on the field, so the panel's top alert is not a second copy of it.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Actual start')).not.toHaveAttribute('aria-invalid');
    expect(finish).toHaveValue('2026-11-14');
    // Focus carries the sentence, so the live region is not asked to say it as well.
    expect(announce).not.toHaveBeenCalled();
  });

  it('tells a Contributor to ask a planner, since they cannot move the data date', async () => {
    gatingUnderTest = CONTRIBUTOR_GATING;
    progressResponse = afterDataDate(['actualFinish'], '2026-11-14');
    mount();
    fireEvent.change(screen.getByLabelText('Actual start'), { target: { value: '2026-11-02' } });
    fireEvent.change(screen.getByLabelText('Actual finish'), { target: { value: '2026-11-14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Actual finish')).toHaveAccessibleDescription(
        /A planner needs to move the data date to 14 Nov 2026 or later first\./,
      ),
    );
  });

  it('marks both fields when both are after it, and the sentence appears once', async () => {
    progressResponse = afterDataDate(['actualStart', 'actualFinish'], '2026-11-14');
    mount();
    fireEvent.change(screen.getByLabelText('Actual start'), { target: { value: '2026-11-12' } });
    fireEvent.change(screen.getByLabelText('Actual finish'), { target: { value: '2026-11-14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));

    const start = screen.getByLabelText('Actual start');
    await waitFor(() => expect(start).toHaveAttribute('aria-invalid', 'true'));
    expect(start).toHaveFocus();
    const finish = screen.getByLabelText('Actual finish');
    expect(finish).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getAllByText(/Actual start and Actual finish are after/)).toHaveLength(1);
    // The second field's text stands on its own in a two-column grid, where "above" is not true.
    expect(finish).toHaveAccessibleDescription('Also after the data date. See Actual start.');
  });

  it('clears the refusal when the reader edits the field it names, and a re-save is clean', async () => {
    progressResponse = afterDataDate(['actualFinish'], '2026-11-14');
    mount();
    fireEvent.change(screen.getByLabelText('Actual start'), { target: { value: '2026-11-02' } });
    fireEvent.change(screen.getByLabelText('Actual finish'), { target: { value: '2026-11-14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));
    const finish = screen.getByLabelText('Actual finish');
    await waitFor(() => expect(finish).toHaveAttribute('aria-invalid', 'true'));

    fireEvent.change(finish, { target: { value: '2026-11-10' } });
    await waitFor(() => expect(finish).not.toHaveAttribute('aria-invalid'));

    progressResponse = { ok: true, status: 200, body: { data: { ...ROW, version: 2 } } };
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(finish).not.toHaveAttribute('aria-invalid');
  });

  it('keeps the refusal on a field when a different field is edited', async () => {
    progressResponse = afterDataDate(['actualFinish'], '2026-11-14');
    mount();
    fireEvent.change(screen.getByLabelText('Actual start'), { target: { value: '2026-11-02' } });
    fireEvent.change(screen.getByLabelText('Actual finish'), { target: { value: '2026-11-14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));
    const finish = screen.getByLabelText('Actual finish');
    await waitFor(() => expect(finish).toHaveAttribute('aria-invalid', 'true'));

    fireEvent.change(screen.getByLabelText('Actual start'), { target: { value: '2026-11-03' } });
    fireEvent.change(screen.getByLabelText('Percent complete'), { target: { value: '60' } });

    expect(finish).toHaveAttribute('aria-invalid', 'true');
  });

  it('clears a finish-before-start refusal from either end', async () => {
    progressResponse = {
      ok: false,
      status: 422,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Actual finish cannot precede actual start.',
          details: { reason: 'FINISH_BEFORE_START', fields: ['actualFinish'] },
        },
      },
    };
    mount();
    // Valid to the form's own check; the server compares against the START it has stored.
    fireEvent.change(screen.getByLabelText('Actual start'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('Actual finish'), { target: { value: '2026-11-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));
    const finish = screen.getByLabelText('Actual finish');
    await waitFor(() => expect(finish).toHaveAttribute('aria-invalid', 'true'));
    expect(finish).toHaveAccessibleDescription('Actual finish cannot precede actual start.');

    // Fixing the START resolves it, though the error is on the finish.
    fireEvent.change(screen.getByLabelText('Actual start'), { target: { value: '2026-10-30' } });

    await waitFor(() => expect(finish).not.toHaveAttribute('aria-invalid'));
  });

  it('marks the resume date for a resume-before-suspend refusal', async () => {
    progressResponse = {
      ok: false,
      status: 422,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Resume date cannot precede the suspend date.',
          details: { reason: 'RESUME_BEFORE_SUSPEND', fields: ['resumeDate'] },
        },
      },
    };
    mount();
    fireEvent.change(screen.getByLabelText('Suspend date'), { target: { value: '2026-11-02' } });
    fireEvent.change(screen.getByLabelText('Resume date'), { target: { value: '2026-11-09' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));

    const resume = screen.getByLabelText('Resume date');
    await waitFor(() => expect(resume).toHaveAttribute('aria-invalid', 'true'));
    expect(resume).toHaveFocus();
    expect(resume).toHaveAccessibleDescription('Resume date cannot precede the suspend date.');
  });

  it('leaves the cursor where the reader is, and announces the sentence once', async () => {
    progressResponse = afterDataDate(['actualFinish'], '2026-11-14');
    let release!: () => void;
    holdProgress = new Promise<void>((resolve) => (release = resolve));
    mount();
    fireEvent.change(screen.getByLabelText('Actual start'), { target: { value: '2026-11-02' } });
    fireEvent.change(screen.getByLabelText('Actual finish'), { target: { value: '2026-11-14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));
    // The reader has moved on to another box while the save was out.
    const percent = screen.getByLabelText('Percent complete');
    percent.focus();

    release();

    await waitFor(() =>
      expect(screen.getByLabelText('Actual finish')).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(percent).toHaveFocus();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(
      expect.stringMatching(
        /^Progress not saved: Actual finish, 14 Nov 2026, is after the plan’s data date/,
      ),
    );
  });

  it('moves the cursor when it is on the Save button the reader pressed', async () => {
    progressResponse = afterDataDate(['actualFinish'], '2026-11-14');
    mount();
    fireEvent.change(screen.getByLabelText('Actual start'), { target: { value: '2026-11-02' } });
    fireEvent.change(screen.getByLabelText('Actual finish'), { target: { value: '2026-11-14' } });
    const save = screen.getByRole('button', { name: 'Save progress' });
    save.focus();
    fireEvent.click(save);

    await waitFor(() => expect(screen.getByLabelText('Actual finish')).toHaveFocus());
  });

  it('does not touch an editor that has gone: the save settles after it closed', async () => {
    progressResponse = afterDataDate(['actualFinish'], '2026-11-14');
    let release!: () => void;
    holdProgress = new Promise<void>((resolve) => (release = resolve));
    mount();
    fireEvent.change(screen.getByLabelText('Actual start'), { target: { value: '2026-11-02' } });
    fireEvent.change(screen.getByLabelText('Actual finish'), { target: { value: '2026-11-14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('tablist')).not.toBeInTheDocument());
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();

    release();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(outside).toHaveFocus();
    // Said once, by the frame that outlives the session — not a second time by the dead session.
    expect(announce).toHaveBeenCalledTimes(1);
    outside.remove();
  });

  it('keeps the refusal for the reader’s return from another tab, announced once', async () => {
    progressResponse = afterDataDate(['actualFinish'], '2026-11-14');
    let release!: () => void;
    holdProgress = new Promise<void>((resolve) => (release = resolve));
    mount();
    fireEvent.change(screen.getByLabelText('Actual start'), { target: { value: '2026-11-02' } });
    fireEvent.change(screen.getByLabelText('Actual finish'), { target: { value: '2026-11-14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));
    fireEvent.click(screen.getByRole('tab', { name: /^General/ }));

    release();
    await waitFor(() => expect(announce).toHaveBeenCalledTimes(1));
    expect(announce).toHaveBeenCalledWith(
      expect.stringMatching(/^Progress not saved: Actual finish, 14 Nov 2026, is after/),
    );

    fireEvent.click(screen.getByRole('tab', { name: /^Progress/ }));
    expect(screen.getByLabelText('Actual finish')).toHaveAttribute('aria-invalid', 'true');
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('puts a refusal that names no field in the Save bar', async () => {
    progressResponse = {
      ok: false,
      status: 422,
      body: { error: { code: 'VALIDATION_ERROR', message: 'Something else was refused.' } },
    };
    mount();
    fireEvent.change(screen.getByLabelText('Percent complete'), { target: { value: '55' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something else was refused.');
    expectRefusalBesideSave(alert, screen.getByRole('button', { name: 'Save progress' }));
  });
});
