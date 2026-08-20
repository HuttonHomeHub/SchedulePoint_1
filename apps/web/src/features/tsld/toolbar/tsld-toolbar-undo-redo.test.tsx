import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
  SCHEDULING_MODES_ENABLED: false,
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
    expect(undoBtn).toHaveAttribute('title', 'Undo — Nothing to undo');
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
      'Control+Shift+Z',
    );
  });

  /**
   * TECH_DEBT #47. Undo must always be one reachable click, so the controls are `render` items,
   * which the primitive never demotes. That is a structural property — but "structural" is how a
   * regression gets in unnoticed, and nothing asserted it for undo/redo specifically. Squeeze the
   * bar until every demotable button is pushed into `⋯` and check the two survive.
   */
  it('keeps Undo/Redo on the bar at a width that overflows their demotable neighbours', () => {
    // The control: unsqueezed, Undo and Redo are inline. If this ever stopped holding, the squeezed
    // assertions below would pass without proving anything.
    //
    // **It used to assert that no `⋯` existed at all**, on the reasoning that jsdom reports every
    // width as 0 so an unsqueezed row overflows nothing. Graphite M5 merged the two command rows,
    // and tier 3 is admitted LAST — so the single strip carries tier-3 items in the `⋯` at any
    // width, which is the ladder working rather than a squeeze. The control moves to the thing this
    // case is actually about: these two controls, on the bar.
    const unsqueezed = doRow(ctx());
    expect(within(unsqueezed).getByRole('button', { name: /^Undo/ })).toBeInTheDocument();
    expect(within(unsqueezed).getByRole('button', { name: /^Redo/ })).toBeInTheDocument();
    cleanup();

    // Now give every item a real width and the container almost none: the pinned controls alone
    // exceed it, so the ladder gets zero budget and demotes all it is allowed to demote.
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 100,
      height: 32,
      top: 0,
      left: 0,
      right: 100,
      bottom: 32,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(120);
    // **The row has to say its width was IMPOSED on it.** Demotion is only safe where `clientWidth`
    // is a container's decision; on a shrink-to-fit row it is an output, and demoting from one is a
    // one-way door (`toolbar-ladder.ts`, `allowDemotion`). jsdom reports `flex-grow: 0` — the CSS
    // initial value — for everything, so a test whose premise is "the container is almost none" has
    // to make that premise explicit rather than inherit it.
    const realStyle = window.getComputedStyle.bind(window);
    const computed = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((el: Element, pseudo?: string | null) => {
        const style = realStyle(el, pseudo ?? undefined);
        return new Proxy(style, {
          get: (target, key) =>
            key === 'flexGrow'
              ? '1'
              : typeof Reflect.get(target, key) === 'function'
                ? Reflect.get(target, key).bind(target)
                : Reflect.get(target, key),
        });
      });

    try {
      const bar = doRow(ctx());

      expect(within(bar).getByRole('button', { name: 'Undo move activity' })).toBeInTheDocument();
      expect(within(bar).getByRole('button', { name: 'Redo add link' })).toBeInTheDocument();

      // And the squeeze was real — the `⋯` trigger is present, so something did demote. Without
      // this the assertions above would pass on a bar that simply never overflowed.
      expect(within(bar).getByRole('button', { name: 'More toolbar actions' })).toBeInTheDocument();
    } finally {
      rect.mockRestore();
      width.mockRestore();
      computed.mockRestore();
    }
  });

  it('shades the controls (pen-gated) when authoring is not enabled — the whole cluster is off', () => {
    const bar = doRow(ctx(), false);
    const undoBtn = within(bar).getByRole('button', { name: 'Undo move activity' });
    expect(undoBtn).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(undoBtn);
    expect(undo).not.toHaveBeenCalled();
  });
});
