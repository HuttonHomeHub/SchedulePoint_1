import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SelectionActionsBar, type SelectionBarContext } from './selection-actions';

/**
 * **Clear visual start, on the surface it moved to** (ADR-0094 M4-T1).
 *
 * The gate's four conditions and their precedence are `conflict-remedy.gate.test.ts` — a pure
 * function, one call site away. What is left for a rendered test is the half that only exists here:
 * that the item is **present and shaded with its reason** rather than hidden (ADR-0082), and that
 * the reason arrives as a description rather than being folded into the accessible name.
 *
 * This split is why the move was cheap. The old command-surface suite mounted two whole toolbar rows
 * and opened the `⋯` to assert a string comparison, which is four moving parts to prove one.
 */
const spies = {
  onOpenLogic: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onResources: vi.fn(),
  onProgress: vi.fn(),
  onSteps: vi.fn(),
  onDissolve: vi.fn(),
  onDuplicate: vi.fn(),
  onDuplicateBand: vi.fn(),
  onClearVisualPlacement: vi.fn(),
  onOpenEditorAt: vi.fn(),
};

function ctx(over: Partial<SelectionBarContext> = {}): SelectionBarContext {
  return {
    canvas: null,
    targetName: 'Excavate',
    canEditSchedule: true,
    scheduleRefusal: (action: string) => `Start editing to ${action}.`,
    canReportProgress: true,
    stepsEligible: true,
    isSummary: false,
    conflictKey: null,
    clearPlacement: { enabled: true, reason: null },
    onClearVisualPlacement: spies.onClearVisualPlacement,
    onOpenEditorAt: spies.onOpenEditorAt,
    onOpenLogic: spies.onOpenLogic,
    onEdit: spies.onEdit,
    onDelete: spies.onDelete,
    onResources: spies.onResources,
    onProgress: spies.onProgress,
    onSteps: spies.onSteps,
    onDissolve: spies.onDissolve,
    onDuplicate: spies.onDuplicate,
    onDuplicateBand: spies.onDuplicateBand,
    ...over,
  };
}

const clearButton = (): HTMLElement =>
  within(screen.getByRole('toolbar', { name: 'Actions for Excavate' })).getByRole('button', {
    name: 'Clear visual start',
  });

beforeEach(() => vi.clearAllMocks());

describe('Clear visual start on the selection bar', () => {
  it('clears the placement when the gate is open', () => {
    render(<SelectionActionsBar context={ctx()} />);
    const btn = clearButton();
    expect(btn).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(spies.onClearVisualPlacement).toHaveBeenCalledOnce();
  });

  it('is shaded with the gate’s reason — never hidden, and never native `disabled`', () => {
    render(
      <SelectionActionsBar
        context={ctx({
          clearPlacement: { enabled: false, reason: 'Only available in Visual mode' },
        })}
      />,
    );
    const btn = clearButton();
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    // Native `disabled` would blur to `<body>` on a control whose state flips as a planner moves
    // between modes — the ScopeSaveBar lesson (ADR-0060 M6), re-learnt twice since.
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAccessibleDescription('Only available in Visual mode');
    // The reason is a description, not part of the name: "Clear visual start, Only available in
    // Visual mode, button" is how a folded reason reads, and it makes the action unfindable by name.
    expect(btn).toHaveAccessibleName('Clear visual start');
    fireEvent.click(btn);
    expect(spies.onClearVisualPlacement).not.toHaveBeenCalled();
  });

  it('is shaded rather than absent for a Viewer, so the refusal is readable', () => {
    render(
      <SelectionActionsBar
        context={ctx({
          canEditSchedule: false,
          clearPlacement: { enabled: false, reason: 'Start editing to clear the placement.' },
        })}
      />,
    );
    expect(clearButton()).toHaveAccessibleDescription('Start editing to clear the placement.');
  });
});
