import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GanttColumnsGroup } from './gantt-columns-group';
import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';
import { resolveColumnWidths } from '@/features/gantt/layout/column-widths';
import { DEFAULT_HIDDEN_COLUMNS } from '@/features/gantt/model/gantt-view-state';

/**
 * **The Columns group's typed widths** (ADR-0173 M1). A typed number is the keyboard, screen-reader
 * and single-pointer route to what a drag reaches, so the properties worth pinning are the ones a
 * planner would hit: it applies on commit rather than per keystroke, an out-of-range value is
 * clamped and shown, a non-number reverts, a hidden column has no field, and the shaded reset keeps
 * its focus and its reason (ADR-0082).
 */

type Bundle = NonNullable<TsldToolbarContext['ganttColumns']>;

function bundle(over: Partial<Bundle> = {}): Bundle {
  return {
    hidden: new Set(DEFAULT_HIDDEN_COLUMNS),
    setHidden: vi.fn(),
    widths: resolveColumnWidths({}),
    setWidth: vi.fn(),
    table: { size: 584, min: 524, max: 720, setSize: vi.fn() },
    reset: vi.fn(),
    isDefault: false,
    ...over,
  };
}

const field = (name: string): HTMLInputElement =>
  screen.getByRole<HTMLInputElement>('spinbutton', { name });

