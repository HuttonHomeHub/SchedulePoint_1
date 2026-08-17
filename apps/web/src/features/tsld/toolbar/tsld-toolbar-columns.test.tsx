import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';
import { GANTT_COLUMN_LABELS } from '@/features/gantt/layout/grid-columns';
import { DEFAULT_HIDDEN_COLUMNS, HIDEABLE_COLUMNS } from '@/features/gantt/model/gantt-view-state';

/**
 * **The Gantt's Columns chooser, in `View ▾`** (ADR-0095 M5-T1).
 *
 * The plan's entry-point line named "a **Columns** button above the grid". It is here instead, and
 * the reason is the register's: ADR-0092 spent a milestone reclaiming 249 px of chrome from above
 * the diagram on the 1646 px screen this product is judged on, and a new horizontal band is that
 * cost paid again. The registry's own note on `logicLinks` — M4's toggle, one milestone earlier —
 * made the equivalent call for the two ROWS.
 *
 * The assertion that carries weight is the absent one: on the diagram the group does not render at
 * all. A shaded "Columns" on a surface with no columns would be ADR-0082's omit case dressed as its
 * shade case — a control whose reason can only ever be "this view has no columns", which is not a
 * permission and not something the reader can act on.
 */

const setHidden = vi.fn();

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({
    planView: 'gantt',
    ganttColumns: { hidden: new Set(DEFAULT_HIDDEN_COLUMNS), setHidden },
    ...over,
  });
}

function renderRows(context: TsldToolbarContext) {
  const rows = splitByRow(buildTsldToolbarItems());
  return render(
    <div>
      <Toolbar
        items={rows.look}
        context={context}
        label="View and navigate"
        authoringEnabled
        alignEndGroup="object"
      />
      <Toolbar items={rows.do} context={context} label="Build and manage" authoringEnabled />
    </div>,
  );
}

function openView(): void {
  const trigger = screen.getByRole('button', { name: /^View/ });
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
}

describe('in the Gantt', () => {
  it('offers every hideable column by the label the GRID draws', () => {
    renderRows(ctx());
    openView();
    // Asserted per column against `GANTT_COLUMN_LABELS`, which is DERIVED from `GANTT_COLUMNS` —
    // so a column renamed in the grid renames here, and this fails if the chooser ever grows a
    // second vocabulary. (The first version of this case looped and asserted `key` was truthy,
    // which is a test that cannot fail.)
    for (const key of HIDEABLE_COLUMNS) {
      const label = GANTT_COLUMN_LABELS[key];
      expect(label, `no label for ${key}`).toBeTruthy();
      expect(screen.getByRole('checkbox', { name: label as string })).toBeInTheDocument();
    }
    // `Activity` is not offered: it identifies the row and carries the editor and the de-emphasis
    // marker, so a grid that could hide it is not a shorter grid but a broken one.
    expect(screen.queryByRole('checkbox', { name: 'Activity' })).toBeNull();
  });

  it('shows a column as checked, and hidden as unchecked', () => {
    renderRows(ctx());
    openView();
    // `predecessors` is the one hidden by default — the chart does not grow a column overnight.
    expect(screen.getByRole('checkbox', { name: 'Predecessors' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Float' })).toBeChecked();
  });

  it('hides a shown column through the host writer, never local state', () => {
    renderRows(ctx());
    openView();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Float' }));
    expect(setHidden).toHaveBeenCalledTimes(1);
    const next = setHidden.mock.calls[0]?.[0] as ReadonlySet<string>;
    expect(next.has('totalFloat')).toBe(true);
    // The default hidden column is still hidden — a toggle sets one key, not the whole set.
    expect(next.has('predecessors')).toBe(true);
  });

  it('shows a hidden column again', () => {
    setHidden.mockClear();
    renderRows(ctx());
    openView();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Predecessors' }));
    const next = setHidden.mock.calls[0]?.[0] as ReadonlySet<string>;
    expect(next.has('predecessors')).toBe(false);
  });
});

describe('on the diagram', () => {
  it('renders no Columns group at all — absent, not shaded', () => {
    renderRows(ctx({ planView: 'tsld', ganttColumns: undefined }));
    openView();
    expect(screen.queryByRole('checkbox', { name: 'Predecessors' })).toBeNull();
    expect(screen.queryByText('Columns')).toBeNull();
  });
});
