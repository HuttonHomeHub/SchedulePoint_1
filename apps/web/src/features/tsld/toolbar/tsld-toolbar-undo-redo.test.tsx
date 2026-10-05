import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

/**
 * Flag-ON Undo/Redo toolbar items (ADR-0048 M3.2). Pins `VITE_UNDO_REDO` on (+ canvas authoring, so the
 * Row 2 · Do authoring cluster is present) — the flag-off "Coming soon" placeholders are covered by
 * `tsld-toolbar.test.tsx`. Asserts: real controls render, disable from `canUndo`/`canRedo` and pen-gating,
 * invoke the store, and carry the dynamic accessible name.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: true,
  UNDO_REDO_ENABLED: true,
}));

const undo = vi.fn();
const redo = vi.fn();

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({
    canUndo: true,
    canRedo: true,
    undoLabel: 'Move activity',
    redoLabel: 'Add link',
    undo,
    redo,
    summaryContent: null,
    ...over,
  });
}

/** Render the Row 2 · Do toolbar (where the pen-gated authoring cluster + undo/redo live). */
function doRow(context: TsldToolbarContext, authoringEnabled = true) {
  const rows = splitByRow(buildTsldToolbarItems());
  render(
    <Toolbar
      items={rows.strip}
      context={context}
      label="Plan commands"
      authoringEnabled={authoringEnabled}
    />,
  );
  return screen.getByRole('toolbar', { name: 'Plan commands' });
}

beforeEach(() => vi.clearAllMocks());

