import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SelectionActionsBar, type SelectionBarContext } from './selection-actions';
import { makeTsldToolbarContext } from './test-helpers';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { selectionActionItems } from '@/features/plan-actions/selection-actions';

/**
 * **Float paths on the selection bar, flag ON** (audit F4; moved off the command deck by
 * toolbar-redesign M2-T4, D-c).
 *
 * The assertions are the deck item's, re-homed rather than rewritten, so the relocation is checkable
 * against what the control did before:
 *
 * - it is **live in the Gantt**, because it is an analysis and not a viewport command (the ADR-0059
 *   M6 lesson inverted — shade what only the canvas can do, never what both can). Here that means
 *   it renders with `canvas: null`, the Gantt's projection of this bar;
 * - it is **never pen-gated**: it stays live with the pen not held.
 *
 * What did NOT come across: *"shades with 'Select an activity first'"* and *"shades with 'Add an
 * activity first'"*. Both reasons are unreachable on this bar, which renders only for a selected
 * activity, so they cannot occur — keeping them would assert a state the code can no longer enter.
 * The cost is the one `selection-actions.canvas.test.tsx` already records for the canvas commands:
 * a planner with nothing selected no longer sees the precondition spelled out, because they no
 * longer see the command. *"stays ENABLED on a plan that has never been recalculated"* has no
 * counterpart either: the item reads no `hasDiagram`, and the context it is built from has none.
 *
 * The flag-off shape (the item **absent**, not a "Coming soon" stub) is pinned by the parity suite
 * in `features/float-paths`.
 */

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  FLOAT_PATHS_ENABLED: true,
  CANVAS_NAV_ENABLED: true,
}));

const toggleFloatPaths = vi.fn();

function ctx(over: Partial<SelectionBarContext> = {}): SelectionBarContext {
  return {
    canvas: null,
    targetName: 'Excavate',
    definitionGate: null,
    makeMilestone: { applies: false },
    onMakeMilestone: vi.fn(),
    floatPathsOpen: false,
    toggleFloatPaths,
    canEditSchedule: true,
    scheduleRefusal: (action: string) => `Start editing to ${action}.`,
    canReportProgress: true,
    canWriteNotes: true,
    onNotes: vi.fn(),
    isSummary: false,
    hasPlacement: false,
    conflictKey: null,
    conflictKeys: [],
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
    ...over,
  };
}

const floatPathsButton = () => screen.getByRole('button', { name: /float paths/i });

beforeEach(() => vi.clearAllMocks());

describe('selection bar — Float paths (flag on)', () => {
  it('opens the analysis when activated', () => {
    render(<SelectionActionsBar context={ctx()} />);
    fireEvent.click(floatPathsButton());
    expect(toggleFloatPaths).toHaveBeenCalledOnce();
  });

  it('carries the panel open state as aria-pressed, and closes when pressed again', () => {
    render(<SelectionActionsBar context={ctx({ floatPathsOpen: true })} />);
    expect(floatPathsButton()).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(floatPathsButton());
    expect(toggleFloatPaths).toHaveBeenCalledOnce();
  });

  it('is not pressed while the panel is closed', () => {
    render(<SelectionActionsBar context={ctx()} />);
    expect(floatPathsButton()).toHaveAttribute('aria-pressed', 'false');
  });

  it('stays live in the Gantt view — it is an analysis, not a canvas viewport command', () => {
    // `canvas: null` is the Gantt's projection of this bar: the two canvas-only items drop out and
    // this one does not.
    render(<SelectionActionsBar context={ctx({ canvas: null })} />);
    expect(screen.queryByRole('button', { name: /zoom to selection/i })).not.toBeInTheDocument();
    expect(floatPathsButton()).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('is never pen-gated: it stays live when the pen is not held', () => {
    render(<SelectionActionsBar context={ctx({ canEditSchedule: false })} />);
    expect(floatPathsButton()).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('is omitted, not lit and inert, when the host has no panel to open', () => {
    render(<SelectionActionsBar context={ctx({ toggleFloatPaths: null })} />);
    expect(screen.queryByRole('button', { name: /float paths/i })).not.toBeInTheDocument();
  });
});

describe('the command deck no longer carries Float paths', () => {
  it('registers nothing under the id, and the selection bar is where it lives', () => {
    // The move's other half: a deck item left behind would be one control with two homes, which is
    // the ADR-0093 defect, and `selection-duplication.structural.test.ts` would also fail on it.
    expect(buildTsldToolbarItems().map((item) => item.id)).not.toContain('float-paths');
    expect(selectionActionItems.map((item) => item.id)).toContain('float-paths');
    expect(makeTsldToolbarContext()).not.toHaveProperty('toggleFloatPaths');
  });
});
