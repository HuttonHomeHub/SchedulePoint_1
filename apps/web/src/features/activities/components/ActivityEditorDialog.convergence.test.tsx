import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityEditorDialog } from './ActivityEditorDialog';

import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';

// The convergence flag ON. Its sibling suite (`…convergence.flag-off.test.tsx`) pins the other
// state, which is the rollback contract — both are kept, per ADR-0053 M6.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ACTIVITY_EDITOR_CONVERGENCE_ENABLED: true,
  RESOURCES_ENABLED: true,
  NOTES_ENABLED: true,
}));

const REQUESTS: { url: string; method: string }[] = [];

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
        planActivities={[row(), row({ id: 'act-2', name: 'Excavate', code: 'A090' })]}
        {...props}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  REQUESTS.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      REQUESTS.push({ url, method: (init?.method ?? 'GET').toUpperCase() });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [] }),
      } as unknown as Response);
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('ActivityEditorDialog — the Logic tab', () => {
  it('adds Logic and Resources to the rail, in their subject order', () => {
    mount();
    const labels = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(labels).toEqual(['General', 'Scheduling', 'Logic', 'Progress', 'Cost', 'Resources']);
  });

  it('renders the same panel the Logic dialog renders', async () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: /Logic/ }));
    expect(await screen.findByRole('heading', { name: 'Predecessors' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Successors' })).toBeInTheDocument();
    // The inline add form came with the panel (M1) — it is not re-implemented per host.
    expect(screen.getByRole('group', { name: 'Add a link' })).toBeInTheDocument();
  });

  it('fetches nothing for Logic until its tab is the active one', async () => {
    mount();
    // Opening on General must not fetch every activity's predecessors on the way past.
    await waitFor(() => expect(REQUESTS.length).toBeGreaterThanOrEqual(0));
    expect(REQUESTS.filter((r) => r.url.includes('predecessors'))).toHaveLength(0);

    fireEvent.click(screen.getByRole('tab', { name: /Logic/ }));
    await waitFor(() =>
      expect(REQUESTS.filter((r) => r.url.includes('predecessors')).length).toBeGreaterThan(0),
    );
  });

  it('marks Logic read-only without the pen, and carries no marker with it', () => {
    const { unmount } = mount({ gating: PLANNER_NO_PEN });
    expect(screen.getByRole('tab', { name: /Logic/ })).toHaveTextContent('read-only');
    unmount();

    mount();
    expect(screen.getByRole('tab', { name: /Logic/ })).not.toHaveTextContent('read-only');
  });

  it('shades the add form with the pen reason rather than hiding it', () => {
    mount({ gating: PLANNER_NO_PEN });
    fireEvent.click(screen.getByRole('tab', { name: /Logic/ }));
    const add = screen.getByRole('button', { name: 'Add link' });
    expect(add).toHaveAttribute('aria-disabled', 'true');
    const describedBy = add.getAttribute('aria-describedby');
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      'Start editing to change this activity.',
    );
  });

  it('never asks to discard on close because of Logic — a link is saved the moment it is added', () => {
    const onClose = vi.fn();
    mount({ onClose });
    fireEvent.click(screen.getByRole('tab', { name: /Logic/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    // No confirmation: Logic owns no draft state, so `dirtyScopeNames` cannot name it.
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByText(/Discard unsaved changes\?/)).not.toBeInTheDocument();
  });

  it('forwards the cross-plan slot the composition root passes', () => {
    mount({ logic: { crossPlanSlot: <p>Cross-plan links</p> } });
    fireEvent.click(screen.getByRole('tab', { name: /Logic/ }));
    expect(screen.getByText('Cross-plan links')).toBeInTheDocument();
  });
});

describe('ActivityEditorDialog — the Notes tab', () => {
  it('appears only when the composition root passes a notes section', () => {
    const { unmount } = mount();
    expect(screen.queryByRole('tab', { name: /Notes/ })).not.toBeInTheDocument();
    unmount();

    mount({ notesSlot: <p>Note thread</p> });
    expect(screen.getByRole('tab', { name: /Notes/ })).toBeInTheDocument();
  });

  it('renders the section the root passed', () => {
    mount({ notesSlot: <p>Note thread</p> });
    fireEvent.click(screen.getByRole('tab', { name: /Notes/ }));
    expect(screen.getByText('Note thread')).toBeInTheDocument();
  });

  it('is never marked read-only — the pen does not gate notes (ADR-0046)', () => {
    mount({ gating: PLANNER_NO_PEN, notesSlot: <p>Note thread</p> });
    expect(screen.getByRole('tab', { name: /Notes/ })).not.toHaveTextContent('read-only');
  });
});

describe('ActivityEditorDialog — the Resources tab', () => {
  it('renders the same panel the Resources dialog renders', async () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: /Resources/ }));
    expect(await screen.findByRole('group', { name: 'Assigned' })).toBeInTheDocument();
  });

  it('fetches nothing for Resources until its tab is the active one', async () => {
    mount();
    expect(REQUESTS.filter((r) => r.url.includes('assignments'))).toHaveLength(0);
    fireEvent.click(screen.getByRole('tab', { name: /Resources/ }));
    await waitFor(() =>
      expect(REQUESTS.filter((r) => r.url.includes('assignments')).length).toBeGreaterThan(0),
    );
  });

  it('derives the milestone rule from the row, so the curve picker stays hidden for one', async () => {
    // The dialog took `isMilestone` from each call site; the editor holds the row, so it decides.
    mount({ activity: row({ type: 'START_MILESTONE', durationDays: 0 }) });
    fireEvent.click(screen.getByRole('tab', { name: /Resources/ }));
    await screen.findByRole('group', { name: 'Assigned' });
    expect(screen.queryByLabelText('Loading curve')).not.toBeInTheDocument();
  });

  it('marks Resources read-only without the pen', () => {
    mount({ gating: PLANNER_NO_PEN });
    expect(screen.getByRole('tab', { name: /Resources/ })).toHaveTextContent('read-only');
  });
});
