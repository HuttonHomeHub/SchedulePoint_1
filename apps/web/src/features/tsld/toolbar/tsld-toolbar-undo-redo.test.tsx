import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';
import { DEFAULT_VIEW_TOGGLES } from '@/features/tsld/render/paint';

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
  return {
    zoomPreset: 'week',
    setZoomPreset: vi.fn(),
    stepZoom: vi.fn(),
    fit: vi.fn(),
    plannedStart: '2026-01-01',
    goToDate: vi.fn(),
    viewToggles: DEFAULT_VIEW_TOGGLES,
    toggleView: vi.fn(),
    schedulingMode: 'EARLY',
    setSchedulingMode: vi.fn(),
    isAddingActivity: false,
    toggleAddActivity: vi.fn(),
    createType: 'TASK',
    setCreateType: vi.fn(),
    isLinking: false,
    toggleLinkMode: vi.fn(),
    linkType: 'FS',
    setLinkType: vi.fn(),
    canAutoArrange: false,
    requestAutoArrange: vi.fn(),
    canUndo: true,
    canRedo: true,
    undoLabel: 'Move activity',
    redoLabel: 'Add link',
    undo,
    redo,
    canRecalc: true,
    recalcPending: false,
    recalculate: vi.fn(),
    openBaselines: vi.fn(),
    openCalendar: vi.fn(),
    openEarnedValue: vi.fn(),
    openResourceHistogram: vi.fn(),
    editPlan: vi.fn(),
    openShortcuts: vi.fn(),
    legendOpen: false,
    toggleLegend: vi.fn(),
    summaryContent: null,
    projectFinishContent: null,
    hasDiagram: true,
    ...over,
  };
}

/** Render the Row 2 · Do toolbar (where the pen-gated authoring cluster + undo/redo live). */
function doRow(context: TsldToolbarContext, authoringEnabled = true) {
  const rows = splitByRow(buildTsldToolbarItems());
  render(
    <Toolbar
      items={rows.do}
      context={context}
      label="Build and manage"
      authoringEnabled={authoringEnabled}
    />,
  );
  return screen.getByRole('toolbar', { name: 'Build and manage' });
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

  it('shades the controls (pen-gated) when authoring is not enabled — the whole cluster is off', () => {
    const bar = doRow(ctx(), false);
    const undoBtn = within(bar).getByRole('button', { name: 'Undo move activity' });
    expect(undoBtn).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(undoBtn);
    expect(undo).not.toHaveBeenCalled();
  });
});
