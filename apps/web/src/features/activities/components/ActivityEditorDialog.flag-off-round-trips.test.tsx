import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deriveActivityEditorGating } from '../lib/activity-editor-gating';

import { ActivityEditorDialog } from './ActivityEditorDialog';

/**
 * **A field a flag hides still round-trips its seeded value on an unrelated save** — the flag-off
 * rollback contract, ported from `ActivityCreateDialog.test.tsx` (whose base suite pinned
 * `ADVANCED_CONSTRAINTS_ENABLED` / `ADVANCED_ACTIVITY_TYPES_ENABLED` off) after the
 * activity-dialog-unification epic deleted that dialog's edit path.
 *
 * Every scope seed reads the row for EVERY field, including ones behind an off flag
 * (`activity-editor-seeds.ts`'s own docblock states the rule) — so a hidden control never silently
 * clears a stored value. Pure value-mapping is proven flag-independently at the body builders
 * (`scope-bodies.test.ts`, `activity-body-builders.structural.test.ts`); what only a mounted dialog
 * can prove is that the HIDDEN field's value actually reaches the save.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ADVANCED_CONSTRAINTS_ENABLED: false,
  ADVANCED_ACTIVITY_TYPES_ENABLED: false,
}));

const PATCHES: { url: string; body: Record<string, unknown> }[] = [];

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

const openTab = (name: string): void => {
  fireEvent.click(screen.getByRole('tab', { name }));
};

beforeEach(() => {
  PATCHES.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method !== 'GET') {
        const body: string = typeof init?.body === 'string' ? init.body : '{}';
        PATCHES.push({ url, body: JSON.parse(body) as Record<string, unknown> });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: row({ version: 2 }) }),
      } as unknown as Response);
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('ActivityEditorDialog — WBS parentId round-trips with VITE_ADVANCED_ACTIVITY_TYPES off', () => {
  it('round-trips a seeded parentId on a no-op General save with the flag off', async () => {
    mount({ activity: row({ parentId: 'wbs-parent-1', version: 4 }) });
    // The picker is hidden (flag off) — this is what makes the round-trip worth proving.
    expect(screen.queryByLabelText('Parent WBS summary')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pour slab B' } });
    fireEvent.click(screen.getByRole('button', { name: /save general/i }));

    await waitFor(() => expect(PATCHES).toHaveLength(1));
    expect(PATCHES[0]!.body).toMatchObject({ parentId: 'wbs-parent-1', version: 4 });
  });
});

describe('ActivityEditorDialog — advanced constraint fields round-trip with VITE_ADVANCED_CONSTRAINTS off', () => {
  it('round-trips seeded secondary-constraint/ALAP/expected-finish values on a no-op Scheduling save', async () => {
    // The advanced fields aren't rendered while the flag is off, but the scope still seeds them
    // from the row — so saving an unrelated Scheduling field must never silently clear them.
    mount({
      activity: row({
        secondaryConstraintType: 'FNLT',
        secondaryConstraintDate: '2026-06-01',
        scheduleAsLateAsPossible: true,
        expectedFinish: '2026-05-20',
        version: 4,
      }),
    });
    openTab('Scheduling');
    expect(screen.queryByLabelText('Secondary constraint')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/schedule as late as possible/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Constraint'), { target: { value: 'SNET' } });
    fireEvent.change(screen.getByLabelText('Constraint date'), { target: { value: '2026-06-05' } });
    fireEvent.click(screen.getByRole('button', { name: /save scheduling/i }));

    await waitFor(() => expect(PATCHES).toHaveLength(1));
    expect(PATCHES[0]!.body).toMatchObject({
      version: 4,
      secondaryConstraintType: 'FNLT',
      secondaryConstraintDate: '2026-06-01',
      scheduleAsLateAsPossible: true,
      expectedFinish: '2026-05-20',
    });
  });
});
