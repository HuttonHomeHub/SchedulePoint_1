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

import type { SelectionActionContext } from './selection-actions';

const { SelectionActionsBar } = await import('./selection-actions');

const spies = {
  onOpenLogic: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onDissolve: vi.fn(),
  onResources: vi.fn(),
  onProgress: vi.fn(),
  onSteps: vi.fn(),
};

function ctx(over: Partial<SelectionActionContext> = {}): SelectionActionContext {
  return {
    targetName: 'Substructure',
    canEditSchedule: true,
    canReportProgress: true,
    stepsEligible: true,
    isSummary: true,
    onOpenLogic: spies.onOpenLogic,
    onEdit: spies.onEdit,
    onDelete: spies.onDelete,
    onDissolve: spies.onDissolve,
    onResources: spies.onResources,
    onProgress: spies.onProgress,
    onSteps: spies.onSteps,
    ...over,
  };
}

const anchorRef = { current: { top: 300, centerX: 500 } };

function bar(): HTMLElement {
  return screen.getByRole('toolbar', { name: 'Actions for Substructure' });
}

beforeEach(() => vi.clearAllMocks());

describe('SelectionActionsBar — Dissolve (VITE_WBS_IMPROVEMENTS on)', () => {
  it('offers Dissolve on a summary and calls back', () => {
    render(<SelectionActionsBar anchorRef={anchorRef} context={ctx()} />);
    fireEvent.click(within(bar()).getByRole('button', { name: 'Dissolve' }));
    expect(spies.onDissolve).toHaveBeenCalledTimes(1);
  });

  it('sits immediately before Delete', () => {
    render(<SelectionActionsBar anchorRef={anchorRef} context={ctx()} />);
    const names = within(bar())
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names.indexOf('Dissolve')).toBe(names.indexOf('Delete') - 1);
  });

  it('is absent on a non-summary selection — there is nothing to dissolve', () => {
    render(<SelectionActionsBar anchorRef={anchorRef} context={ctx({ isSummary: false })} />);
    expect(within(bar()).queryByRole('button', { name: 'Dissolve' })).not.toBeInTheDocument();
  });

  // Shade-with-a-reason, never hide: the action applies to this object, the user just hasn't the
  // pen. Hiding it would make the canvas and the row menu disagree about what exists.
  it('shades — not hides — Dissolve without the pen, and says why', () => {
    render(<SelectionActionsBar anchorRef={anchorRef} context={ctx({ canEditSchedule: false })} />);
    // `aria-disabled`, not `disabled`: the item stays focusable so the reason is reachable by
    // keyboard — the toolbar's established convention (see the base suite's pen-gating test).
    const button = within(bar()).getByRole('button', { name: 'Dissolve' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('title', 'Start editing to change this activity');
    fireEvent.click(button);
    expect(spies.onDissolve).not.toHaveBeenCalled();
  });
});
