import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GanttRowMenu } from './GanttRowMenu';

import type { SelectionBarContext } from '@/features/plan-actions/selection-actions';

/**
 * **M5-T3's menu, actually driven.**
 *
 * It shipped with zero behavioural coverage and the M6 test-engineering gate caught it — and
 * `coverage.structural.test.ts` could not, by its own stated blind spot: it matches action LABELS
 * against the journey corpus, and this menu shares its labels with the docked bar the journeys do
 * drive. So the gate was satisfied while an entire surface went unexercised, which is the shape
 * ADR-0081 exists about, one layer along from where that decision found it.
 *
 * `selection-duplication.structural.test.ts` proves the roster is not a second copy. That is a
 * static text scan and never executes the component; these cases are the other half.
 */

const context = (over: Partial<SelectionBarContext> = {}): SelectionBarContext => ({
  canvas: null,
  targetName: 'Foundations',
  canEditSchedule: true,
  scheduleRefusal: () => null,
  canReportProgress: true,
  stepsEligible: false,
  isSummary: false,
  conflictKey: null,
  clearPlacement: { enabled: false, reason: 'Nothing to clear' },
  onOpenLogic: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onDissolve: vi.fn(),
  onDuplicate: vi.fn(),
  onDuplicateBand: vi.fn(),
  onResources: vi.fn(),
  onProgress: vi.fn(),
  onSteps: vi.fn(),
  onClearVisualPlacement: vi.fn(),
  onOpenEditorAt: vi.fn(),
  ...over,
});

const openMenu = (ctx = context()) => {
  render(<GanttRowMenu context={() => ctx} activityName="Foundations" />);
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Foundations' }));
  return ctx;
};

describe('the trigger', () => {
  it('names its own row, so forty rows are not forty identical buttons', () => {
    render(<GanttRowMenu context={() => context()} activityName="Piling" />);
    expect(screen.getByRole('button', { name: 'Actions for Piling' })).toBeInTheDocument();
  });

  it('is NOT a tab stop — the grid keeps one roving stop', () => {
    // Rendered once per mounted row, so a tabbable trigger means Tab visits ~40 buttons instead of
    // leaving the widget. Both sibling copies of this control set it explicitly; this one did not
    // until the M6 component gate.
    render(<GanttRowMenu context={() => context()} activityName="Piling" />);
    expect(screen.getByRole('button', { name: 'Actions for Piling' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
  });

  it('does not select the row it sits in', () => {
    // A menu press must not change the selection out from under the planner.
    //
    // A REACT handler on a real `role="row"`, which is what the grid actually has. A native
    // `addEventListener` on an ancestor was the first attempt and cannot test this: React attaches
    // at the root container, so a native listener partway up fires during the native bubble BEFORE
    // React's synthetic handler runs, and `stopPropagation` in the handler is therefore powerless
    // over it. The test would have failed against correct code.
    const onRowClick = vi.fn();
    render(
      <div role="treegrid">
        <div role="row" tabIndex={-1} onClick={onRowClick} onKeyDown={() => undefined}>
          <GanttRowMenu context={() => context()} activityName="Foundations" />
        </div>
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Foundations' }));
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe('the items', () => {
  it('offers the dock roster and none of the canvas-only actions', () => {
    openMenu();
    expect(screen.getByRole('menuitem', { name: /Report progress/ })).toBeInTheDocument();
    // `canvas: null`, so zoom-to-selection and isolate are ABSENT rather than shaded — things the
    // object cannot do in this projection, not things this reader may not do (ADR-0082's omit).
    expect(screen.queryByRole('menuitem', { name: /Zoom to selection/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Isolate logic path/ })).toBeNull();
  });

  it('invokes the registry action, not a copy of it', () => {
    const ctx = openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Report progress/ }));
    expect(ctx.onProgress).toHaveBeenCalledTimes(1);
  });

  it('shades a shut item with a reason instead of dropping it', () => {
    // ADR-0082: the option stays visible and focusable so its reason is readable by keyboard. That
    // decision's load-bearing change was making `Menu`'s roving focus reach a shaded item at all.
    openMenu(
      context({
        canEditSchedule: false,
        scheduleRefusal: () => 'Start editing to change this.',
      }),
    );
    const edit = screen.getByRole('menuitem', { name: /^Edit/ });
    expect(edit).toHaveAttribute('aria-disabled', 'true');
    expect(edit).not.toBeDisabled();
  });
});
