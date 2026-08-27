import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Entry-route: the selection-bar **Resources** item rides `VITE_RESOURCES` as well as `VITE_ENTRY_ROUTES`
 * (matching the activities-table row action + the dialog mount). With `VITE_ENTRY_ROUTES` on but
 * `VITE_RESOURCES` off, Resources must be absent while Progress + Steps (which don't need it) stay.
 * `selectionActionItems` is built at module-eval from the flags, so the hoisted env mock lands before the
 * import; vitest isolates the module registry per file, so this view doesn't leak.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ENTRY_ROUTES_ENABLED: true,
  RESOURCES_ENABLED: false,
}));

import type { SelectionBarContext } from './selection-actions';

const { SelectionActionsBar } = await import('./selection-actions');

function ctx(): SelectionBarContext {
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
    onOpenLogic: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onResources: vi.fn(),
    onProgress: vi.fn(),
    onSteps: vi.fn(),
    isSummary: false,
    // ADR-0094 M4: unflagged by default, so these suites stay the before/after oracle for the bar
    // they were written against — the remedy item is `isVisible`-gated on `conflictKey`.
    conflictKey: null,
    clearPlacement: { enabled: true, reason: null },
    onClearVisualPlacement: vi.fn(),
    onOpenEditorAt: vi.fn(),
    onDissolve: vi.fn(),
    onDuplicate: vi.fn(),
    onDuplicateBand: vi.fn(),
  };
}

describe('SelectionActionsBar — Resources gated on VITE_RESOURCES', () => {
  it('omits Resources when RESOURCES_ENABLED=false, keeping Progress and Steps', () => {
    render(<SelectionActionsBar context={ctx()} />);
    const bar = screen.getByRole('toolbar', { name: 'Actions for Excavate' });
    expect(within(bar).queryByRole('button', { name: 'Resources' })).not.toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Progress' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Steps' })).toBeInTheDocument();
  });
});
