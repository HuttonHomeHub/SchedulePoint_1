import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { ActivityEditorDialog } from './ActivityEditorDialog';

import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';

const PATCHES: { url: string; body: Record<string, unknown> }[] = [];

/** A row whose `version` the test can advance, to prove the editor re-reads it per save. */
function row(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'act-1',
    planId: 'plan-1',
    name: 'Pour slab',
    code: 'A100',
    type: 'TASK',
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    durationDays: 5,
    percentCompleteType: 'DURATION',
    accrualType: 'UNIFORM',
    version: 1,
    ...overrides,
  } as ActivitySummary;
}

const PLANNER_WITH_PEN = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: true,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});

const PLANNER_NO_PEN = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: false,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});

const NO_COST = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: true,
  canWrite: true,
  canProgress: true,
  canReadCost: false,
});

function mount(props: Partial<Parameters<typeof ActivityEditorDialog>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ActivityEditorDialog
        orgSlug="acme"
        planId="plan-1"
        open
        onClose={() => {}}
        activity={row()}
        gating={PLANNER_WITH_PEN}
        {...props}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  PATCHES.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const body: string = typeof init?.body === 'string' ? init.body : '{}';
      PATCHES.push({ url, body: JSON.parse(body) as Record<string, unknown> });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: row({ version: 2 }) }),
      } as unknown as Response);
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('ActivityEditorDialog — structure', () => {
  it('renders one tab per readable scope', () => {
    mount();
    expect(screen.getByRole('tab', { name: 'General' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Scheduling' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Cost' })).toBeInTheDocument();
  });

  it('omits Cost entirely when the role cannot read it', () => {
    mount({ gating: NO_COST });
    expect(screen.queryByRole('tab', { name: 'Cost' })).not.toBeInTheDocument();
  });

  it('gives each scope its own Save', () => {
    mount();
    expect(screen.getByRole('button', { name: /save general/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Scheduling' }));
    expect(screen.getByRole('button', { name: /save scheduling/i })).toBeInTheDocument();
  });
});

describe('ActivityEditorDialog — copy review applied', () => {
  it('drops the “(optional)” suffix from labels', () => {
    mount();
    expect(screen.getByLabelText('Code')).toBeInTheDocument();
    expect(screen.queryByLabelText(/\(optional\)/)).not.toBeInTheDocument();
  });

  it('names the WBS field as the parent it selects', () => {
    mount();
    // The old label was "WBS summary", which collided with the Type option of the same name.
    expect(screen.queryByLabelText('WBS summary (optional)')).not.toBeInTheDocument();
  });
});

describe('ActivityEditorDialog — per-scope save', () => {
  it('sends only the edited scope’s keys', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pour slab B' } });
    fireEvent.click(screen.getByRole('button', { name: /save general/i }));

    await waitFor(() => expect(PATCHES).toHaveLength(1));
    const body = PATCHES[0]!.body;
    expect(body.name).toBe('Pour slab B');
    // Not one Scheduling or Cost key rides along — the capability-regression vector.
    expect(body).not.toHaveProperty('constraintType');
    expect(body).not.toHaveProperty('calendarId');
    expect(body).not.toHaveProperty('budgetedExpense');
    expect(body).not.toHaveProperty('accrualType');
  });

  it('reads `version` from the live row at submit time, not from when it opened', async () => {
    const { rerender } = mount();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'First' } });
    fireEvent.click(screen.getByRole('button', { name: /save general/i }));
    await waitFor(() => expect(PATCHES).toHaveLength(1));
    expect(PATCHES[0]!.body.version).toBe(1);

    // The row comes back with a bumped version, as it would after any scope save.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={client}>
        <ActivityEditorDialog
          orgSlug="acme"
          planId="plan-1"
          open
          onClose={() => {}}
          activity={row({ version: 2 })}
          gating={PLANNER_WITH_PEN}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Scheduling' }));
    fireEvent.change(screen.getByLabelText('Calendar'), { target: { value: '' } });
    // Dirty the scope so its Save enables.
    fireEvent.click(screen.getByLabelText(/schedule as late as possible/i));
    fireEvent.click(screen.getByRole('button', { name: /save scheduling/i }));

    await waitFor(() => expect(PATCHES).toHaveLength(2));
    // The second save must carry the version the FIRST one produced, or it 409s every time.
    expect(PATCHES[1]!.body.version).toBe(2);
  });

  it('keeps the editor open after a save', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Still here' } });
    fireEvent.click(screen.getByRole('button', { name: /save general/i }));
    await waitFor(() => expect(PATCHES).toHaveLength(1));
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});

describe('ActivityEditorDialog — gating', () => {
  it('disables a scope’s Save and states the reason when the pen is elsewhere', () => {
    mount({ gating: PLANNER_NO_PEN });
    expect(screen.getByRole('button', { name: /save general/i })).toBeDisabled();
    expect(screen.getByText(/take over the edit lock/i)).toBeInTheDocument();
  });

  it('disables the fields too, not only the Save', () => {
    mount({ gating: PLANNER_NO_PEN });
    expect(screen.getByLabelText('Name')).toBeDisabled();
  });

  it('keeps Save disabled until the scope is dirty', () => {
    mount();
    expect(screen.getByRole('button', { name: /save general/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Changed' } });
    expect(screen.getByRole('button', { name: /save general/i })).toBeEnabled();
  });
});

describe('ActivityEditorDialog — tab markers', () => {
  it('marks a dirty scope so an unsaved edit is visible from another tab', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Edited' } });
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'General, unsaved changes' })).toBeInTheDocument(),
    );
  });

  it('marks an invalid scope with a counted, worded marker', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save general/i }));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /General, 1 problem/ })).toBeInTheDocument(),
    );
  });
});
