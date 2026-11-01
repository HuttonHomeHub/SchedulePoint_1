import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deriveActivityEditorGating } from '../lib/activity-editor-gating';

import { ActivityEditorDialog } from './ActivityEditorDialog';

import { activityKeys } from '@/lib/query/hierarchy-keys';
import { anActivity } from '@/test/activity-fixture';

/**
 * **Re-filing through the editor's Breakdown field stores the lane** (docs/TECH_DEBT.md #547).
 *
 * The field saves `parentId` through the General scope's PATCH, which is not an `updateParents` call,
 * so `useReparentActivities` never saw it. The frame now stores the lane the activity takes in its new
 * group through the same planner and write, only when the plan's swimlanes come from the WBS and only
 * when the parent actually moved.
 */

const h = vi.hoisted(() => {
  const plan: { swimlaneSource: string; swimlaneWbsLevel: number | null; plannedStart: string } = {
    swimlaneSource: 'WBS',
    swimlaneWbsLevel: 1,
    plannedStart: '2026-01-01',
  };
  return { plan };
});

vi.mock('@/features/plans', () => ({ usePlan: () => ({ data: h.plan }) }));

const iso = (d: number): string => `2026-01-${String(d + 1).padStart(2, '0')}`;
const summary = (id: string): ActivitySummary =>
  anActivity({ id, name: id, code: id, type: 'WBS_SUMMARY', parentId: null, version: 1 });
const task = (id: string, parentId: string, start: number, end: number): ActivitySummary =>
  anActivity({
    id,
    name: id,
    parentId,
    version: 4,
    visualEffectiveStart: iso(start),
    visualEffectiveFinish: iso(end),
  });

const stored = (summaryActivityId: string, laneIndex: number) => ({
  basis: 'WBS_SUMMARY' as const,
  swimlaneId: null,
  summaryActivityId,
  wbsLevel: null,
  laneIndex,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const G1 = summary('G1');
const G2 = summary('G2');
const T1 = { ...task('t1', 'G1', 0, 3), swimlaneLanes: [stored('G1', 0)] };
const T2 = { ...task('t2', 'G2', 0, 3), swimlaneLanes: [stored('G2', 0)] };
const PLAN = [G1, G2, T1, T2];

const GATING = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: true,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});

let failPositions = false;
const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];

function mount(onSaved?: (row: ActivitySummary, after: ActivitySummary) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(activityKeys.listByPlan('acme', 'plan-1'), PLAN);
  return render(
    <QueryClientProvider client={client}>
      <ActivityEditorDialog
        orgSlug="acme"
        planId="plan-1"
        open
        onClose={() => {}}
        activity={T1}
        planActivities={PLAN}
        gating={GATING}
        {...(onSaved ? { onSaved } : {})}
      />
    </QueryClientProvider>,
  );
}

const saveGeneral = (): void => {
  fireEvent.click(screen.getByRole('button', { name: /save general/i }));
};

beforeEach(() => {
  calls.length = 0;
  failPositions = false;
  h.plan = { swimlaneSource: 'WBS', swimlaneWbsLevel: 1, plannedStart: '2026-01-01' };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as object) : {};
      calls.push({ url, method, body: body as Record<string, unknown> });
      if (failPositions && url.includes('/positions')) return Promise.reject(new Error('boom'));
      const answer = url.includes('/positions')
        ? []
        : { ...T1, parentId: (body as { parentId?: string }).parentId ?? null, version: 5 };
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: answer }),
      } as unknown as Response);
    }),
  );
});

describe('ActivityEditorDialog — re-filing stores the swimlane lane', () => {
  it('writes the lane in the new group at the version the PATCH returned', async () => {
    mount();

    fireEvent.change(screen.getByLabelText('Parent WBS summary'), { target: { value: 'G2' } });
    saveGeneral();

    // t1 shares days 0-3 with t2 in G2, so it takes the next lane.
    await waitFor(() => expect(calls.some((c) => c.url.includes('/positions'))).toBe(true));
    const positions = calls.find((c) => c.url.includes('/positions'));
    expect(positions?.body).toMatchObject({
      positions: [{ id: 't1', version: 5, swimlane: { laneIndex: 1 } }],
    });
    expect(calls.findIndex((c) => c.url.includes('/positions'))).toBeGreaterThan(
      calls.findIndex((c) => c.method === 'PATCH' && !c.url.includes('/positions')),
    );
  });

  it('reports the save before it writes the lane, so the undo record follows the PATCH', async () => {
    const seen: string[][] = [];
    mount(() => seen.push(calls.map((c) => c.url)));

    fireEvent.change(screen.getByLabelText('Parent WBS summary'), { target: { value: 'G2' } });
    saveGeneral();

    await waitFor(() => expect(calls.some((c) => c.url.includes('/positions'))).toBe(true));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.some((url) => url.includes('/positions'))).toBe(false);
  });

  it('still reports the save when the lane write fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    failPositions = true;
    const onSaved = vi.fn();
    mount(onSaved);

    fireEvent.change(screen.getByLabelText('Parent WBS summary'), { target: { value: 'G2' } });
    saveGeneral();

    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('writes no lane when the parent did not change', async () => {
    mount();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 't1 renamed' } });
    saveGeneral();

    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(calls.some((c) => c.url.includes('/positions'))).toBe(false);
  });

  it('writes no lane when the plan’s swimlanes are not from the WBS', async () => {
    h.plan = { swimlaneSource: 'MANUAL', swimlaneWbsLevel: null, plannedStart: '2026-01-01' };
    mount();

    fireEvent.change(screen.getByLabelText('Parent WBS summary'), { target: { value: 'G2' } });
    saveGeneral();

    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(calls.some((c) => c.url.includes('/positions'))).toBe(false);
  });
});
