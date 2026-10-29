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
    setWidth: vi.fn((_key: string, width: number) => width),
    table: { size: 584, min: 524, max: 720, setSize: vi.fn((size: number) => size) },
    reset: vi.fn(),
    isDefault: false,
    codes: { status: 'ready', types: [], shownIds: [], setShown: vi.fn() },
    resolvePrintCodeColumns: vi.fn(() => Promise.resolve([])),
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
    expect(screen.getByText(/Widths are 48 to 400 pixels/)).toBeInTheDocument();
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

describe('a typed value is never changed silently', () => {
  const status = (): HTMLElement => screen.getByRole('status');

  it('has a polite status region from the start, so a later message is announced', () => {
    render(<GanttColumnsGroup columns={bundle()} />);
    expect(status()).toBeEmptyDOMElement();
  });

  it('says so when a value outside the bounds is limited to them', () => {
    render(<GanttColumnsGroup columns={bundle()} />);
    fireEvent.change(field('Code width'), { target: { value: '20' } });
    fireEvent.keyDown(field('Code width'), { key: 'Enter' });
    expect(status()).toHaveTextContent(
      'Code width limited to 48 px. Allowed range is 48 to 400 pixels.',
    );
    expect(field('Code width')).not.toHaveAttribute('aria-invalid');
  });

  it('announces an identical notice again by replacing its node', () => {
    render(<GanttColumnsGroup columns={bundle()} />);
    const limit = (): void => {
      fireEvent.change(field('Code width'), { target: { value: '20' } });
      fireEvent.keyDown(field('Code width'), { key: 'Enter' });
    };
    limit();
    const first = status().firstElementChild;
    limit();
    expect(status().firstElementChild).not.toBe(first);
    expect(status()).toHaveTextContent(
      'Code width limited to 48 px. Allowed range is 48 to 400 pixels.',
    );
  });

  it('says so when the chart guard limited a value that was inside the bounds', () => {
    const columns = bundle({ setWidth: vi.fn(() => 220) });
    render(<GanttColumnsGroup columns={columns} />);
    fireEvent.change(field('Code width'), { target: { value: '300' } });
    fireEvent.keyDown(field('Code width'), { key: 'Enter' });
    expect(status()).toHaveTextContent(
      'Code width limited to 220 px so the chart keeps at least 240 px.',
    );
  });

  it('says so when nothing usable was typed, and the field reverts', () => {
    render(<GanttColumnsGroup columns={bundle()} />);
    fireEvent.change(field('Code width'), { target: { value: '' } });
    fireEvent.keyDown(field('Code width'), { key: 'Enter' });
    expect(status()).toHaveTextContent('Code width not changed. Enter 48 to 400 pixels.');
    expect(field('Code width')).toHaveValue(80);
  });

  it('says nothing when the value was applied as typed, and clears an earlier message', () => {
    render(<GanttColumnsGroup columns={bundle()} />);
    fireEvent.change(field('Code width'), { target: { value: '20' } });
    fireEvent.keyDown(field('Code width'), { key: 'Enter' });
    expect(status()).not.toBeEmptyDOMElement();
    fireEvent.change(field('Code width'), { target: { value: '160' } });
    fireEvent.keyDown(field('Code width'), { key: 'Enter' });
    expect(status()).toBeEmptyDOMElement();
  });

  it('says so for the table width too, against the table’s own bounds', () => {
    render(<GanttColumnsGroup columns={bundle()} />);
    fireEvent.change(field('Table width'), { target: { value: '100' } });
    fireEvent.keyDown(field('Table width'), { key: 'Enter' });
    expect(status()).toHaveTextContent(
      'Table width limited to 524 px. Allowed range is 524 to 720 pixels.',
    );
  });

  it('announces a reset', () => {
    render(<GanttColumnsGroup columns={bundle({ isDefault: false })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset widths' }));
    expect(status()).toHaveTextContent('Widths reset to standard.');
  });
});

describe('Escape in a width field', () => {
  it('discards the draft, and the blur that follows does not commit it', () => {
    const columns = bundle();
    render(<GanttColumnsGroup columns={columns} />);
    const code = field('Code width');
    fireEvent.change(code, { target: { value: '300' } });
    expect(code).toHaveValue(300);
    fireEvent.keyDown(code, { key: 'Escape' });
    expect(code).toHaveValue(80);
    // Closing the popover blurs the field; that must not apply what was just discarded.
    fireEvent.blur(code);
    expect(columns.setWidth).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('leaves an untouched field alone', () => {
    const columns = bundle();
    render(<GanttColumnsGroup columns={columns} />);
    fireEvent.keyDown(field('Code width'), { key: 'Escape' });
    fireEvent.blur(field('Code width'));
    expect(columns.setWidth).not.toHaveBeenCalled();
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
    // Columns starts folded in the real panel (toolbar-redesign M2-T3); open it to reach the fields.
    fireEvent.click(screen.getByRole('button', { name: 'Columns', expanded: false }));
    const code = field('Code width');
    code.focus();
    fireEvent.keyDown(code, { key: 'ArrowDown' });
    expect(setWidth).toHaveBeenCalledExactlyOnceWith('code', 64);
    expect(code).toHaveFocus();
  });
});

describe('the Swimlane column in the chooser (swimlanes M4-T2)', () => {
  it('is not listed when the plan has no swimlanes to show', () => {
    render(<GanttColumnsGroup columns={bundle()} />);
    expect(screen.queryByRole('checkbox', { name: 'Swimlane' })).toBeNull();
    expect(screen.queryByRole('spinbutton', { name: 'Swimlane width' })).toBeNull();
  });

  it('is listed, shown and sized when the plan has swimlanes', () => {
    render(<GanttColumnsGroup columns={bundle({ swimlanesOffered: true })} />);
    expect(screen.getByRole('checkbox', { name: 'Swimlane' })).toBeChecked();
    expect(field('Swimlane width')).toHaveValue(110);
  });
});

describe('the Codes sub-section of the chooser (P6 activity codes, M3-T2)', () => {
  const types = [
    { id: 'area', name: 'Area' },
    { id: 'trade', name: 'Trade' },
    { id: 'phase', name: 'Phase' },
  ];
  const codes = (over: Partial<Bundle['codes']> = {}): Bundle['codes'] => ({
    status: 'ready',
    types,
    shownIds: [],
    setShown: vi.fn(),
    ...over,
  });
  const openCodes = (): void => {
    fireEvent.click(screen.getByRole('button', { name: 'Codes', expanded: false }));
  };

  it('is folded, and lists each type in type order once opened', () => {
    render(<GanttColumnsGroup columns={bundle({ codes: codes() })} />);
    expect(screen.queryByRole('checkbox', { name: 'Area' })).toBeNull();
    openCodes();
    const names = screen
      .getAllByRole('checkbox')
      .map((box) => box.closest('label')?.textContent)
      .filter((name) => ['Area', 'Trade', 'Phase'].includes(name ?? ''));
    expect(names).toEqual(['Area', 'Trade', 'Phase']);
    expect(screen.getByRole('checkbox', { name: 'Trade' })).not.toBeChecked();
  });

  it('opens on the choices already made, so a link that shows a column shows where to turn it off', () => {
    render(<GanttColumnsGroup columns={bundle({ codes: codes({ shownIds: ['trade'] }) })} />);
    expect(screen.getByRole('checkbox', { name: 'Trade' })).toBeChecked();
  });

  it('asks the host to show a ticked type, and to hide an unticked one, in one call each', () => {
    const setShown = vi.fn();
    const { rerender } = render(
      <GanttColumnsGroup columns={bundle({ codes: codes({ setShown }) })} />,
    );
    openCodes();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Trade' }));
    expect(setShown).toHaveBeenLastCalledWith(['trade']);
    rerender(
      <GanttColumnsGroup
        columns={bundle({ codes: codes({ setShown, shownIds: ['area', 'trade'] }) })}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Area' }));
    expect(setShown).toHaveBeenLastCalledWith(['trade']);
  });

  it('keeps the list inside a bounded, scrolling region so View ▾ does not grow with the types', () => {
    render(<GanttColumnsGroup columns={bundle({ codes: codes() })} />);
    openCodes();
    expect(screen.getByTestId('code-columns-list')).toHaveClass('max-h-40', 'overflow-y-auto');
  });

  it('shades the eleventh with one printed reason, keeps it focusable, and never shades a ticked one', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `t${String(i)}`,
      name: `Type ${String(i)}`,
    }));
    const setShown = vi.fn();
    render(
      <GanttColumnsGroup
        columns={bundle({
          codes: codes({ types: many, shownIds: many.slice(0, 10).map((t) => t.id), setShown }),
        })}
      />,
    );
    const eleventh = screen.getByRole('checkbox', { name: 'Type 10' });
    expect(eleventh).toHaveAttribute('aria-disabled', 'true');
    expect(eleventh).not.toBeDisabled();
    fireEvent.click(eleventh);
    expect(setShown).not.toHaveBeenCalled();
    expect(screen.getAllByText('Up to 10 code columns at a time.')).toHaveLength(1);
    expect(eleventh.getAttribute('aria-describedby')).toBe(
      screen.getByText('Up to 10 code columns at a time.').id,
    );
    const ticked = screen.getByRole('checkbox', { name: 'Type 0' });
    expect(ticked).not.toHaveAttribute('aria-disabled');
    fireEvent.click(ticked);
    expect(setShown).toHaveBeenCalledOnce();
  });

  it('sizes every code column with one field, only while one is shown', () => {
    const { rerender } = render(<GanttColumnsGroup columns={bundle({ codes: codes() })} />);
    openCodes();
    expect(screen.queryByRole('spinbutton', { name: 'Code columns width' })).toBeNull();
    const setWidth = vi.fn((_key: string, width: number) => width);
    rerender(
      <GanttColumnsGroup columns={bundle({ setWidth, codes: codes({ shownIds: ['area'] }) })} />,
    );
    const width = field('Code columns width');
    expect(width).toHaveValue(96);
    fireEvent.change(width, { target: { value: '140' } });
    fireEvent.keyDown(width, { key: 'Enter' });
    expect(setWidth).toHaveBeenCalledExactlyOnceWith('codes', 140);
  });

  it.each([
    ['loading', 'Codes are loading.'],
    ['error', 'Codes could not be loaded.'],
  ] as const)(
    'says so when the types are %s, rather than showing an empty list',
    (status, sentence) => {
      render(<GanttColumnsGroup columns={bundle({ codes: codes({ status, types: [] }) })} />);
      openCodes();
      expect(screen.getByText(sentence)).toBeInTheDocument();
    },
  );

  it('says how to add codes when the plan has none', () => {
    render(<GanttColumnsGroup columns={bundle({ codes: codes({ types: [] }) })} />);
    openCodes();
    expect(screen.getByText(/This plan has no codes yet/)).toBeInTheDocument();
  });
});