describe('TSLD toolbar Undo/Redo (flag on)', () => {
  it('renders real Undo/Redo controls whose accessible name names the pending step', () => {
    const bar = doRow(ctx());
    expect(within(bar).getByRole('button', { name: 'Undo move activity' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Redo add link' })).toBeInTheDocument();
  });

  // Regression (undo-redo M1-T1): the name was built with `label.toLowerCase()`, which flattened the
  // activity's own name too — "Undo edit “excavate”" — while the announcement kept "Excavate".
  it('keeps the activity name’s own capitalisation in the name', () => {
    const bar = doRow(ctx({ undoLabel: 'Edit “Excavate”', redoLabel: 'Move “NORTH Wing”' }));
    expect(within(bar).getByRole('button', { name: 'Undo edit “Excavate”' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Redo move “NORTH Wing”' })).toBeInTheDocument();
  });

  it('falls back to the bare verb when there is no pending label', () => {
    const bar = doRow(ctx({ undoLabel: null, redoLabel: null }));
    expect(within(bar).getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Redo' })).toBeInTheDocument();
  });

  it('invoking Undo / Redo calls the store', () => {
    const bar = doRow(ctx());
    fireEvent.click(within(bar).getByRole('button', { name: 'Undo move activity' }));
    fireEvent.click(within(bar).getByRole('button', { name: 'Redo add link' }));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it('disables Undo/Redo on an empty stack and surfaces the reason in the accessible name (and does not invoke)', () => {
    // An empty stack disables via `isEnabled`, so the registry's `disabledReason` resolves — B4 threads
    // it through the render path so the control names WHY it's off, not just the bare verb.
    const bar = doRow(ctx({ canUndo: false, canRedo: false }));
    const undoBtn = within(bar).getByRole('button', { name: 'Undo — Nothing to undo' });
    const redoBtn = within(bar).getByRole('button', { name: 'Redo — Nothing to redo' });
    expect(undoBtn).toHaveAttribute('aria-disabled', 'true');
    expect(redoBtn).toHaveAttribute('aria-disabled', 'true');
    // The visible name moved from `title` to the Tooltip primitive (ADR-0117, fix-slice M-B):
    // `title` is hover-only, so it named the refusing button to a mouse and to nobody else. The
    // identifying string is unchanged — it now appears on focus as well — and the accessible name
    // (asserted above) still carries the label prefix, which was always this case's real subject.
    expect(undoBtn).not.toHaveAttribute('title');
    fireEvent.focus(undoBtn);
    expect(document.querySelector('[data-tooltip]')).toHaveTextContent('Undo — Nothing to undo');
    fireEvent.click(undoBtn);
    fireEvent.click(redoBtn);
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });

  it('advertises the keyboard accelerator via aria-keyshortcuts (S3)', () => {
    const bar = doRow(ctx());
    expect(within(bar).getByRole('button', { name: 'Undo move activity' })).toHaveAttribute(
      'aria-keyshortcuts',
      'Control+Z',
    );
    expect(within(bar).getByRole('button', { name: 'Redo add link' })).toHaveAttribute(
      'aria-keyshortcuts',
      'Control+Y Control+Shift+Z',
    );
  });

  it('puts the platform accelerator in the tooltip, not the accessible name', () => {
    const bar = doRow(ctx());
    const undoBtn = within(bar).getByRole('button', { name: 'Undo move activity' });
    fireEvent.focus(undoBtn);
    expect(document.querySelector('[data-tooltip]')).toHaveTextContent(
      'Undo move activity (Ctrl+Z)',
    );
  });

  it('shades the controls (pen-gated) when authoring is not enabled — the whole cluster is off', () => {
    const bar = doRow(ctx(), false);
    const undoBtn = within(bar).getByRole('button', { name: 'Undo move activity' });
    expect(undoBtn).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(undoBtn);
    expect(undo).not.toHaveBeenCalled();
  });
});

describe('TSLD toolbar Undo history menu (undo-redo M7)', () => {
  const undoTo = vi.fn();
  const redoTo = vi.fn();
  const historyCtx = (over: Partial<TsldToolbarContext> = {}) =>
    ctx({
      undoTo,
      undoLabel: 'Move “C”',
      redoTo,
      historyEntries: () => ({ undo: ['Move “C”', 'Move “B”', 'Add “A”'], redo: ['Delete “D”'] }),
      ...over,
    });
  const trigger = (bar: HTMLElement) => within(bar).getByRole('button', { name: 'Undo history' });
  const rowsOf = () => within(screen.getByRole('menu')).getAllByRole('menuitem');
  /** Keys reach the focused element, as in a browser. */
  const press = (key: string) =>
    fireEvent.keyDown(document.activeElement ?? document.body, { key });

  it('is a menu button named Undo history, beside Undo', () => {
    const bar = doRow(historyCtx());
    expect(trigger(bar)).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger(bar)).toHaveAttribute('aria-expanded', 'false');
    const names = within(bar)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    expect(names.indexOf('Undo history')).toBe(names.indexOf('Undo move “C”') + 1);
  });

  it('lists the undo steps newest first, then the redo steps, each saying what it does', () => {
    const bar = doRow(historyCtx());
    fireEvent.click(trigger(bar));
    expect(screen.getByRole('menu', { name: 'Undo history' })).toBeInTheDocument();
    expect(rowsOf().map((item) => item.textContent)).toEqual([
      'Undo Move “C”',
      'Undo Move “B” and the 1 step after it',
      'Undo Add “A” and the 2 steps after it',
      'Redo Delete “D”',
    ]);
  });

  it('choosing a row undoes back to it in one call, and returns focus to the trigger', () => {
    const bar = doRow(historyCtx());
    fireEvent.click(trigger(bar));
    fireEvent.click(screen.getByRole('menuitem', { name: /Add “A”/ }));
    expect(undoTo).toHaveBeenCalledExactlyOnceWith(3, 'Add “A”');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger(bar)).toHaveFocus();
  });

  it('choosing a redo row redoes up to it', () => {
    const bar = doRow(historyCtx());
    fireEvent.click(trigger(bar));
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete “D”/ }));
    expect(redoTo).toHaveBeenCalledExactlyOnceWith(1, 'Delete “D”');
    expect(undoTo).not.toHaveBeenCalled();
  });

  it('opens from the keyboard with focus on the first row; arrows rove; Escape returns focus', () => {
    const bar = doRow(historyCtx());
    trigger(bar).focus();
    press('ArrowDown');
    const rows = rowsOf();
    expect(rows[0]).toHaveFocus();
    press('ArrowDown');
    expect(rows[1]).toHaveFocus();
    press('End');
    expect(rows[3]).toHaveFocus();
    press('Home');
    expect(rows[0]).toHaveFocus();
    press('Escape');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger(bar)).toHaveFocus();
    expect(undoTo).not.toHaveBeenCalled();
  });

  it('ArrowUp opens it too (APG menu button)', () => {
    const bar = doRow(historyCtx());
    trigger(bar).focus();
    press('ArrowUp');
    expect(rowsOf()[0]).toHaveFocus();
  });

  it('is shaded with the reason when there is nothing to undo or redo, and does not open', () => {
    const bar = doRow(historyCtx({ canUndo: false, canRedo: false }));
    expect(trigger(bar)).toHaveAttribute('aria-disabled', 'true');
    expect(trigger(bar)).toHaveAccessibleDescription('Nothing to undo or redo');
    fireEvent.click(trigger(bar));
    trigger(bar).focus();
    press('ArrowDown');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('is shaded with the rest of the pen-gated cluster when authoring is off', () => {
    const bar = doRow(historyCtx(), false);
    expect(trigger(bar)).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(trigger(bar));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shades its rows, still reachable and still named, if the pen is lost while it is open', () => {
    const items = buildTsldToolbarItems();
    const bar = (authoringEnabled: boolean) => (
      <Toolbar
        items={splitByRow(items).strip}
        context={historyCtx()}
        label="Plan commands"
        authoringEnabled={authoringEnabled}
      />
    );
    const view = render(bar(true));
    fireEvent.click(trigger(screen.getByRole('toolbar')));
    expect(rowsOf()[0]).not.toHaveAttribute('aria-disabled');
    view.rerender(bar(false));
    expect(rowsOf()[0]).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(rowsOf()[0]!);
    expect(undoTo).not.toHaveBeenCalled();
  });

  it('every row’s accessible name contains its visible text unbroken (WCAG 2.5.3)', () => {
    const bar = doRow(historyCtx());
    fireEvent.click(trigger(bar));
    for (const row of rowsOf()) {
      const visible = row.querySelector('[title]')?.textContent ?? '';
      expect(visible).not.toBe('');
      expect(row).toHaveAccessibleName(expect.stringContaining(visible));
    }
  });

  it('truncates a long label in the row and keeps it whole in the title', () => {
    const long = 'Edit “' + 'Very long activity name '.repeat(8) + '”';
    const bar = doRow(historyCtx({ historyEntries: () => ({ undo: [long], redo: [] }) }));
    fireEvent.click(trigger(bar));
    const label = rowsOf()[0]!.querySelector('[title]')!;
    expect(label).toHaveAttribute('title', long);
    expect(label).toHaveClass('truncate');
  });

  it('marks Undo, Redo and the history button busy while a run is in flight, and ignores them', () => {
    const bar = doRow(historyCtx({ historyBusy: true }));
    for (const name of ['Undo history', 'Undo move “C”', 'Redo add link']) {
      expect(within(bar).getByRole('button', { name })).toHaveAttribute('aria-busy', 'true');
    }
    fireEvent.click(within(bar).getByRole('button', { name: 'Undo move “C”' }));
    fireEvent.click(trigger(bar));
    expect(undo).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('ArrowRight inside the open menu keeps focus in the menu', () => {
    const bar = doRow(historyCtx());
    trigger(bar).focus();
    press('ArrowDown');
    const first = rowsOf()[0];
    press('ArrowRight');
    press('ArrowLeft');
    expect(first).toHaveFocus();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('adds no roving stop of its own beyond the toolbar’s one', () => {
    const bar = doRow(historyCtx());
    const stops = within(bar)
      .getAllByRole('button')
      .filter((button) => button.getAttribute('tabindex') === '0');
    expect(stops).toHaveLength(1);
  });
});
