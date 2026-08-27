import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Entry-route (`VITE_ENTRY_ROUTES`): the canvas floating selection bar gains **Report progress**,
 * **Resources** and **Steps** actions. `selectionActionItems` is built at module-eval time from the
 * flags, so the env mock (hoisted) must be in place before the module is imported — vitest isolates the
 * module registry per test file, so this flag-on view doesn't leak into the sibling default-off suite.
 * `EARNED_VALUE`/`ACTIVITY_STEPS` (which additionally gate Steps) default on, so they come through the
 * spread real env.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ENTRY_ROUTES_ENABLED: true,
}));

import type { SelectionBarContext } from './selection-actions';

const { SelectionActionsBar } = await import('./selection-actions');

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
    stepsEligible: true,
    onOpenLogic: spies.onOpenLogic,
    onEdit: spies.onEdit,
    onDelete: spies.onDelete,
    onResources: spies.onResources,
    onProgress: spies.onProgress,
    onSteps: spies.onSteps,
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

function buttonNames(): (string | null)[] {
  const bar = screen.getByRole('toolbar', { name: 'Actions for Excavate' });
  return within(bar)
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label') ?? b.textContent);
}

beforeEach(() => vi.clearAllMocks());

describe('SelectionActionsBar — entry-route actions (flag on)', () => {
  it('orders the bar Logic → Progress → Resources → Steps → Edit → Duplicate → Delete → Clear placement', () => {
    render(<SelectionActionsBar context={ctx()} />);
    expect(buttonNames()).toEqual([
      'Logic',
      'Progress',
      'Resources',
      'Steps',
      'Edit',
      // Duplicate sits after Edit — both act on the row as it stands, and a copy is the edit a
      // planner reaches for when the row is nearly right. Present since VITE_ACTIVITY_COPY_PASTE
      // flipped default-on (W5 M5).
      'Duplicate',
      'Delete',
      // Last, because it is the rarest action on the bar and the only one inert outside Visual mode
      // — so it is the first to demote to the `⋯` under width pressure (ADR-0094 M4-T1).
      'Clear visual start',
    ]);
  });

  it('calls the entry-route handlers when their actions are clicked', () => {
    render(<SelectionActionsBar context={ctx()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Progress' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resources' }));
    fireEvent.click(screen.getByRole('button', { name: 'Steps' }));
    expect(spies.onProgress).toHaveBeenCalledOnce();
    expect(spies.onResources).toHaveBeenCalledOnce();
    expect(spies.onSteps).toHaveBeenCalledOnce();
  });

  it('Resources is NOT pen-gated — it runs even in read-only', () => {
    render(<SelectionActionsBar context={ctx({ canEditSchedule: false })} />);
    const resources = screen.getByRole('button', { name: 'Resources' });
    expect(resources).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(resources);
    expect(spies.onResources).toHaveBeenCalledOnce();
  });

  it('Report progress is role-gated (not pen-gated): disabled without permission, enabled with it', () => {
    // Read-only (no pen) but with progress permission → still enabled (progress is never pen-gated).
    render(
      <SelectionActionsBar context={ctx({ canEditSchedule: false, canReportProgress: true })} />,
    );
    const progress = screen.getByRole('button', { name: 'Progress' });
    expect(progress).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(progress);
    expect(spies.onProgress).toHaveBeenCalledOnce();
  });

  it('Report progress is disabled with a reason when the viewer lacks progress permission', () => {
    render(<SelectionActionsBar context={ctx({ canReportProgress: false })} />);
    const progress = screen.getByRole('button', { name: 'Progress' });
    expect(progress).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(progress);
    expect(spies.onProgress).not.toHaveBeenCalled();
  });

  it('hides Steps for a duration-derived (milestone/LOE/WBS) selection', () => {
    render(<SelectionActionsBar context={ctx({ stepsEligible: false })} />);
    expect(screen.queryByRole('button', { name: 'Steps' })).not.toBeInTheDocument();
  });

  it('hides Steps for a non-writer (writer authoring surface, like the table)', () => {
    render(<SelectionActionsBar context={ctx({ canEditSchedule: false })} />);
    expect(screen.queryByRole('button', { name: 'Steps' })).not.toBeInTheDocument();
  });
});
