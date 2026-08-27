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
    conflictKey: null,
    clearPlacement: { enabled: true, reason: null },
    // Visible unless a case says otherwise — the fixtures' status quo (M1).
    clearPlacementApplies: true,
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
   * **M1: omitted outside Visual mode, not shaded** (foot-row-and-deck epic).
   *
   * The suite above pins the ADR-0082 SHADE case and its docblock calls that "rather than hidden".
   * That is still right for every reason the gate can give **except one**: outside Visual mode the
   * action does not apply to the plan at all, which is ADR-0082's own *omit* clause, not its shade
   * clause. The two cases live side by side here so the distinction is visible to the next reader
   * rather than inferred.
   *
   * Measured, it is also load-bearing: the control is 146 px of a row that needs 1037.4 px and is
   * given 775.6 px at 1646, where the resulting wrap costs the diagram 36 px
   * (`docs/specs/workspace-foot-and-deck/m0-measurement.md`).
   *
   * **Verified red**: with `isVisible` removed from the registry entry, the first case fails on the
   * control still being found. The second case is the pinned positive — without it, deleting the
   * item outright would pass the first assertion just as well, which is the ADR-0093 lesson about a
   * green suite that cannot tell "the duplicate is gone" from "the capability is gone".
   */
  it('is omitted entirely when the plan is not in Visual mode', () => {
    render(
      <SelectionActionsBar
        context={ctx({
          clearPlacementApplies: false,
          clearPlacement: { enabled: false, reason: 'Only available in Visual mode' },
        })}
      />,
    );
    expect(screen.queryByRole('button', { name: /Clear visual start/i })).toBeNull();
  });

  /**
   * **M1: `Zoom to selection` is icon-only, and its name must survive the label going.**
   *
   * `showLabel: 'never'` is exactly what ADR-0090 M3-T2 tried and reverted — but that revert
   * happened to four items carrying **no `icon`**, which rendered as blank 16 px buttons and failed
   * WCAG 2.5.8. This item has `Crosshair`, and `ToolbarButton` pins the accessible name to
   * `aria-label` when the label is hidden. Asserting the NAME rather than the absence of text is
   * the point: a button that is merely unlabelled passes any check that looks for missing copy.
   */
  it('renders Zoom to selection icon-only, and keeps its accessible name', () => {
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
    // **The name assertion alone proves nothing** — it is identical whether the label is rendered
    // beside the icon or supplied through `aria-label`, so it passed against the old
    // `showLabel: 'always'` when this case was first written. Verified red only once the VISIBLE
    // text is asserted absent as well. That is the pairing the whole case turns on: the width comes
    // from the painted label going, and the reachability comes from the name staying.
    expect(btn).toHaveAccessibleName('Zoom to selection');
    expect(btn.textContent ?? '').not.toContain('Zoom to selection');
  });
});
