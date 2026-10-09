import type { ActivitySummary, CalendarSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityBottomPanel, useActivityPanelModel } from './activity-bottom-panel';
import type { PlanWorkspaceModel } from './use-plan-workspace-model';

import { activityKeys } from '@/features/activities/api/use-activities';

/**
 * **The panel must not re-render when the workspace re-renders for a reason it does not read**
 * (`docs/TECH_DEBT.md` #334, M2-F1; `docs/specs/activities-panel-scale/`).
 *
 * The plan workspace re-renders on every canvas selection change, and it hands the panel a `model`
 * that is a fresh object literal each time (`use-plan-workspace-model.ts`, the hook's `return {…}`),
 * so a panel keyed on `model` identity re-renders its whole activity table for a selection that
 * changes nothing the table shows. The M0 harness's I4 limb measured exactly that cost.
 *
 * The probe is a count, not a timing: every row's Name cell mounts a `NoteCountBadge`, so the number
 * of times this stub renders is the number of row cells whose renderer ran (ADR-0133 D6's shape —
 * jsdom has no layout to time, and a count does not flake). The harness rebuilds the model literal
 * on every render, **including fresh container objects for each query result and a fresh
 * `onDuplicateActivity`**, because that is what the real hook does and a harness that reused them
 * would prove nothing.
 */
const badgeRenders = vi.hoisted(() => ({ count: 0 }));

vi.mock('@/features/notes', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  NoteCountBadge: () => {
    badgeRenders.count += 1;
    return null;
  },
}));
vi.mock('./canvas-dock', () => ({ CanvasDockOutlet: () => null }));
vi.mock('./plan-facts-host', () => ({ PlanFactsOutlet: () => null }));

const ACTIVITIES = Array.from({ length: 25 }, (_, i) => ({
  id: `a${i}`,
  name: `Activity ${i}`,
  type: 'TASK',
  parentId: null,
})) as unknown as ActivitySummary[];
const CALENDARS: CalendarSummary[] = [];
const NOOP = (): void => {};

/** A fresh model literal — the shape of the real hook's return, on every call. */
function freshModel(overrides: Partial<PlanWorkspaceModel> = {}): PlanWorkspaceModel {
  return {
    orgSlug: 'acme',
    planId: 'pl1',
    canEditSchedule: false,
    canProgress: false,
    canWriteNotes: false,
    activityEditorGating: undefined,
    setEditorIntent: NOOP,
    onOpenLogic: NOOP,
    onResourcesActivity: NOOP,
    onMakeMilestone: NOOP,
    recordActivityDelete: NOOP,
    recordActivityDissolve: NOOP,
    varianceByActivityId: undefined,
    noteCountByActivityId: undefined,
    onDuplicateActivity: () => Promise.resolve(),
    calendars: { data: CALENDARS, isPending: false, isError: false },
    activities: { data: ACTIVITIES, isPending: false, isError: false },
    plan: { data: { calendarId: null } },
    variance: { data: undefined },
    ...overrides,
  } as unknown as PlanWorkspaceModel;
}

function Harness(): React.ReactElement {
  // The canvas selection: state in the workspace that the panel does not read.
  const [selected, setSelected] = useState(0);
  // A workspace input the panel DOES read, so a genuine model change can be told from a selection.
  const [editable, setEditable] = useState(false);
  const panelModel = useActivityPanelModel(freshModel({ canEditSchedule: editable }));
  return (
    <>
      <button type="button" onClick={() => setSelected((n) => n + 1)}>
        Select next ({selected})
      </button>
      <button type="button" onClick={() => setEditable((e) => !e)}>
        Toggle edit
      </button>
      <ActivityBottomPanel model={panelModel} onCollapse={() => {}} />
    </>
  );
}

describe('ActivityBottomPanel — render isolation (M2)', () => {
  beforeEach(() => {
    badgeRenders.count = 0;
  });

  it('runs no row cell renderer when the workspace re-renders for a canvas selection', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), ACTIVITIES);
    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
    expect(badgeRenders.count).toBeGreaterThanOrEqual(ACTIVITIES.length);
    badgeRenders.count = 0;

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Select next/ }));
    });

    expect(screen.getByRole('button', { name: 'Select next (1)' })).toBeInTheDocument();
    expect(badgeRenders.count).toBe(0);
  });

  it('DOES re-render the rows when the workspace changes an input the panel reads', () => {
    // Positive control: without it `toBe(0)` above is satisfied by a panel that never re-renders.
    const queryClient = new QueryClient();
    queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), ACTIVITIES);
    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
    badgeRenders.count = 0;

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Toggle edit' }));
    });

    expect(badgeRenders.count).toBeGreaterThanOrEqual(ACTIVITIES.length);
  });

  it('forwards a duplicate to the LATEST workspace closure, not the one it was built with', () => {
    // The stable wrapper exists so a new `onDuplicateActivity` each render does not re-render the
    // panel; the price it must not charge is a stale closure over the duplicate pipeline.
    const first = vi.fn(() => Promise.resolve());
    const second = vi.fn(() => Promise.resolve());
    const { result, rerender } = renderHook(
      ({ duplicate }) =>
        useActivityPanelModel({
          ...freshModel(),
          onDuplicateActivity: duplicate,
        }),
      { initialProps: { duplicate: first } },
    );
    const stable = result.current.onDuplicateActivity;

    rerender({ duplicate: second });

    expect(result.current.onDuplicateActivity).toBe(stable);
    stable(ACTIVITIES[0] as ActivitySummary);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(ACTIVITIES[0]);
  });
});
