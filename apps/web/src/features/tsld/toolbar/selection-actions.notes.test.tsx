import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SelectionActionsBar, type SelectionBarContext } from './selection-actions';

/**
 * **The object bar's `Notes` item** (`docs/specs/object-bar-defects/` M2).
 *
 * It arrived here from the command surface, where it was `Add note`. Three things about it are
 * worth pinning, and one of them is an absence:
 *
 *  1. **It is not pen-gated.** ADR-0046 deliberately does not pen-gate notes, so a Contributor
 *     annotates a plan somebody else is editing. Sharing the `canEditSchedule` gate would silently
 *     remove that, and it would look like tidying.
 *  2. **Its reason is the role's**, in the wording `add-note` arrived at — a reader without the
 *     right is told that, rather than misleadingly told to select something.
 *  3. **It has no "select an activity first" clause at all**, because this bar renders only with a
 *     selection. That is the move's dividend: a two-clause reason became one because the surface
 *     guarantees the other, and three of the command surface's five cases had nothing left to say.
 */
function ctx(overrides: Partial<SelectionBarContext> = {}): SelectionBarContext {
  return {
    canvas: null,
    targetName: 'Excavate',
    canEditSchedule: true,
    scheduleRefusal: (action: string) => `Start editing to ${action}.`,
    canReportProgress: true,
    canWriteNotes: true,
    isSummary: false,
    conflictKey: null,
    clearPlacement: { enabled: true, reason: null },
    onOpenLogic: vi.fn(),
    onNotes: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onResources: vi.fn(),
    onProgress: vi.fn(),
    onClearVisualPlacement: vi.fn(),
    onOpenEditorAt: vi.fn(),
    onDissolve: vi.fn(),
    onDuplicate: vi.fn(),
    onDuplicateBand: vi.fn(),
    ...overrides,
  };
}

const bar = (): HTMLElement => screen.getByRole('toolbar', { name: 'Actions for Excavate' });

describe('SelectionActionsBar — Notes', () => {
  it('sits beside Logic, where a planner last reached it', () => {
    render(<SelectionActionsBar context={ctx()} />);
    // The ACCESSIBLE NAME, not `textContent`: `Notes` carries an `srDescription`, which renders an
    // `sr-only` span inside the button, so the raw text reads "NotesAdd or read notes…". `Progress`
    // has the same shape, which is why the ordering suite next door reads `aria-label` first.
    const names = within(bar())
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names.slice(0, 2)).toEqual(['Logic', 'Notes']);
  });

  it('opens the activity notes', () => {
    const onNotes = vi.fn();
    render(<SelectionActionsBar context={ctx({ onNotes })} />);
    fireEvent.click(within(bar()).getByRole('button', { name: 'Notes' }));
    expect(onNotes).toHaveBeenCalledOnce();
  });

  it('runs WITHOUT the pen — notes are a Contributor action, not a writer one', () => {
    const onNotes = vi.fn();
    render(<SelectionActionsBar context={ctx({ canEditSchedule: false, onNotes })} />);
    const notes = within(bar()).getByRole('button', { name: 'Notes' });
    expect(notes).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(notes);
    expect(onNotes).toHaveBeenCalledOnce();
  });

  it('shades with the role reason when the viewer may not write notes', () => {
    const onNotes = vi.fn();
    render(<SelectionActionsBar context={ctx({ canWriteNotes: false, onNotes })} />);
    const notes = within(bar()).getByRole('button', { name: 'Notes' });
    expect(notes).toHaveAttribute('aria-disabled', 'true');

    // The reason is REACHABLE, not merely present (ADR-0082): shaded with a described reason rather
    // than removed, and never on the native `disabled` attribute.
    //
    // `aria-describedby` holds TWO ids here, and that is correct rather than a quirk to work around:
    // `ToolbarButton` composes the disabled reason with the `srDescription` when both apply, so a
    // shaded control leads with why it is shut and still says what it does. Splitting is what the
    // assertion has to do; collapsing to one id would pin the composition away.
    const ids = (notes.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
    expect(ids.length).toBeGreaterThan(0);
    const described = ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
    expect(described).toContain('You don’t have permission to add notes');

    fireEvent.click(notes);
    expect(onNotes).not.toHaveBeenCalled();
  });
});