describe('a column width field', () => {
  it('is a labelled spinbutton holding the current width, bounded 48 to 400', () => {
    render(<GanttColumnsGroup columns={bundle()} />);
    const code = field('Code width');
    expect(code).toHaveValue(80);
    expect(code).toHaveAttribute('min', '48');
    expect(code).toHaveAttribute('max', '400');
    expect(screen.getByText(/48 to 400 pixels/)).toBeInTheDocument();
    expect(code.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('applies on Enter, not on each keystroke', () => {
    const columns = bundle();
    render(<GanttColumnsGroup columns={columns} />);
    const code = field('Code width');
    fireEvent.change(code, { target: { value: '1' } });
    fireEvent.change(code, { target: { value: '160' } });
    expect(columns.setWidth).not.toHaveBeenCalled();
    fireEvent.keyDown(code, { key: 'Enter' });
    expect(columns.setWidth).toHaveBeenCalledExactlyOnceWith('code', 160);
  });

  it('applies on blur', () => {
    const columns = bundle();
    render(<GanttColumnsGroup columns={columns} />);
    const code = field('Code width');
    fireEvent.change(code, { target: { value: '200' } });
    fireEvent.blur(code);
    expect(columns.setWidth).toHaveBeenCalledExactlyOnceWith('code', 200);
  });

  it('does not write when blurred untouched', () => {
    const columns = bundle();
    render(<GanttColumnsGroup columns={columns} />);
    fireEvent.blur(field('Code width'));
    expect(columns.setWidth).not.toHaveBeenCalled();
  });

  it('clamps an out-of-range value and says so by the number it commits', () => {
    const columns = bundle();
    render(<GanttColumnsGroup columns={columns} />);
    fireEvent.change(field('Code width'), { target: { value: '20' } });
    fireEvent.keyDown(field('Code width'), { key: 'Enter' });
    expect(columns.setWidth).toHaveBeenLastCalledWith('code', 48);
    fireEvent.change(field('Code width'), { target: { value: '9000' } });
    fireEvent.keyDown(field('Code width'), { key: 'Enter' });
    expect(columns.setWidth).toHaveBeenLastCalledWith('code', 400);
  });

  it('reverts a non-number to the current width without writing', () => {
    const columns = bundle();
    render(<GanttColumnsGroup columns={columns} />);
    const code = field('Code width');
    fireEvent.change(code, { target: { value: '' } });
    fireEvent.keyDown(code, { key: 'Enter' });
    expect(columns.setWidth).not.toHaveBeenCalled();
    expect(code).toHaveValue(80);
  });

  it('steps by 16 with the arrow keys, and the step applies', () => {
    const columns = bundle();
    render(<GanttColumnsGroup columns={columns} />);
    fireEvent.keyDown(field('Code width'), { key: 'ArrowUp' });
    expect(columns.setWidth).toHaveBeenLastCalledWith('code', 96);
    fireEvent.keyDown(field('Code width'), { key: 'ArrowDown' });
    expect(columns.setWidth).toHaveBeenLastCalledWith('code', 64);
  });

  it('is offered only for a shown column', () => {
    render(<GanttColumnsGroup columns={bundle()} />);
    // Predecessors is hidden by default; every other resizable column is shown.
    expect(screen.queryByRole('spinbutton', { name: 'Predecessors width' })).toBeNull();
    for (const name of ['Code', 'Duration', 'Start', 'Finish', 'Float left']) {
      expect(field(`${name} width`)).toBeInTheDocument();
    }
  });

  it('is offered for a column once it is shown', () => {
    render(<GanttColumnsGroup columns={bundle({ hidden: new Set() })} />);
    expect(field('Predecessors width')).toHaveValue(90);
  });

  it('is not offered for Activity, which is elastic', () => {
    render(<GanttColumnsGroup columns={bundle()} />);
    expect(screen.queryByRole('spinbutton', { name: 'Activity width' })).toBeNull();
  });
});

describe('the table width field', () => {
  it('shows the divider’s own number and bounds, and writes through the same setter', () => {
    const columns = bundle();
    render(<GanttColumnsGroup columns={columns} />);
    const table = field('Table width');
    expect(table).toHaveValue(584);
    expect(table).toHaveAttribute('min', '524');
    expect(table).toHaveAttribute('max', '720');
    expect(screen.getByText(/524 to 720 pixels/)).toBeInTheDocument();
    fireEvent.change(table, { target: { value: '600' } });
    fireEvent.keyDown(table, { key: 'Enter' });
    expect(columns.table.setSize).toHaveBeenCalledExactlyOnceWith(600);
  });

  it('clamps to the table’s own floor, not the column bounds', () => {
    const columns = bundle();
    render(<GanttColumnsGroup columns={columns} />);
    fireEvent.change(field('Table width'), { target: { value: '100' } });
    fireEvent.keyDown(field('Table width'), { key: 'Enter' });
    expect(columns.table.setSize).toHaveBeenLastCalledWith(524);
  });
});

describe('Reset widths', () => {
  it('resets when anything is non-standard', () => {
    const columns = bundle({ isDefault: false });
    render(<GanttColumnsGroup columns={columns} />);
    const reset = screen.getByRole('button', { name: 'Reset widths' });
    expect(reset).not.toHaveAttribute('aria-disabled');
    fireEvent.click(reset);
    expect(columns.reset).toHaveBeenCalledTimes(1);
  });

  it('is shaded with its reason, still focusable, and does nothing at standard widths', () => {
    const columns = bundle({ isDefault: true });
    render(<GanttColumnsGroup columns={columns} />);
    const reset = screen.getByRole('button', { name: 'Reset widths' });
    expect(reset).toHaveAttribute('aria-disabled', 'true');
    expect(reset).not.toBeDisabled();
    expect(reset).toHaveAccessibleDescription('Already at standard widths');
    reset.focus();
    expect(reset).toHaveFocus();
    fireEvent.click(reset);
    expect(columns.reset).not.toHaveBeenCalled();
  });
});

describe('inside the View ▾ popover of a real toolbar', () => {
  it('keeps ArrowUp/Down for the field instead of moving toolbar focus', () => {
    const setWidth = vi.fn();
    const context = makeTsldToolbarContext({
      planView: 'gantt',
      ganttColumns: bundle({ setWidth }),
    });
    const rows = splitByRow(buildTsldToolbarItems());
    render(
      <div>
        <Toolbar items={rows.strip} context={context} label="Plan commands" authoringEnabled />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /^View/ }));
    const code = field('Code width');
    code.focus();
    fireEvent.keyDown(code, { key: 'ArrowDown' });
    expect(setWidth).toHaveBeenCalledExactlyOnceWith('code', 64);
    expect(code).toHaveFocus();
  });
});
