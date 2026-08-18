import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
    expect(screen.getByRole('dialog', { name: 'Gantt keyboard shortcuts' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Navigate' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Edit' })).toBeInTheDocument();
  });

  it('withholds the Edit section in the Gantt when editing is not enabled', () => {
    // A shaded or absent section, never a list of keys that do nothing — the lit-but-inert shape.
    render(<PlanShortcutsHelp open onClose={() => {}} editingEnabled={false} view="gantt" />);
    expect(screen.getByRole('dialog', { name: 'Gantt keyboard shortcuts' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Navigate' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('defaults to the DIAGRAM sheet, so a host that forgets the prop is not shown an empty one', () => {
    render(<PlanShortcutsHelp open onClose={() => {}} editingEnabled />);
    expect(screen.getByRole('dialog', { name: 'Diagram keyboard shortcuts' })).toBeInTheDocument();
  });

  it('renders nothing while closed', () => {
    render(<PlanShortcutsHelp open={false} onClose={() => {}} editingEnabled view="gantt" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
