import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GANTT_ROW_HEIGHT, GanttPanel } from './GanttPanel';

import type { SelectionBarContext } from '@/features/plan-actions/selection-actions';
import { anActivity } from '@/test/activity-fixture';

/**
 * **The row menu opens from the keyboard — WCAG 2.1.1.**
 *
 * The `⋯` trigger is `tabIndex={-1}`, correctly: the grid is ONE roving tab stop, and a per-row
 * tab stop would make Tab traverse forty buttons instead of leaving the widget. That decision was
 * paid for by a comment saying keyboard users reach the same actions through the row's selection,
 * which opens the docked bar — **true when M5-T3 shipped**, because every item then came from the
 * shared roster.
 *
 * M5-T4/T5 made it false. Indent, Outdent and Insert exist ONLY in this menu, by design: the docked
 * bar cannot honour them. So the milestone's headline capability had no keyboard path at all, and a
 * justification that had been correct became a false statement about the code beside it — the shape
 * this register keeps recording, here inside the very diff that closed the milestone.
 *
 * `ContextMenu` / `Shift+F10` is the APG answer and the pattern `HierarchyTree` already ships
 * (`HierarchyTree.tsx:224-233`). Verified RED before the handler was added.
 */

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * GANTT_ROW_HEIGHT,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * GANTT_ROW_HEIGHT,
        size: GANTT_ROW_HEIGHT,
      })),
    scrollToIndex: () => {},
  }),
}));

const ROWS = [
  anActivity({ id: 'a', name: 'Excavate' }),
  anActivity({ id: 'b', name: 'Pour slab' }),
];

/** A resolved context — the menu only opens once `context()` returns one (`open` needs both). */
const rowContext = (): SelectionBarContext => ({
  canvas: null,
  targetName: 'Excavate',
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
});

function renderGrid() {
  render(
    <GanttPanel
      activities={ROWS}
      rowMenuContextFor={rowContext}
      rowStructure={{
        canEditSchedule: true,
        penRefusal: null,
        onReparent: () => {},
        onInsert: () => {},
      }}
    />,
  );
  return screen.getByRole('treegrid');
}

describe('the Gantt row menu, from the keyboard', () => {
  it('opens on Shift+F10 for the focused row', () => {
    const grid = renderGrid();
    fireEvent.focus(grid);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.keyDown(grid, { key: 'F10', shiftKey: true });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    // The structure gestures are the whole point: they exist in NO other surface, so if this menu
    // is unreachable they are unreachable.
    const items = screen.getAllByRole('menuitem').map((el) => el.textContent ?? '');
    // Indent/Outdent/Insert are the whole point: they exist in NO other surface, so a menu that
    // cannot be opened from the keyboard makes them keyboard-unreachable outright.
    expect(items.some((t) => t.includes('Indent'))).toBe(true);
    expect(items.some((t) => t.includes('Outdent'))).toBe(true);
    expect(items.some((t) => t.includes('Insert activity below'))).toBe(true);
  });

  it('opens on the dedicated ContextMenu key too', () => {
    const grid = renderGrid();
    fireEvent.focus(grid);
    fireEvent.keyDown(grid, { key: 'ContextMenu' });
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('lets Enter reach a menu item instead of hijacking it for row selection', () => {
    // **React events follow the React TREE, not the DOM tree.** The menu portals to `document.body`,
    // so it is nowhere near the row in the DOM — and an item's Enter still propagates into the
    // row's own `onKeyDown`, which called `preventDefault()` unconditionally and suppressed the
    // `<button>`'s native activation. Every item was dead to Enter for every keyboard user, however
    // they had opened the menu; the `⋯` trigger was dead the same way.
    //
    // Found by `e2e-gantt-editing`'s keyboard case on its first run — the menu opened and stayed
    // open. Asserted here as the MECHANISM rather than the outcome: jsdom does not perform the
    // browser's Enter-activates-a-button default at all, so "the menu closed" cannot distinguish
    // the fix from the defect. `defaultPrevented` is exactly what the browser consults.
    const grid = renderGrid();
    fireEvent.focus(grid);
    fireEvent.keyDown(grid, { key: 'F10', shiftKey: true });

    const indent = screen.getByRole('menuitem', { name: 'Indent' });
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    indent.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('still activates the ROW itself on Enter, which is what the guard must not cost', () => {
    // The guard bails on keys from controls inside the row. It must not bail on the row's own key,
    // or selecting a row from the keyboard breaks — a fix that trades one 2.1.1 failure for another.
    const grid = renderGrid();
    fireEvent.focus(grid);
    const row = screen.getAllByRole('row')[1];
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    row?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not swallow the key when no menu is rendered', () => {
    // Without `rowMenuContextFor` there is no menu at all, and a keystroke that consumes itself to
    // show nothing reads as a broken control rather than an absent feature.
    render(<GanttPanel activities={ROWS} />);
    const grid = screen.getByRole('treegrid');
    fireEvent.focus(grid);
    fireEvent.keyDown(grid, { key: 'F10', shiftKey: true });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
