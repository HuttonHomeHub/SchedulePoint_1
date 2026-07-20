import type { ActivitySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

// The flag-ON canvas-nav registry: isolate-logic / next-conflict / snap-to-grid swap their placeholders
// for real controls. Scheduling modes are on (default) so the Visual-mode snap gates apply. The flag-off
// stubs are covered by `tsld-toolbar.test.tsx` (which leaves CANVAS_NAV_ENABLED at its default off).
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_NAV_ENABLED: true,
  SCHEDULING_MODES_ENABLED: true,
}));

const SELECTED = { id: 'a1', version: 1, name: 'Excavate' } as unknown as ActivitySummary;

const spies = {
  toggleIsolate: vi.fn(),
  setIsolateMode: vi.fn(),
  goToNextConflict: vi.fn(),
  toggleSnapToGrid: vi.fn(),
};

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({
    toggleIsolate: spies.toggleIsolate,
    setIsolateMode: spies.setIsolateMode,
    goToNextConflict: spies.goToNextConflict,
    toggleSnapToGrid: spies.toggleSnapToGrid,
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

beforeEach(() => vi.clearAllMocks());

describe('TSLD toolbar — canvas nav (flag on)', () => {
  // ── Isolate logic path ──────────────────────────────────────────────────────────────────
  it('enables Isolate with a selection + a computed diagram, and opens its mode menu', () => {
    renderRows(ctx({ selectedActivity: SELECTED }));
    const trigger = screen.getByRole('button', { name: 'Isolate logic path' });
    expect(trigger).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Driving path only' }));
    expect(spies.setIsolateMode).toHaveBeenCalledWith('driving');
  });

  it('shades Isolate with "Select an activity first" when nothing is selected', () => {
    renderRows(ctx({ selectedActivity: undefined }));
    const trigger = screen.getByRole('button', { name: 'Isolate logic path' });
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(trigger).toHaveAttribute('title', 'Select an activity first');
  });

  it('shades Isolate with "Add an activity first" on an empty canvas (diagram gate wins)', () => {
    renderRows(ctx({ selectedActivity: undefined, hasDiagram: false }));
    expect(screen.getByRole('button', { name: 'Isolate logic path' })).toHaveAttribute(
      'title',
      'Add an activity first',
    );
  });

  it('reflects the active isolate state (pressed) and its mode in the accessible name', () => {
    renderRows(ctx({ selectedActivity: SELECTED, isolateActive: true, isolateMode: 'driving' }));
    const trigger = screen.getByRole('button', { name: 'Isolate logic path: Driving path' });
    expect(trigger).toHaveAttribute('aria-pressed', 'true');
    // Active ⇒ the menu offers "Stop isolating".
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Stop isolating' }));
    expect(spies.toggleIsolate).toHaveBeenCalledOnce();
  });

  // ── Next conflict ───────────────────────────────────────────────────────────────────────
  it('advances Next conflict when the plan has conflicts', () => {
    renderRows(ctx({ hasConflicts: true, conflictCount: 3 }));
    const btn = screen.getByRole('button', { name: 'Next conflict' });
    expect(btn).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(spies.goToNextConflict).toHaveBeenCalledOnce();
  });

  it('shades Next conflict with "No conflicts to review" when there are none', () => {
    renderRows(ctx({ hasConflicts: false }));
    const btn = screen.getByRole('button', { name: 'Next conflict' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute('title', 'Next conflict — No conflicts to review');
    fireEvent.click(btn);
    expect(spies.goToNextConflict).not.toHaveBeenCalled();
  });

  it('shades Next conflict with "Add an activity first" on an empty canvas', () => {
    renderRows(ctx({ hasConflicts: false, hasDiagram: false }));
    expect(screen.getByRole('button', { name: 'Next conflict' })).toHaveAttribute(
      'title',
      'Next conflict — Add an activity first',
    );
  });

  // ── Snap to grid ────────────────────────────────────────────────────────────────────────
  it('toggles Snap in Visual mode with the pen, reflecting its pressed state', () => {
    renderRows(ctx({ schedulingMode: 'VISUAL', canEditSchedule: true, snapToGrid: true }));
    const btn = screen.getByRole('button', { name: 'Snap to grid' });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(btn);
    expect(spies.toggleSnapToGrid).toHaveBeenCalledOnce();
  });

  it('shades Snap outside Visual mode (mode gate leads the ladder)', () => {
    renderRows(ctx({ schedulingMode: 'EARLY', canEditSchedule: true }));
    const btn = screen.getByRole('button', { name: 'Snap to grid' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute('title', 'Snap to grid — Only available in Visual mode');
    fireEvent.click(btn);
    expect(spies.toggleSnapToGrid).not.toHaveBeenCalled();
  });

  it('shades Snap in Visual mode without the pen', () => {
    renderRows(ctx({ schedulingMode: 'VISUAL', canEditSchedule: false }));
    expect(screen.getByRole('button', { name: 'Snap to grid' })).toHaveAttribute(
      'title',
      'Snap to grid — Start editing to snap placements',
    );
  });

  it('shades Snap under the read-only Late-start overlay', () => {
    renderRows(ctx({ schedulingMode: 'VISUAL', canEditSchedule: true, lateOverlayActive: true }));
    expect(screen.getByRole('button', { name: 'Snap to grid' })).toHaveAttribute(
      'title',
      'Snap to grid — Turn off the Late-start overlay to snap placements',
    );
  });
});
