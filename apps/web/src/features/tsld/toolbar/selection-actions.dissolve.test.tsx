import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The canvas selection bar's **Dissolve** action (WBS improvements M2), with
 * `VITE_WBS_IMPROVEMENTS` forced on. `selectionActionItems` is built at module-eval from the flags,
 * so the hoisted env mock lands before the import; vitest isolates the module registry per file.
 *
 * The two rules this pins are different in kind, and conflating them is the defect the plan warned
 * about (the ADR-0059 M6 lit-but-inert zoom control, inverted):
 *
 * - **Not a summary ⇒ absent.** There is no grouping to dissolve. This is inapplicability, not a
 *   shut gate, and there is no reason to give.
 * - **No pen ⇒ present but shaded, with a reason.** The action applies; the user just cannot
 *   perform it yet. Hiding it here would make the canvas and the row menu disagree about whether
 *   the action exists.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  WBS_IMPROVEMENTS_ENABLED: true,
}));

import type { SelectionBarContext } from './selection-actions';

const { SelectionActionsBar } = await import('./selection-actions');

const spies = {
  onOpenLogic: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onDissolve: vi.fn(),
  onDuplicate: vi.fn(),
  onDuplicateBand: vi.fn(),
  onResources: vi.fn(),
  onProgress: vi.fn(),
};

function ctx(over: Partial<SelectionBarContext> = {}): SelectionBarContext {
  return {
    // No canvas half by default (ADR-0090 M2-T1) — these suites are about the OBJECT actions, and
    // `canvas: null` is exactly the pre-M2 bar, which keeps them the before/after oracle. The
    // canvas commands have their own suite.
    canvas: null,
    targetName: 'Substructure',
    canEditSchedule: true,
    scheduleRefusal: (action: string) => `Start editing to ${action}.`,
    canReportProgress: true,
    canWriteNotes: true,
    onNotes: vi.fn(),
    isSummary: true,
    // ADR-0094 M4: unflagged by default, so these suites stay the before/after oracle for the bar
    // they were written against — the remedy item is `isVisible`-gated on `conflictKey`.
    conflictKey: null,
    clearPlacement: { enabled: true, reason: null },
    onClearVisualPlacement: vi.fn(),
    onOpenEditorAt: vi.fn(),
    onOpenLogic: spies.onOpenLogic,
    onEdit: spies.onEdit,
    onDelete: spies.onDelete,
    onDissolve: spies.onDissolve,
    onDuplicate: spies.onDuplicate,
    onDuplicateBand: spies.onDuplicateBand,
    onResources: spies.onResources,
    onProgress: spies.onProgress,
    ...over,
  };
}

function bar(): HTMLElement {
  return screen.getByRole('toolbar', { name: 'Actions for Substructure' });
}

beforeEach(() => vi.clearAllMocks());

describe('SelectionActionsBar — Dissolve (VITE_WBS_IMPROVEMENTS on)', () => {
  it('offers Dissolve on a summary and calls back', () => {
    render(<SelectionActionsBar context={ctx()} />);
    fireEvent.click(within(bar()).getByRole('button', { name: 'Dissolve' }));
    expect(spies.onDissolve).toHaveBeenCalledTimes(1);
  });

  it('sits immediately before Delete', () => {
    render(<SelectionActionsBar context={ctx()} />);
    const names = within(bar())
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names.indexOf('Dissolve')).toBe(names.indexOf('Delete') - 1);
  });

  it('is absent on a non-summary selection — there is nothing to dissolve', () => {
    render(<SelectionActionsBar context={ctx({ isSummary: false })} />);
    expect(within(bar()).queryByRole('button', { name: 'Dissolve' })).not.toBeInTheDocument();
  });

  // Shade-with-a-reason, never hide: the action applies to this object, the user just hasn't the
  // pen. Hiding it would make the canvas and the row menu disagree about what exists.
  it('shades — not hides — Dissolve without the pen, and says why', () => {
    render(<SelectionActionsBar context={ctx({ canEditSchedule: false })} />);
    // `aria-disabled`, not `disabled`: the item stays focusable so the reason is reachable by
    // keyboard — the toolbar's established convention (see the base suite's pen-gating test).
    const button = within(bar()).getByRole('button', { name: 'Dissolve' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('title', 'Start editing to change this activity.');
    fireEvent.click(button);
    expect(spies.onDissolve).not.toHaveBeenCalled();
  });
});
