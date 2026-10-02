import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stepKeys } from '../api/use-activity-steps';

import { ActivityEditorDialog } from './ActivityEditorDialog';

import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';

/**
 * **What the session holds for the Progress tab** (docs/specs/activity-editor-seeding, M4; ADR-0169
 * §4.6). The three Progress forms live in `ActivityEditorSession`, not in the panels a tab click
 * mounts, so a draft survives a visit to another tab and the tab's marker is true for as long as the
 * draft exists. `ActivityEditor.reopen-state.test.tsx` holds the reported-progress half of F4; this
 * file holds the other two forms, the steps query's lifetime, and the rules for a refetch under a
 * draft (D-9).
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
  percentCompleteType: 'PHYSICAL',
  accrualType: 'UNIFORM',
  percentComplete: 10,
  physicalPercentComplete: 20,
  version: 1,
} as ActivitySummary;

type Step = { name: string; weight: number; percentComplete: number };

let steps: Step[] = [];
let stepGets = 0;

beforeEach(() => {
  steps = [{ name: 'Rebar', weight: 2, percentComplete: 25 }];
  stepGets = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const isSteps = url.includes('/steps');
      if (isSteps) stepGets += 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: isSteps ? steps : ROW }),
      } as unknown as Response);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function mount(intent: { tab: 'general' | 'progress'; focusSteps?: true } = { tab: 'progress' }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <ActivityEditorDialog
        orgSlug="acme"
        planId="plan-1"
        open
        onClose={vi.fn()}
        activity={ROW}
        intent={{ activityId: ROW.id, ...intent }}
        gating={GATING}
      />
    </QueryClientProvider>,
  );
  return { client, ...view };
}

const awayAndBack = (): void => {
  fireEvent.click(screen.getByRole('tab', { name: /^General/ }));
  fireEvent.click(screen.getByRole('tab', { name: /^Progress/ }));
};

describe('a Progress draft survives a visit to another tab', () => {
  it('keeps a weighted-steps draft, and the tab says so while the reader is away', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Add step' }));
    fireEvent.change(screen.getByLabelText('Step 2 name'), { target: { value: 'Pour' } });

    fireEvent.click(screen.getByRole('tab', { name: /^General/ }));
    expect(screen.getByRole('tab', { name: /Progress.*unsaved changes/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /^Progress/ }));
    expect(screen.getByLabelText('Step 1 name')).toHaveValue('Rebar');
    expect(screen.getByLabelText('Step 2 name')).toHaveValue('Pour');
  });

  it('keeps a value-measure draft', async () => {
    mount();
    await screen.findByRole('button', { name: 'Add step' });
    fireEvent.change(screen.getByLabelText('Earn value from'), { target: { value: 'DURATION' } });

    awayAndBack();

    expect(screen.getByLabelText('Earn value from')).toHaveValue('DURATION');
    expect(screen.getByRole('tab', { name: /Progress.*unsaved changes/ })).toBeInTheDocument();
  });

  it('shows no marker once the draft is put back, so the dot cannot outlive the work', async () => {
    mount();
    await screen.findByRole('button', { name: 'Add step' });
    fireEvent.change(screen.getByLabelText('Percent complete'), { target: { value: '55' } });
    expect(screen.getByRole('tab', { name: /Progress.*unsaved changes/ })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Percent complete'), { target: { value: '10' } });
    expect(screen.queryByRole('tab', { name: /unsaved changes/ })).not.toBeInTheDocument();
  });
});

describe('the steps list is fetched on the first visit to Progress (D-8)', () => {
  it('is not fetched while the reader has not been there', async () => {
    mount({ tab: 'general' });
    await screen.findByRole('tablist', { name: 'Activity sections' });
    expect(stepGets).toBe(0);

    fireEvent.click(screen.getByRole('tab', { name: /^Progress/ }));
    await waitFor(() => expect(stepGets).toBeGreaterThan(0));
    expect(await screen.findByLabelText('Step 1 name')).toHaveValue('Rebar');
  });
});

describe('a refetch under the steps form (D-9)', () => {
  const refetchWith = async (client: QueryClient, next: Step[]): Promise<void> => {
    steps = next;
    const key = stepKeys.listByActivity('acme', ROW.id);
    await act(async () => {
      await client.invalidateQueries({ queryKey: key });
    });
    // The control that makes the DIRTY case mean something: the new data really is in the cache, and
    // the effect that would act on it has had its turn, before anything is asserted about the form.
    await waitFor(() => expect(client.getQueryData(key)).toEqual(next));
    await act(async () => {});
  };

  it('re-seeds a CLEAN form from the new data', async () => {
    const { client } = mount();
    expect(await screen.findByLabelText('Step 1 name')).toHaveValue('Rebar');

    await refetchWith(client, [{ name: 'Formwork', weight: 1, percentComplete: 0 }]);

    await waitFor(() => expect(screen.getByLabelText('Step 1 name')).toHaveValue('Formwork'));
  });

  it('leaves a DIRTY form alone — the draft is the planner’s, not the refetch’s', async () => {
    const { client } = mount();
    fireEvent.change(await screen.findByLabelText('Step 1 name'), { target: { value: 'Rebar B' } });

    await refetchWith(client, [{ name: 'Formwork', weight: 1, percentComplete: 0 }]);

    expect(screen.getByLabelText('Step 1 name')).toHaveValue('Rebar B');
    expect(screen.getByRole('tab', { name: /Progress.*unsaved changes/ })).toBeInTheDocument();
  });
});

describe('opened with the Steps intent', () => {
  it('lands focus on the Weighted steps heading once the dialog is showing', async () => {
    mount({ tab: 'progress', focusSteps: true });

    // A frame after the dialog opens, not at mount: the panel mounts before `showModal()`.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Weighted steps' })),
    );
  });
});
