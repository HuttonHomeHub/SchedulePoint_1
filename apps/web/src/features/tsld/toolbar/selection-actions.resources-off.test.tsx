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

import type { SelectionActionContext } from './selection-actions';

const { SelectionActionsBar } = await import('./selection-actions');

const anchorRef = { current: { top: 300, centerX: 500 } };

function ctx(): SelectionActionContext {
  return {
    targetName: 'Excavate',
    canEditSchedule: true,
    canReportProgress: true,
    stepsEligible: true,
    onOpenLogic: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onResources: vi.fn(),
    onProgress: vi.fn(),
    onSteps: vi.fn(),
  };
}

describe('SelectionActionsBar — Resources gated on VITE_RESOURCES', () => {
  it('omits Resources when RESOURCES_ENABLED=false, keeping Progress and Steps', () => {
    render(<SelectionActionsBar anchorRef={anchorRef} context={ctx()} />);
    const bar = screen.getByRole('toolbar', { name: 'Actions for Excavate' });
    expect(within(bar).queryByRole('button', { name: 'Resources' })).not.toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Report progress' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Steps' })).toBeInTheDocument();
  });
});
