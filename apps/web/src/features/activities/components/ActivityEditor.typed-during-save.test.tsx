import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityEditorDialog } from './ActivityEditorDialog';

import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';

/**
 * **Text typed while a save is in flight survives the save landing** (TECH_DEBT #430).
 *
 * Fields stay editable after Save is pressed, and each scope's success callback used to `reset()`
 * the form to the SUBMITTED values — so a keystroke made in the round trip was replaced by the sent
 * value when the response arrived, and the dirty marker cleared over work nobody had saved. Each
 * case holds the response, types a different value after pressing Save, releases it, and asserts the
 * typed text is still there AND still reported unsaved. The last cases pin the other half: a scope
 * nothing was typed into after the press still comes back clean.
 */

vi.mock('@/components/ui/announcer', () => ({
  useAnnounce: () => vi.fn(),
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
  percentCompleteType: 'PHYSICAL',
  accrualType: 'UNIFORM',
  percentComplete: 10,
  physicalPercentComplete: 20,
  version: 1,
} as ActivitySummary;

type Step = { name: string; weight: number; percentComplete: number };

/** Every write is held until the test releases it with the body the server would answer. */
let held: Array<{ url: string; release: () => void }> = [];
let steps: Step[] = [];

beforeEach(() => {
  held = [];
  steps = [{ name: 'Rebar', weight: 2, percentComplete: 25 }];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const respond = (data: unknown): Response =>
        ({ ok: true, status: 200, json: () => Promise.resolve({ data }) }) as unknown as Response;
      if ((init?.method ?? 'GET').toUpperCase() === 'GET') {
        return Promise.resolve(respond(url.includes('/steps') ? steps : ROW));
      }
      return new Promise<Response>((resolve) => {
        held.push({
          url,
          release: () => {
            if (url.includes('/steps')) {
              steps = (JSON.parse(init?.body as string) as { steps: Step[] }).steps;
              resolve(respond(steps));
            } else resolve(respond({ ...ROW, version: ROW.version + 1 }));
          },
        });
      });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

function mount(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ActivityEditorDialog
        orgSlug="acme"
        planId="plan-1"
        open
        onClose={vi.fn()}
        activity={ROW}
        gating={GATING}
      />
    </QueryClientProvider>,
  );
}

const openTab = (name: RegExp): void => {
  fireEvent.click(screen.getByRole('tab', { name }));
};
const change = (label: string, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

/** Press Save, wait for the write to be in flight, type the later text, then let the save land. */
async function typeWhileSaving(
  save: RegExp,
  field: string,
  sent: string,
  later: string,
): Promise<void> {
  change(field, sent);
  fireEvent.click(screen.getByRole('button', { name: save }));
  await waitFor(() => expect(held).toHaveLength(1));
  change(field, later);
  held[0]!.release();
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Saving…' })).toBeNull());
}

describe('text typed after Save is pressed survives the response', () => {
  it('General', async () => {
    mount();
    await typeWhileSaving(/save general/i, 'Name', 'Sent name', 'Typed later');
    expect(screen.getByLabelText('Name')).toHaveValue('Typed later');
    expect(screen.getByRole('tab', { name: /General.*unsaved changes/ })).toBeInTheDocument();
  });

  it('Scheduling', async () => {
    mount();
    openTab(/^Scheduling/);
    await typeWhileSaving(/save scheduling/i, 'Levelling priority', '10', '20');
    expect(screen.getByLabelText('Levelling priority')).toHaveValue(20);
    expect(screen.getByRole('tab', { name: /Scheduling.*unsaved changes/ })).toBeInTheDocument();
  });

  it('Cost', async () => {
    mount();
    openTab(/^Cost/);
    await typeWhileSaving(/save cost/i, 'Budgeted expense', '10', '20');
    expect(screen.getByLabelText('Budgeted expense')).toHaveValue(20);
    expect(screen.getByRole('tab', { name: /Cost.*unsaved changes/ })).toBeInTheDocument();
  });

  it('Reported progress', async () => {
    mount();
    openTab(/^Progress/);
    await screen.findByLabelText('Step 1 name');
    await typeWhileSaving(/save progress/i, 'Percent complete', '55', '60');
    expect(screen.getByLabelText('Percent complete')).toHaveValue(60);
    expect(screen.getByRole('tab', { name: /Progress.*unsaved changes/ })).toBeInTheDocument();
  });

  it('Value measure', async () => {
    mount();
    openTab(/^Progress/);
    await screen.findByLabelText('Step 1 name');
    // The chooser, not the manual physical %: that one is shaded while the seeded step carries weight.
    await typeWhileSaving(/save measure/i, 'Earn value from', 'DURATION', 'UNITS');
    expect(screen.getByLabelText('Earn value from')).toHaveValue('UNITS');
    expect(screen.getByRole('tab', { name: /Progress.*unsaved changes/ })).toBeInTheDocument();
  });

  it('Weighted steps', async () => {
    mount();
    openTab(/^Progress/);
    await screen.findByLabelText('Step 1 name');
    await typeWhileSaving(/save steps/i, 'Step 1 name', 'Rebar B', 'Rebar C');
    expect(screen.getByLabelText('Step 1 name')).toHaveValue('Rebar C');
    expect(screen.getByRole('tab', { name: /Progress.*unsaved changes/ })).toBeInTheDocument();
  });
});

describe('a scope nothing was typed into after Save still comes back clean', () => {
  it('General', async () => {
    mount();
    change('Name', 'Sent name');
    fireEvent.click(screen.getByRole('button', { name: /save general/i }));
    await waitFor(() => expect(held).toHaveLength(1));
    held[0]!.release();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Saving…' })).toBeNull());
    expect(screen.getByLabelText('Name')).toHaveValue('Sent name');
    expect(screen.queryByRole('tab', { name: /unsaved changes/ })).not.toBeInTheDocument();
  });

  it('Weighted steps', async () => {
    mount();
    openTab(/^Progress/);
    await screen.findByLabelText('Step 1 name');
    change('Step 1 name', 'Rebar B');
    fireEvent.click(screen.getByRole('button', { name: /save steps/i }));
    await waitFor(() => expect(held).toHaveLength(1));
    held[0]!.release();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Saving…' })).toBeNull());
    expect(screen.getByLabelText('Step 1 name')).toHaveValue('Rebar B');
    expect(screen.queryByRole('tab', { name: /unsaved changes/ })).not.toBeInTheDocument();
  });
});
