import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SelectionActionsBar, type SelectionBarContext } from './selection-actions';

/**
 * **The remedy as a planner meets it** (ADR-0094 M4-T2).
 *
 * `conflict-remedy.structural.test.ts` proves the map is total and its `barAction` pointer resolves;
 * `conflict-remedy.gate.test.ts` proves the placement gate. Neither renders anything, and until this
 * file existed **nothing did** — every `selection-actions.*` fixture set `conflictKey: null` to
 * satisfy the type, so a swapped label, an inverted visibility branch or an `onOpenEditorAt` called
 * with the wrong tab would have passed the whole suite.
 *
 * Two independent reviews of the epic's own diff called that blocking, and both were right for the
 * reason the plan itself had written down: M4-T2's definition of done says "one case per key; the
 * multi-flag precedence case; the shut-with-reason path". The pure half had them and the rendered
 * half had none — which is ADR-0081's shape, a milestone whose tests validate everything except
 * whether a planner can reach it.
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

const bar = () => screen.getByRole('toolbar', { name: 'Actions for Excavate' });
const remedy = () => bar().querySelector('[data-toolbar-item="conflict-remedy"]');

beforeEach(() => vi.clearAllMocks());

describe('the conflict remedy on the selection bar', () => {
  it('offers nothing for an unflagged activity — omitted, not shaded', () => {
    // ADR-0082's discriminating rule: omit when the action does not apply to the OBJECT. There is no
    // conflict here, so there is nothing a reason could usefully say.
    render(<SelectionActionsBar context={ctx()} />);
    expect(remedy()).toBeNull();
  });

  it('routes a constraint conflict to the Scheduling tab', () => {
    render(<SelectionActionsBar context={ctx({ conflictKey: 'constraintViolated' })} />);
    const button = within(bar()).getByRole('button', { name: 'Review the constraint…' });
    fireEvent.click(button);
    expect(spies.onOpenEditorAt).toHaveBeenCalledWith('constraint');
  });

  it('routes a levelling conflict to the Resources tab', () => {
    render(<SelectionActionsBar context={ctx({ conflictKey: 'levelingWindowExceeded' })} />);
    fireEvent.click(within(bar()).getByRole('button', { name: 'Review resources…' }));
    expect(spies.onOpenEditorAt).toHaveBeenCalledWith('resources');
  });

  it('renders NO remedy control for a visual-placement conflict', () => {
    // The load-bearing negative, and the one the structural test cannot make. That remedy is a
    // `barAction` pointing at `clear-visual-placement`, which the bar already carries — rendering a
    // conflict-flavoured twin beside it would be ADR-0093's defect reproduced inside one surface.
    render(<SelectionActionsBar context={ctx({ conflictKey: 'visualConflict' })} />);
    expect(remedy()).toBeNull();
    expect(
      within(bar()).getAllByRole('button', { name: 'Clear visual placement' }),
      'exactly one control clears a placement, and it is the bar’s own item',
    ).toHaveLength(1);
  });

  it('marks the bar’s own clear action as the remedy when it IS the remedy', () => {
    // The ux gate's blocking finding. The two route remedies render first with a conflict icon;
    // this one sits last with a neutral eraser, so a planner who landed here by pressing Next
    // conflict had nine controls and no signal. The icon carries it — a per-context ORDER would
    // move controls under the cursor as the selection changes.
    const conflicted = render(
      <SelectionActionsBar context={ctx({ conflictKey: 'visualConflict' })} />,
    );
    const withAlert = conflicted.container.querySelector(
      '[data-toolbar-item="clear-visual-placement"] .lucide-triangle-alert',
    );
    expect(
      withAlert,
      'the clear action wears the conflict icon when it answers one',
    ).not.toBeNull();

    conflicted.unmount();
    render(<SelectionActionsBar context={ctx()} />);
    expect(
      bar().querySelector('[data-toolbar-item="clear-visual-placement"] .lucide-triangle-alert'),
      'and wears the neutral one otherwise — an alert on every activity says nothing',
    ).toBeNull();
  });

  it('is not pen-gated, because opening the editor is a read', () => {
    // A Viewer looking at a flagged bar must still be able to see WHAT is wrong with it. Shading the
    // route would be the dead end ADR-0082 exists to prevent, not an application of it — the editor
    // gates every write it offers (ADR-0060's per-scope save).
    render(
      <SelectionActionsBar
        context={ctx({ conflictKey: 'constraintViolated', canEditSchedule: false })}
      />,
    );
    const button = within(bar()).getByRole('button', { name: 'Review the constraint…' });
    expect(button).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(spies.onOpenEditorAt).toHaveBeenCalledWith('constraint');
  });
});
