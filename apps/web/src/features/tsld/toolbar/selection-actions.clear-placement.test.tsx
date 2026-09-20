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
    canWriteNotes: true,
    onNotes: vi.fn(),
    isSummary: false,
    // This whole suite is about a control that only exists for a PLACED activity (M-F-T6).
    hasPlacement: true,
    conflictKey: null,
    clearPlacement: { enabled: true, reason: null },
    // Visible unless a case says otherwise — the fixtures' status quo (M1).
    onClearVisualPlacement: spies.onClearVisualPlacement,
    onOpenEditorAt: spies.onOpenEditorAt,
    onOpenLogic: spies.onOpenLogic,
    onEdit: spies.onEdit,
    onDelete: spies.onDelete,
    onResources: spies.onResources,
    onProgress: spies.onProgress,
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

  /**
   * **The reason here changed in M1, and the reason it changed is the milestone.**
   *
   * This case used to shade with `'Only available in Visual mode'`. That state is now unreachable:
   * outside Visual mode the item is **omitted** rather than shaded, because ADR-0082's omit clause
   * covers an action that does not apply to the object at all. Left alone, this test would have
   * gone on passing against a `clearPlacement` a host can no longer produce — a green assertion
   * about an impossible state, which is worse than a red one.
   *
   * The shade contract itself is unchanged and still worth pinning, so it moves to a reason that
   * genuinely occurs: the Late-start overlay, which shuts the action **inside** Visual mode.
   */
  it('is shaded with the gate’s reason — never hidden, and never native `disabled`', () => {
    render(
      <SelectionActionsBar
        context={ctx({
          clearPlacement: {
            enabled: false,
            reason: 'Turn off the Late-start overlay to clear the placement',
          },
        })}
      />,
    );
    const btn = clearButton();
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    // Native `disabled` would blur to `<body>` on a control whose state flips as a planner moves
    // between modes — the ScopeSaveBar lesson (ADR-0060 M6), re-learnt twice since.
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAccessibleDescription(
      'Turn off the Late-start overlay to clear the placement',
    );
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
  /**
   * **The omission case MOVED from the plan to the activity** (one-planning-surface M-F-T6), and
   * both halves are asserted because either alone is satisfied by the wrong thing.
   *
   * It used to assert that `Clear visual start` is omitted outside Visual mode — ADR-0082's *omit*
   * clause, because a plan scheduled Early had no hand-placed start anywhere in it. The collapse
   * removes that condition and the predicate follows the subject down a level: an activity nobody
   * has PLACED has no placement to clear.
   *
   * **The pair is the point** (ADR-0093). A suite asserting only the absence would pass equally if
   * the item had been deleted from the registry outright — "correctly omitted" and "the capability
   * is gone" are the same green — and one asserting only the presence would pass against the
   * unconditional version this milestone measured at 36 px of diagram at 1646.
   *
   * The shade cases above are untouched and still hold: a reader who does not hold the pen sees the
   * control on a placed activity, shaded, with a reason.
   */
  it('is offered when the selected activity carries a placement', () => {
    render(<SelectionActionsBar context={ctx()} />);
    expect(screen.getByRole('button', { name: /Clear visual start/i })).toBeInTheDocument();
  });

  it('is omitted when the selected activity has no placement to clear', () => {
    render(<SelectionActionsBar context={ctx({ hasPlacement: false })} />);
    expect(screen.queryByRole('button', { name: /Clear visual start/i })).toBeNull();
    // The pinned positive — without it this passes against a bar that rendered nothing at all.
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  /**
   * **`Zoom to selection` keeps its label, and this case asserted the opposite for a while.**
   *
   * M1 made it `showLabel: 'never'` because the bar needed 1037.4 px against 775.6 px at 1646 and
   * wrapped, costing the diagram 36 px. M4 then bounded the plan's facts and handed 231 px back to
   * the dock — so the container M1 chose against no longer existed, and nobody re-asked until an
   * architecture review did. Re-measured, the label fits at 1920 and 1646 (41 px in both states);
   * it costs 36 px at 1440 with a selection, and the product owner chose the label knowing that.
   *
   * The assertion is inverted rather than deleted: this control's name and its painted text are
   * both load-bearing, and an epic that moved it twice should leave something behind that fails if
   * it moves a third time by accident.
   */
  it('renders Zoom to selection with its label, and keeps its accessible name', () => {
    render(
      <SelectionActionsBar
        context={ctx({
          canvas: {
            zoomToSelection: vi.fn(),
            isolateActive: false,
            isolateMode: 'FULL',
            toggleIsolate: vi.fn(),
            pickIsolateMode: vi.fn(),
          } as unknown as SelectionBarContext['canvas'],
        })}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Zoom to selection' });
    // Both halves, for the reason the icon-only version needed both: the accessible name is
    // identical whether the label is painted or supplied through `aria-label`, so asserting the
    // name alone cannot tell the two apart. It passed against the wrong code once already.
    expect(btn).toHaveAccessibleName('Zoom to selection');
    expect(btn.textContent ?? '').toContain('Zoom to selection');
  });
});
