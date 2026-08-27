import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The canvas selection bar's **Duplicate** action
 * (`docs/specs/activity-copy-paste/` M1-T3), with `VITE_ACTIVITY_COPY_PASTE` forced on.
 * `selectionActionItems` is built at module-eval from the flags, so the hoisted env mock lands
 * before the import; vitest isolates the module registry per file.
 *
 * Two rules, and they are different in kind — the distinction `selection-actions.dissolve.test.tsx`
 * draws, applied to the mirror case:
 *
 * - **A summary ⇒ absent.** There is no useful copy of one leaf of a band; copying the band with
 *   its subtree is M2. Inapplicability, not a shut gate, so there is no reason to give.
 * - **No pen ⇒ present but shaded, with a reason.** The action applies; the planner just cannot
 *   perform it yet. Hiding it would make the canvas and the row menu disagree about whether
 *   duplicating is a thing this product does.
 *
 * The ordering assertion is the one a reader would not think to make: the canvas bar and the table
 * row menu are two surfaces for the same operation, and a planner who learns the order on one
 * should not have to relearn it on the other (the bar's own wording-convergence rule).
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ACTIVITY_COPY_PASTE_ENABLED: true,
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
    targetName: 'Excavate',
    canEditSchedule: true,
    scheduleRefusal: (action: string) => `Start editing to ${action}.`,
    canReportProgress: true,
    isSummary: false,
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
  return screen.getByRole('toolbar', { name: 'Actions for Excavate' });
}

function labels(): (string | null)[] {
  return within(bar())
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label') ?? b.textContent);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SelectionActionsBar — Duplicate (VITE_ACTIVITY_COPY_PASTE on)', () => {
  it('offers Duplicate on an ordinary selection and calls back', () => {
    render(<SelectionActionsBar context={ctx()} />);
    fireEvent.click(within(bar()).getByRole('button', { name: 'Duplicate' }));
    expect(spies.onDuplicate).toHaveBeenCalledTimes(1);
  });

  it('sits immediately after Edit — the same order as the table row menu', () => {
    render(<SelectionActionsBar context={ctx()} />);
    const names = labels();
    expect(names.indexOf('Duplicate')).toBe(names.indexOf('Edit') + 1);
  });

  it('is absent on a summary — a copy of one leaf of a band is not useful', () => {
    render(<SelectionActionsBar context={ctx({ isSummary: true })} />);
    expect(within(bar()).queryByRole('button', { name: 'Duplicate' })).not.toBeInTheDocument();
  });

  it('is present but shaded without the pen, and says why', () => {
    render(<SelectionActionsBar context={ctx({ canEditSchedule: false })} />);
    const button = within(bar()).getByRole('button', { name: 'Duplicate' });
    // `aria-disabled`, never the native attribute: a natively-disabled control drops focus to
    // `<body>`, which this repo has now learnt three times (ADR-0060 M6, ADR-0063 M6, ADR-0064 §7).
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(spies.onDuplicate).not.toHaveBeenCalled();
  });
});
