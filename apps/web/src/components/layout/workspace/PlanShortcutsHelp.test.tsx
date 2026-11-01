import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlanShortcutsHelp } from './PlanShortcutsHelp';

/**
 * **The sheet this file tests had no test at all, and a comment said twice that it did.**
 *
 * `TsldPanel.a11y.test.tsx` was rewritten when #137 moved the sheet out of the panel, and its new
 * docblock justified asserting only the *request* by citing two places the dialog was supposedly
 * covered: this file — which did not exist — and `e2e-gantt-editing/view-state.spec.ts`, which
 * contains no reference to a shortcut at all. Both citations were written by the author of the
 * change, in the commit that made them false, and neither was checked.
 *
 * That is ADR-0076 Class 3 (a claim asserted and never verified) landing inside the diff whose own
 * commit message invoked the discipline, and it was found by the 2026-08-18 reconciliation pass's
 * component gate rather than by anything failing. The honest repair is the test, not a softer
 * sentence — so the Gantt branch this milestone ADDED, which had no coverage in any layer, is what
 * these cases exercise first.
 */

describe('the plan shortcuts sheet', () => {
  it('shows the GANTT bindings, named for that view, when the chart is on screen', () => {
    render(<PlanShortcutsHelp open onClose={() => {}} editingEnabled view="gantt" />);
    // The title has to name the view: the two sheets share key NAMES and not meanings — Enter opens
    // the logic editor on the canvas and commits a cell edit in the grid — so a reader who cannot
    // tell which sheet they have been given is worse off than one with no sheet.
    expect(
      screen.getByRole('dialog', { name: 'Gantt shortcuts and gestures' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Navigate' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Edit' })).toBeInTheDocument();
  });

  it('teaches the Gantt start-edge route: the Start cell, or the bar’s left end', () => {
    // The keyboard route already existed (ADR-0134) and no sheet said so. Stated as a route, not a
    // new chord: the sheet must not invent a binding the product does not have.
    render(<PlanShortcutsHelp open onClose={() => {}} editingEnabled view="gantt" />);
    expect(screen.getByText('F2 on the Start cell (or double-click it)')).toBeInTheDocument();
    expect(screen.getByText(/keeping the finish/)).toBeInTheDocument();
  });

  it('withholds the Edit section in the Gantt when editing is not enabled', () => {
    // A shaded or absent section, never a list of keys that do nothing — the lit-but-inert shape.
    render(<PlanShortcutsHelp open onClose={() => {}} editingEnabled={false} view="gantt" />);
    expect(
      screen.getByRole('dialog', { name: 'Gantt shortcuts and gestures' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Navigate' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('defaults to the DIAGRAM sheet, so a host that forgets the prop is not shown an empty one', () => {
    render(<PlanShortcutsHelp open onClose={() => {}} editingEnabled />);
    expect(
      screen.getByRole('dialog', { name: 'Diagram shortcuts and gestures' }),
    ).toBeInTheDocument();
  });

  it('renders nothing while closed', () => {
    render(<PlanShortcutsHelp open={false} onClose={() => {}} editingEnabled view="gantt" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('the undo/redo rows (undo-redo M5)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lists the Windows/Linux chords, and the text-box exception, in both views', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    for (const view of ['tsld', 'gantt'] as const) {
      const { unmount } = render(
        <PlanShortcutsHelp open onClose={() => {}} editingEnabled view={view} />,
      );
      expect(screen.getByText('Ctrl + Z')).toBeInTheDocument();
      expect(screen.getByText('Ctrl + Y · Ctrl + Shift + Z')).toBeInTheDocument();
      expect(screen.getByText('Undo your typing, not the plan')).toBeInTheDocument();
      unmount();
    }
  });

  it('lists ⌘Z and ⇧⌘Z on a Mac', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    render(<PlanShortcutsHelp open onClose={() => {}} editingEnabled />);
    expect(screen.getByText('⌘Z')).toBeInTheDocument();
    expect(screen.getByText('⇧⌘Z')).toBeInTheDocument();
    expect(screen.queryByText('Ctrl + Z')).not.toBeInTheDocument();
  });
});

describe('the Touch section (long-press-hint M1)', () => {
  it('lists the two gestures that work in both views, in the diagram', () => {
    render(<PlanShortcutsHelp open onClose={() => {}} editingEnabled={false} />);
    expect(screen.getByRole('heading', { name: 'Touch' })).toBeInTheDocument();
    expect(screen.getByText('Press and hold an icon button')).toBeInTheDocument();
    expect(screen.getByText('Press and hold an Explorer row')).toBeInTheDocument();
    // The canvas has no finger-specific behaviour, so the sheet must not claim one.
    expect(screen.queryByText('Tap a bar, then drag it')).not.toBeInTheDocument();
  });

  it('adds the Gantt row gestures, and the editing ones only where editing is enabled', () => {
    const { rerender } = render(
      <PlanShortcutsHelp open onClose={() => {}} editingEnabled view="gantt" />,
    );
    expect(screen.getByRole('heading', { name: 'Touch' })).toBeInTheDocument();
    expect(screen.getByText('Press and hold a row or bar')).toBeInTheDocument();
    expect(screen.getByText('Tap a bar, then drag it')).toBeInTheDocument();
    rerender(<PlanShortcutsHelp open onClose={() => {}} editingEnabled={false} view="gantt" />);
    expect(screen.getByRole('heading', { name: 'Touch' })).toBeInTheDocument();
    expect(screen.getByText('Press and hold a row or bar')).toBeInTheDocument();
    expect(screen.queryByText('Tap a bar, then drag it')).not.toBeInTheDocument();
    expect(screen.queryByText('Double-tap a cell')).not.toBeInTheDocument();
  });

  it('sets a gesture phrase as wrapping text, not as a monospaced no-wrap key', () => {
    render(<PlanShortcutsHelp open onClose={() => {}} editingEnabled />);
    const gesture = screen.getByText('Press and hold an icon button');
    expect(gesture).not.toHaveClass('font-mono');
    expect(gesture).not.toHaveClass('whitespace-nowrap');
    expect(screen.getByText('Enter', { selector: 'dt' })).toHaveClass('font-mono');
  });

  it('lets a key chord wrap inside a capped column, so a long one cannot squeeze the description', () => {
    render(<PlanShortcutsHelp open onClose={() => {}} editingEnabled view="gantt" />);
    const chords = screen.getAllByText(/double-click/, { selector: 'dt' });
    expect(chords.length).toBeGreaterThan(1);
    for (const chord of chords) {
      expect(chord).toHaveClass('font-mono', 'max-w-48', 'break-words');
      expect(chord).not.toHaveClass('whitespace-nowrap');
    }
  });
});
