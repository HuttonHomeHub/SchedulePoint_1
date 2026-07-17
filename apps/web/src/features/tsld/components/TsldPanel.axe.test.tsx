import type { ActivitySummary, DependencySummary } from '@repo/types';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

// Exercise the editing surface too (toolbar, shortcuts button) by forcing the flag on.
vi.mock('../../../config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, TSLD_EDITING_ENABLED: true };
});

import { TsldPanel } from './TsldPanel';

function activity(over: Partial<ActivitySummary> = {}): ActivitySummary {
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
    totalFloat: 2,
    freeFloat: null,
    isCritical: false,
    isNearCritical: true,
    constraintViolated: false,
    loeNoSpan: false,
    resourceDriverMissing: false,
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
    physicalPercentComplete: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}
const NO_DEPS: DependencySummary[] = [];

describe('TsldPanel — axe (no WCAG violations)', () => {
  it('has no violations when the plan is not yet scheduled (empty state)', async () => {
    const { container } = render(
      <TsldPanel activities={[]} dependencies={NO_DEPS} dataDate={null} />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });

  it('has no violations in the read-only diagram (editing off)', async () => {
    const { container } = render(
      <TsldPanel
        activities={[activity(), activity({ id: 'a2', name: 'Pour', laneIndex: 1 })]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
      />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });

  it('has no violations with editing enabled (toolbar + shortcuts help trigger)', async () => {
    const { container } = render(
      <TsldPanel
        activities={[activity()]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
        onReposition={vi.fn().mockResolvedValue({ applied: true, conflict: null })}
        onAutoArrange={vi.fn().mockResolvedValue({ applied: true, conflict: null })}
      />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});
