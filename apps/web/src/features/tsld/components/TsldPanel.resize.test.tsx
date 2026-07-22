import type { ActivitySummary, DependencySummary } from '@repo/types';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TsldPanel wiring for the finish-edge duration resize (ADR-0052 M2): the pointer intent →
 * `onResize` round-trip with its ghost + announcement, and the `Shift+←/→` keyboard nudge with its
 * flag / eligibility gating. The gesture machine, hit-zones, hook and route handler each have their
 * own exhaustive suites; this covers only the panel seams between them.
 */

const h = vi.hoisted(() => ({ directManipulation: true }));

vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    TSLD_EDITING_ENABLED: true,
    get CANVAS_DIRECT_MANIPULATION_ENABLED() {
      return h.directManipulation;
    },
  };
});

// Capture live-region announcements so we can assert the resize status messages.
const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));

import { NUDGE_DEBOUNCE_MS } from '../interaction/use-coalesced-nudge';

import { TsldPanel } from './TsldPanel';

function activity(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'a1',
    planId: 'p1',
    code: 'A100',
    name: 'Excavate',
    description: null,
    type: 'TASK',
    durationDays: 3,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    calendarId: null,
    laneIndex: 0,
    scheduleAsLateAsPossible: false,
    expectedFinish: null,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    remainingDurationDays: null,
    suspendDate: null,
    resumeDate: null,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-03',
    lateStart: '2026-01-01',
    lateFinish: '2026-01-03',
    totalFloat: 0,
    freeFloat: null,
    isCritical: false,
    isNearCritical: false,
    constraintViolated: false,
    externalDriven: false,
    loeNoSpan: false,
    resourceDriverMissing: false,
    externalEarlyStart: null,
    externalLateFinish: null,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    parentId: null,
    visualStart: null,
    visualEffectiveStart: null,
    visualEffectiveFinish: null,
    visualConflict: false,
    visualDriftDays: null,
    levelingPriority: null,
    leveledStart: null,
    leveledFinish: null,
    levelingDelayDays: null,
    levelingWindowExceeded: false,
    selfOverAllocated: false,
    percentCompleteType: 'DURATION',
    accrualType: 'UNIFORM',
    physicalPercentComplete: null,
    budgetedExpense: null,
    actualExpense: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const NO_DEPS: DependencySummary[] = [];

function renderPanel(rows: ActivitySummary[] = [activity()]) {
  const onResize = vi.fn().mockResolvedValue({ applied: true, conflict: null });
  const utils = render(
    <TsldPanel
      activities={rows}
      dependencies={NO_DEPS}
      dataDate="2026-01-01"
      canEdit
      onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
      onResize={onResize}
    />,
  );
  const canvas = utils.container.querySelector('canvas');
  if (!canvas) throw new Error('canvas not rendered');
  return { ...utils, canvas, onResize };
}

beforeEach(() => {
  vi.useFakeTimers();
  announceSpy.mockClear();
  h.directManipulation = true;
});
afterEach(() => vi.useRealTimers());

describe('TsldPanel finish-edge resize (ADR-0052 M2, flag on)', () => {
  it('drag on the finish grab-zone → resize intent → onResize + announcement', async () => {
    const { canvas, onResize } = renderPanel();
    // DEFAULT_VIEWPORT (pxPerDay 14, origin 40/40): the day-0..2 bar spans x 40..82 at lane 0; the
    // finish grab-zone is its last 8px. Drag right to day column 5 → duration 5 - 0 + 1 = 6.
    fireEvent.pointerDown(canvas, { clientX: 78, clientY: 54, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 118, clientY: 54, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 118, clientY: 54, pointerId: 1 });

    // The intent maps to onResize synchronously on drop…
    expect(onResize).toHaveBeenCalledWith({ activityId: 'a1', durationDays: 6 });
    // …and the success announcement lands once the write settles.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(announceSpy).toHaveBeenCalledWith('Resized “Excavate” to 6 days; dates will update.');
  });

  it('a press-release on the finish zone without a real drag selects instead of resizing', () => {
    const { canvas, onResize } = renderPanel();
    fireEvent.pointerDown(canvas, { clientX: 78, clientY: 54, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 78, clientY: 54, pointerId: 1 });
    // Selection is announced via the option description; no resize write is issued.
    expect(announceSpy).toHaveBeenCalled();
    expect(onResize).not.toHaveBeenCalled();
  });

  it('Shift+ArrowRight on the focused bar nudges duration +1 day (coalesced)', async () => {
    const { onResize } = renderPanel();
    const listbox = screen.getByRole('listbox');
    fireEvent.focus(listbox); // default-selects the first activity
    fireEvent.keyDown(listbox, { key: 'ArrowRight', shiftKey: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS);
    });
    expect(onResize).toHaveBeenCalledWith({ activityId: 'a1', durationDays: 4 });
  });

  it('Shift+ArrowLeft nudges duration −1 day', async () => {
    const { onResize } = renderPanel();
    const listbox = screen.getByRole('listbox');
    fireEvent.focus(listbox);
    fireEvent.keyDown(listbox, { key: 'ArrowLeft', shiftKey: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS);
    });
    expect(onResize).toHaveBeenCalledWith({ activityId: 'a1', durationDays: 2 });
  });

  it('no-ops the duration nudge on a duration-derived selection (milestone)', async () => {
    const { onResize } = renderPanel([
      activity({ type: 'START_MILESTONE', durationDays: 0, earlyFinish: '2026-01-01' }),
    ]);
    const listbox = screen.getByRole('listbox');
    fireEvent.focus(listbox);
    fireEvent.keyDown(listbox, { key: 'ArrowRight', shiftKey: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS);
    });
    expect(onResize).not.toHaveBeenCalled();
  });
});

describe('TsldPanel finish-edge resize (flag OFF parity)', () => {
  it('Shift+ArrowRight does nothing and the bar-end press keeps its previous behaviour', async () => {
    h.directManipulation = false;
    const { canvas, onResize } = renderPanel();
    // Keyboard: the branch is unreachable — no write.
    const listbox = screen.getByRole('listbox');
    fireEvent.focus(listbox);
    fireEvent.keyDown(listbox, { key: 'ArrowRight', shiftKey: true });
    await vi.advanceTimersByTimeAsync(NUDGE_DEBOUNCE_MS);
    expect(onResize).not.toHaveBeenCalled();
    // Pointer: with no link handler wired the end zone falls through to M1 select (today's
    // behaviour) — a finish-zone drag never emits a resize intent.
    fireEvent.pointerDown(canvas, { clientX: 78, clientY: 54, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 118, clientY: 54, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 118, clientY: 54, pointerId: 1 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onResize).not.toHaveBeenCalled();
  });
});
