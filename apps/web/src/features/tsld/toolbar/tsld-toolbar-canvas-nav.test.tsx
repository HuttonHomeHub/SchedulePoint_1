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
  // ── Isolate logic path (U1 — split button: main toggles, chevron opens the menu) ──────────
  it('starts isolation when the unpressed main button is clicked (not just open a menu)', () => {
    renderRows(ctx({ selectedActivity: SELECTED, isolateActive: false }));
    const main = screen.getByRole('button', { name: 'Isolate logic path' });
    expect(main).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(main);
    // The primary affordance STARTS isolation (in the current/last mode) — it doesn't open a menu.
    expect(spies.toggleIsolate).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('exits isolation when the pressed main button is clicked (toggle-off, U1)', () => {
    renderRows(ctx({ selectedActivity: SELECTED, isolateActive: true, isolateMode: 'driving' }));
    const main = screen.getByRole('button', { name: 'Isolate logic path: Driving path' });
    expect(main).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(main);
    // Clicking the PRESSED button exits — it no longer re-opens the mode menu.
    expect(spies.toggleIsolate).toHaveBeenCalledOnce();
    expect(spies.setIsolateMode).not.toHaveBeenCalled();
  });

  it('opens the mode menu from the chevron (arm-vs-pick), picking Driving path', () => {
    renderRows(ctx({ selectedActivity: SELECTED }));
    const chevron = screen.getByRole('button', { name: 'Isolate logic path options' });
    fireEvent.click(chevron);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Driving path only' }));
    expect(spies.setIsolateMode).toHaveBeenCalledWith('driving');
    // Picking a mode is a distinct gesture from the main-button toggle.
    expect(spies.toggleIsolate).not.toHaveBeenCalled();
  });

  it('opens the mode menu from the main button via ArrowDown (keyboard parity)', () => {
    renderRows(ctx({ selectedActivity: SELECTED }));
    const main = screen.getByRole('button', { name: 'Isolate logic path' });
    fireEvent.keyDown(main, { key: 'ArrowDown' });
    expect(screen.getByRole('menu', { name: 'Isolate logic path' })).toBeInTheDocument();
    expect(spies.toggleIsolate).not.toHaveBeenCalled();
  });

  it('offers "Stop isolating" in the menu while active', () => {
    renderRows(ctx({ selectedActivity: SELECTED, isolateActive: true, isolateMode: 'driving' }));
    fireEvent.click(screen.getByRole('button', { name: 'Isolate logic path options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Stop isolating' }));
    expect(spies.toggleIsolate).toHaveBeenCalledOnce();
  });

  it('shades Isolate with "Select an activity first" when nothing is selected', () => {
    renderRows(ctx({ selectedActivity: undefined }));
    const main = screen.getByRole('button', { name: 'Isolate logic path' });
    expect(main).toHaveAttribute('aria-disabled', 'true');
    expect(main).toHaveAttribute('title', 'Select an activity first');
    fireEvent.click(main);
    expect(spies.toggleIsolate).not.toHaveBeenCalled();
  });

  it('shades Isolate with "Add an activity first" on an empty canvas (diagram gate wins)', () => {
    renderRows(ctx({ selectedActivity: undefined, hasDiagram: false }));
    expect(screen.getByRole('button', { name: 'Isolate logic path' })).toHaveAttribute(
      'title',
      'Add an activity first',
    );
  });

  // ── Next-conflict visible status chip (U2) ────────────────────────────────────────────────
  it('renders the visible "Conflict i of n · reason" status chip while cycling', () => {
    renderRows(
      ctx({
        currentConflict: { index: 2, total: 5, name: 'Excavate', reasons: ['constraint conflict'] },
      }),
    );
    // The chip is the VISIBLE readout only (aria-hidden); the spoken channel is the shared announcer,
    // so it's queried by its title/text, not by an ARIA role.
    const chip = screen.getByTitle('Conflict 2 of 5: constraint conflict');
    expect(chip).toHaveTextContent('Conflict 2 of 5');
    expect(chip).toHaveTextContent('constraint conflict');
    expect(chip).toHaveAttribute('aria-hidden', 'true');
    // Presentational — never a roving-tabindex stop / focusable control.
    expect(chip.tagName).not.toBe('BUTTON');
    expect(chip).toHaveAttribute('tabindex', '-1');
  });

  it('lists every matched reason in the chip title but truncates to the first inline', () => {
    renderRows(
      ctx({
        currentConflict: {
          index: 1,
          total: 1,
          name: 'Pour',
          reasons: ['constraint conflict', 'negative total float'],
        },
      }),
    );
    const chip = screen.getByTitle('Conflict 1 of 1: constraint conflict, negative total float');
    expect(chip).toHaveTextContent('Conflict 1 of 1');
  });

  it('hides the status chip when no conflict is being cycled (currentConflict null)', () => {
    renderRows(ctx({ currentConflict: null }));
    expect(screen.queryByTitle(/^Conflict \d+ of \d+:/)).not.toBeInTheDocument();
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
