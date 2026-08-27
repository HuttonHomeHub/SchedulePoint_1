import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

// This is the BASE / flag-OFF suite for the selection bar: pin `VITE_ENTRY_ROUTES` off (it now defaults
// ON) so `selectionActionItems` is built with only the three base actions — the entry-route additions
// (Progress/Resources/Steps) have their own flag-on suites (selection-actions.entry-routes / .resources-off).
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ENTRY_ROUTES_ENABLED: false,
}));

import { SelectionActionsBar, type SelectionBarContext } from './selection-actions';

const spies = {
  onOpenLogic: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onResources: vi.fn(),
  onProgress: vi.fn(),
  onDissolve: vi.fn(),
  onDuplicate: vi.fn(),
  onDuplicateBand: vi.fn(),
};

function ctx(over: Partial<SelectionBarContext> = {}): SelectionBarContext {
  return {
    // No canvas half by default (ADR-0090 M2-T1) — these suites are about the OBJECT actions, and
    // `canvas: null` is exactly the pre-M2 bar, which keeps them the before/after oracle. The
    // canvas commands have their own suite.
    canvas: null,
    targetName: 'Excavate',
    canEditSchedule: true,
    scheduleRefusal: (action: string) => `Start editing to ${action}.`,
    canReportProgress: true,
    onOpenLogic: spies.onOpenLogic,
    onEdit: spies.onEdit,
    onDelete: spies.onDelete,
    onResources: spies.onResources,
    onProgress: spies.onProgress,
    isSummary: false,
    // ADR-0094 M4: unflagged by default, so these suites stay the before/after oracle for the bar
    // they were written against — the remedy item is `isVisible`-gated on `conflictKey`.
    conflictKey: null,
    clearPlacement: { enabled: true, reason: null },
    onClearVisualPlacement: vi.fn(),
    onOpenEditorAt: vi.fn(),
    onDissolve: spies.onDissolve,
    onDuplicate: spies.onDuplicate,
    onDuplicateBand: spies.onDuplicateBand,
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('SelectionActionsBar (floating selection actions)', () => {
  it('renders nothing when nothing is selected', () => {
    const { container } = render(<SelectionActionsBar context={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('shows the object actions for the selected activity, named after it (table vocabulary)', () => {
    render(<SelectionActionsBar context={ctx()} />);
    const bar = screen.getByRole('toolbar', { name: 'Actions for Excavate' });
    // Wording converged with the activities table: Logic / Edit / Delete (not the old verbose labels).
    expect(within(bar).getByRole('button', { name: 'Logic' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'Open logic' })).not.toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'Edit activity' })).not.toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'Delete activity' })).not.toBeInTheDocument();
  });

  it('registers only the base actions when VITE_ENTRY_ROUTES is off', () => {
    // This suite pins ENTRY_ROUTES off, so the Progress/Resources/Steps items are absent. Duplicate
    // is NOT one of those — it rides `VITE_ACTIVITY_COPY_PASTE`, default-on since W5 M5 — and
    // Clear visual start is not either: ADR-0094 M4-T1 moved it here from the command surface,
    // where its `isEnabled` had always consulted the selection (ADR-0093's discriminator). So the
    // base set is Logic → Edit → Duplicate → Delete → Clear visual start. Asserting a bare count
    // here would have gone red on each flip and said nothing about why; naming the members says
    // which item arrived.
    render(<SelectionActionsBar context={ctx()} />);
    const bar = screen.getByRole('toolbar', { name: 'Actions for Excavate' });
    // `'Steps'` was in this list and is not any more: it is absent unconditionally now
    // (`docs/specs/object-bar-defects/` M1), so asserting it here would read as a flag gate on an
    // item that no longer has one — true, and about the wrong thing.
    for (const name of ['Progress', 'Resources']) {
      expect(within(bar).queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(
      within(bar)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Logic', 'Edit', 'Duplicate', 'Delete', 'Clear visual start']);
  });

  it('runs the read action (logic) even in read-only', () => {
    render(<SelectionActionsBar context={ctx({ canEditSchedule: false })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Logic' }));
    expect(spies.onOpenLogic).toHaveBeenCalledOnce();
  });

  it('pen-gates the mutating actions as a set when editing is not allowed', () => {
    render(<SelectionActionsBar context={ctx({ canEditSchedule: false })} />);
    for (const name of ['Edit', 'Delete']) {
      const btn = screen.getByRole('button', { name });
      expect(btn).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(btn);
    }
    expect(spies.onEdit).not.toHaveBeenCalled();
    expect(spies.onDelete).not.toHaveBeenCalled();
  });

  it('runs the mutating actions when editing is allowed', () => {
    render(<SelectionActionsBar context={ctx({ canEditSchedule: true })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(spies.onEdit).toHaveBeenCalledOnce();
    expect(spies.onDelete).toHaveBeenCalledOnce();
  });

  it('has no axe violations', async () => {
    render(<SelectionActionsBar context={ctx()} />);
    expect((await axe(screen.getByRole('toolbar'))).violations).toEqual([]);
  });
});

/**
 * **Deselecting is not an unmount, and that distinction is the whole of this case.**
 *
 * The host renders `SelectionActionsBar` whenever `showDiagram && selectionActionsWired` — neither
 * of which changes when a planner deselects — and passes `context: null`. The component's own
 * `if (!context) return null` then removes the bar on an ordinary re-render, with no unmount and
 * therefore no effect cleanup unless the effect is keyed on `context`.
 *
 * It was not, for one commit: the cleanup that hands focus back was keyed on the referentially
 * stable `restoreFocus` alone, so it ran only on a true unmount that ordinary interaction never
 * causes. Focus fell to `<body>`, which also silently disables the workspace accelerators (Ctrl+Z
 * among them) — the WCAG 2.4.3 failure ADR-0080's journey found for the bulk delete, reappearing
 * against a docblock that claimed to have fixed it. Found by the accessibility gate over this
 * epic's diff.
 *
 * Verified red first: with `[restoreFocus]` as the dependency array, `restore` is never called.
 */
describe('the bar hands focus back when the selection goes', () => {
  it('calls restoreFocus on DESELECT, not only on unmount, when it holds focus', () => {
    const restore = vi.fn();
    const { rerender } = render(<SelectionActionsBar context={ctx()} restoreFocus={restore} />);
    // Put focus inside the bar, the way a keyboard planner Tabbing into it would.
    const button = screen.getByRole('button', { name: /Edit/ });
    button.focus();
    expect(button).toHaveFocus();

    // Deselect: same component, `context: null`. No unmount.
    rerender(<SelectionActionsBar context={null} restoreFocus={restore} />);
    expect(restore).toHaveBeenCalledOnce();
  });

  it('does not call restoreFocus when focus was elsewhere', () => {
    // The handoff is a repair for a focus that is about to be dropped. Firing it unconditionally
    // would yank a planner out of whatever they were actually using.
    const restore = vi.fn();
    const { rerender } = render(<SelectionActionsBar context={ctx()} restoreFocus={restore} />);
    rerender(<SelectionActionsBar context={null} restoreFocus={restore} />);
    expect(restore).not.toHaveBeenCalled();
  });
});
