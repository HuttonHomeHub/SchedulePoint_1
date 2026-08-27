import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SelectionActionsBar,
  type SelectionBarContext,
  type SelectionCanvasContext,
} from './selection-actions';

/**
 * **The selection bar's canvas commands** (ADR-0090 M2-T1) — Zoom to, and Isolate logic path.
 *
 * These assertions were **re-homed, not written**. They lived in `tsld-toolbar-canvas-nav.test.tsx`
 * and `tsld-toolbar-search-nav.test.tsx` and tested the same controls on Row 1; `m2-suite-impact.md`
 * named that as the milestone's largest rewrite. Re-homing rather than rewriting is what makes the
 * milestone's own claim checkable — the behaviour of a relocated command should not change, and the
 * cheapest way to say so is for its tests to survive the journey.
 *
 * **What deliberately did NOT come across, and why**, because a silently shrinking suite is how a
 * relocation quietly becomes a removal:
 *
 * - Six shade-with-reason assertions (`'Select an activity first'`, `'Add an activity first'`,
 *   `'Only in the diagram view'`, and "does not fire while shaded"). Every one of those reasons is
 *   **unreachable here**: this bar renders only from the canvas and only for a selection, so the
 *   conditions they describe cannot occur. Keeping them would mean asserting a state the code can no
 *   longer enter — which passes forever and proves nothing. The cost of losing them is recorded in
 *   `implementation-plan.md` rather than absorbed: a planner with nothing selected no longer sees
 *   the precondition spelled out, because they no longer see the command.
 * - `tsld-toolbar-float-paths.test.tsx`'s *"shades Isolate in the Gantt"*. Isolate is now **absent**
 *   from the Gantt rather than shaded there, which is the stronger form of the same guarantee. The
 *   ADR-0059 M6 rule it defended (shade what only the canvas can do) is honoured by construction.
 */

const canvasSpies = {
  toggleIsolate: vi.fn(),
  setIsolateMode: vi.fn(),
  zoomToSelection: vi.fn(),
};

function canvas(over: Partial<SelectionCanvasContext> = {}): SelectionCanvasContext {
  return {
    isolateActive: false,
    isolateMode: 'full',
    toggleIsolate: canvasSpies.toggleIsolate,
    setIsolateMode: canvasSpies.setIsolateMode,
    zoomToSelection: canvasSpies.zoomToSelection,
    ...over,
  };
}

function ctx(over: Partial<SelectionCanvasContext> | null = {}): SelectionBarContext {
  return {
    canvas: over === null ? null : canvas(over),
    targetName: 'Excavate',
    canEditSchedule: true,
    scheduleRefusal: (action: string) => `Start editing to ${action}.`,
    canReportProgress: true,
    canWriteNotes: true,
    onNotes: vi.fn(),
    isSummary: false,
    // ADR-0094 M4: unflagged by default, so these suites stay the before/after oracle for the bar
    // they were written against — the remedy item is `isVisible`-gated on `conflictKey`.
    conflictKey: null,
    clearPlacement: { enabled: true, reason: null },
    onClearVisualPlacement: vi.fn(),
    onOpenEditorAt: vi.fn(),
    onOpenLogic: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onDissolve: vi.fn(),
    onDuplicate: vi.fn(),
    onDuplicateBand: vi.fn(),
    onResources: vi.fn(),
    onProgress: vi.fn(),
    ...(over === null ? {} : {}),
  };
}

function renderBar(context: SelectionBarContext): void {
  render(<SelectionActionsBar context={context} />);
}

beforeEach(() => vi.clearAllMocks());

describe('selection bar — Zoom to (re-homed from Row 1)', () => {
  it('frames the selection', () => {
    renderBar(ctx());
    fireEvent.click(screen.getByRole('button', { name: 'Zoom to selection' }));
    expect(canvasSpies.zoomToSelection).toHaveBeenCalledOnce();
  });

  it('is simply enabled — every Row-1 shade reason is unreachable on this surface', () => {
    renderBar(ctx());
    expect(screen.getByRole('button', { name: 'Zoom to selection' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });
});

describe('selection bar — Isolate logic path (re-homed from Row 1)', () => {
  it('starts isolation when the unpressed main button is clicked (not just open a menu)', () => {
    renderBar(ctx());
    const main = screen.getByRole('button', { name: 'Isolate logic path' });
    fireEvent.click(main);
    expect(canvasSpies.toggleIsolate).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('exits isolation when the pressed main button is clicked (toggle-off, U1)', () => {
    renderBar(ctx({ isolateActive: true, isolateMode: 'driving' }));
    const main = screen.getByRole('button', { name: 'Isolate logic path: Driving path' });
    expect(main).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(main);
    expect(canvasSpies.toggleIsolate).toHaveBeenCalledOnce();
  });

  it('opens the mode menu from the chevron (arm-vs-pick), picking Driving path', () => {
    renderBar(ctx());
    fireEvent.click(screen.getByRole('button', { name: 'Isolate logic path options' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Driving path only' }));
    expect(canvasSpies.setIsolateMode).toHaveBeenCalledWith('driving');
  });

  it('opens the mode menu from the main button via ArrowDown (keyboard parity)', () => {
    renderBar(ctx());
    fireEvent.keyDown(screen.getByRole('button', { name: 'Isolate logic path' }), {
      key: 'ArrowDown',
    });
    expect(screen.getByRole('menu', { name: 'Isolate logic path' })).toBeInTheDocument();
  });

  it('offers "Stop isolating" in the menu while active', () => {
    renderBar(ctx({ isolateActive: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Isolate logic path options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Stop isolating' }));
    expect(canvasSpies.toggleIsolate).toHaveBeenCalledOnce();
  });
});

describe('selection bar — the canvas half is optional', () => {
  /**
   * The rollback contract, and the reason `canvas` is nullable rather than a flat intersection with
   * inert defaults: a host with no canvas commands to offer renders exactly the pre-M2 bar. Verified
   * to fail if `isVisible` is dropped from either item.
   */
  it('renders neither command when the host supplies no canvas context', () => {
    renderBar(ctx(null));
    const bar = screen.getByRole('toolbar', { name: /Excavate/ });
    expect(
      within(bar).queryByRole('button', { name: 'Zoom to selection' }),
    ).not.toBeInTheDocument();
    expect(
      within(bar).queryByRole('button', { name: /^Isolate logic path/ }),
    ).not.toBeInTheDocument();
  });

  it('still renders the object actions — the two halves are independent', () => {
    renderBar(ctx(null));
    expect(screen.getByRole('button', { name: 'Logic' })).toBeInTheDocument();
  });
});
