import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GanttCell } from './GanttCell';

import type { GanttCellGate } from '@/features/gantt/model/cell-gate';

/**
 * **M2 — the cell's rendered contract.**
 *
 * The assertions that matter are the ones ADR-0083 exists about: a shut cell is **read-only, not
 * disabled**, its value is still there to read, and its reason is *linked* rather than merely
 * nearby. Every one of those is a thing a component can get subtly wrong while looking right.
 */

const open: GanttCellGate = { writable: true, readable: true, readOnly: false, reason: null };
const shut: GanttCellGate = {
  writable: false,
  readable: true,
  readOnly: true,
  reason: 'Start editing to change this.',
};

const noop = () => undefined;

function renderCell(over: Partial<React.ComponentProps<typeof GanttCell>> = {}) {
  const props: React.ComponentProps<typeof GanttCell> = {
    value: '5 d',
    label: 'Duration, Foundations',
    colIndex: 3,
    width: 84,
    gate: open,
    editing: false,
    text: '5 d',
    onBegin: noop,
    onChange: noop,
    onCommit: noop,
    onCancel: noop,
    ...over,
  };
  // A gridcell needs a grid+row ancestry to be queryable by role.
  return render(
    <div role="treegrid">
      <div role="row">
        <GanttCell {...props} />
      </div>
    </div>,
  );
}

describe('a cell that is shut', () => {
  it('is read-only rather than disabled, and still shows its value', () => {
    renderCell({ gate: shut });
    const cell = screen.getByRole('gridcell');
    expect(cell).toHaveAttribute('aria-readonly', 'true');
    // `aria-disabled` announces the cell as inoperable, which is how a value the planner still
    // needs to READ gets treated as decoration.
    expect(cell).not.toHaveAttribute('aria-disabled');
    expect(cell).toHaveTextContent('5 d');
  });

  it('links its reason to the cell instead of leaving it nearby', () => {
    renderCell({ gate: shut });
    const cell = screen.getByRole('gridcell');
    const describedBy = cell.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    // A reason a screen-reader user reaches only by chance is a reason that was not given.
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      'Start editing to change this.',
    );
  });

  it('does not open on double-click', () => {
    const onBegin = vi.fn();
    renderCell({ gate: shut, onBegin });
    fireEvent.doubleClick(screen.getByRole('gridcell'));
    expect(onBegin).not.toHaveBeenCalled();
  });
});

describe('a cell that is open', () => {
  it('opens on double-click', () => {
    const onBegin = vi.fn();
    renderCell({ onBegin });
    fireEvent.doubleClick(screen.getByRole('gridcell'));
    expect(onBegin).toHaveBeenCalledTimes(1);
  });

  it('renders no input until it is the editing cell — 240 of them is the cost of the alternative', () => {
    renderCell();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('names the field by its column and its row, so edit mode is not just "edit text"', () => {
    renderCell({ editing: true, text: '5 d' });
    expect(screen.getByRole('textbox')).toHaveAccessibleName('Duration, Foundations');
  });

  it('focuses and selects the field so typing replaces the value', () => {
    renderCell({ editing: true, text: '5 d' });
    const input = screen.getByRole<HTMLInputElement>('textbox');
    expect(input).toHaveFocus();
    // A planner pressing F2 to change a duration should type, not clear first.
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('5 d'.length);
  });

  it('commits on Enter and does not let the row see the key', () => {
    const onCommit = vi.fn();
    const onRowKeyDown = vi.fn();
    render(
      <div role="treegrid">
        <div role="row" tabIndex={-1} onKeyDown={onRowKeyDown}>
          <GanttCell
            value="5 d"
            label="Duration, Foundations"
            colIndex={3}
            width={84}
            gate={open}
            editing
            text="4h"
            onBegin={noop}
            onChange={noop}
            onCommit={onCommit}
            onCancel={noop}
          />
        </div>
      </div>,
    );

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledTimes(1);
    // Enter on a Gantt row activates the row. Committing a cell must not also move the selection
    // out from under the planner.
    expect(onRowKeyDown).not.toHaveBeenCalled();
  });

  it('cancels on Escape and keeps the key away from the window handler', () => {
    const onCancel = vi.fn();
    const onRowKeyDown = vi.fn();
    render(
      <div role="treegrid">
        <div role="row" tabIndex={-1} onKeyDown={onRowKeyDown}>
          <GanttCell
            value="5 d"
            label="Duration, Foundations"
            colIndex={3}
            width={84}
            gate={open}
            editing
            text="4h"
            onBegin={noop}
            onChange={noop}
            onCommit={noop}
            onCancel={onCancel}
          />
        </div>
      </div>,
    );

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
    // ADR-0079's rule — an Escape typed into a field belongs to that field — applied to a cell.
    expect(onRowKeyDown).not.toHaveBeenCalled();
  });

  it('stops accepting input while the write is in flight, without disabling the field', () => {
    const onChange = vi.fn();
    renderCell({ editing: true, text: '4h', busy: true, onChange });
    const input = screen.getByRole('textbox');
    // readOnly, not disabled: a disabled input drops focus to <body>, which is the ADR-0080 defect
    // and would also silently disable the accelerators bound above it.
    expect(input).toHaveAttribute('readonly');
    expect(input).not.toBeDisabled();
    expect(input).toHaveAttribute('aria-busy', 'true');
    // A readOnly input emits no change event for typed characters — asserting the attribute AND
    // the absent callback keeps this honest if the attribute is ever swapped for a handler guard.
    fireEvent.change(input, { target: { value: '4h9' } });
    expect(onChange).toHaveBeenCalledTimes(0);
  });

  it('links a refusal to the cell too, so the text and the reason arrive together', () => {
    renderCell({ editing: true, text: '4h', errorMessage: 'Someone else is editing this plan.' });
    const describedBy = screen.getByRole('gridcell').getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      'Someone else is editing this plan.',
    );
  });
});
