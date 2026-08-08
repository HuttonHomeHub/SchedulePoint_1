import type { ActivitySummary, DependencySummary } from '@repo/types';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TsldPanel } from './TsldPanel';

/**
 * Regression: taking the pen produced a canvas that looked completely dead — no bar grew while
 * drawing, no cursor guideline, no resize readout.
 *
 * The interaction canvas is a SECOND canvas mounted only while editing, and it is sized (backing
 * store + CSS box) exclusively inside the rAF loop's `measure()`. `measure()` early-returned unless
 * the *container* had changed size — and flipping into edit mode doesn't resize the container. So
 * the freshly-mounted canvas kept the HTML default 300×150 while the painter addressed it in full
 * container coordinates: every ghost, guideline and chip past ~300px landed off the surface
 * entirely. Resizing the window — the one thing that does change the container — made it spring to
 * life, which is what made the bug look intermittent rather than total.
 *
 * jsdom reports a zero-sized container, so the applied size here is the 1×1 floor; the assertion
 * that matters is that a size was applied AT ALL rather than the untouched 300×150 default.
 */

const NO_DEPS: DependencySummary[] = [];

function activity(): ActivitySummary {
  return {
    id: 'a1',
    planId: 'p1',
    code: null,
    name: 'Excavate',
    description: null,
    type: 'TASK',
    durationDays: 3,
    durationMinutes: 1440,
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
    remainingDurationMinutes: null,
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
  };
}

/** The HTML default a canvas carries when nothing has sized it — the bug's signature. */
const UNSIZED_CANVAS_WIDTH = 300;

describe('TsldCanvas — the interaction canvas is sized when it mounts mid-session', () => {
  /**
   * The mount condition widened with ADR-0080 §3: **selecting is a read**, so the pointer-transparent
   * interaction layer mounts without the pen — otherwise a marquee sweep would be invisible to
   * exactly the person who has no other feedback on this canvas. So a read-only viewer now has it
   * too, and the flip this test is named for no longer creates it.
   *
   * What the test is actually for survives that unchanged: whatever the state, the layer must be
   * **sized** — an unsized canvas keeps the HTML default of 300px and every pointer coordinate
   * computed against it is wrong. Asserted in both states rather than only after the flip.
   */
  it('sizes it in both states — read-only (ADR-0080 §3) and after the edit-mode flip', () => {
    const props = {
      activities: [activity()],
      dependencies: NO_DEPS,
      dataDate: '2026-01-01',
      onCreate: vi.fn().mockResolvedValue({ recalcConflict: null }),
    };
    const { container, rerender } = render(<TsldPanel {...props} canEdit={false} />);
    const readOnly = container.querySelector<HTMLCanvasElement>('canvas.pointer-events-none');
    expect(readOnly).not.toBeNull();
    expect(readOnly!.width).not.toBe(UNSIZED_CANVAS_WIDTH);

    rerender(<TsldPanel {...props} canEdit />);

    const interaction = container.querySelector<HTMLCanvasElement>('canvas.pointer-events-none');
    expect(interaction).not.toBeNull();
    expect(interaction!.width).not.toBe(UNSIZED_CANVAS_WIDTH);
    expect(interaction!.style.width).not.toBe('');
  });
});
