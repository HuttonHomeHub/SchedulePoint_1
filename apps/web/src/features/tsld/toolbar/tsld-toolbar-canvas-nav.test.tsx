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

const spies = {
  toggleIsolate: vi.fn(),
  setIsolateMode: vi.fn(),
  goToNextConflict: vi.fn(),
};

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({
    toggleIsolate: spies.toggleIsolate,
    setIsolateMode: spies.setIsolateMode,
    goToNextConflict: spies.goToNextConflict,
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

/**
 * Reach a command that lives in the `⋯` overflow (ADR-0090 M2, 2026-08-12).
 *
 * Four commands moved to tier 3 so the two rows could label themselves at 1920 — the trade the
 * product owner took with the measured numbers. Nothing about what these assertions prove changes;
 * they open the menu first and read a `menuitem` instead of a top-level button. A `MenuItem` also
 * links its reason by `aria-describedby` rather than a `title`, which is why the shade cases assert
 * the accessible description.
 */
function overflowItem(name: string | RegExp): HTMLElement {
  const more = screen.queryAllByRole('button', { name: 'More toolbar actions' });
  for (const trigger of more) {
    if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
    // Any of the three menu-item roles: a toggle in the overflow is a `menuitemcheckbox` since
    // ADR-0090 M2 (it was a plain `menuitem` announcing no state), and `getByRole('menuitem')`
    // does not match it — which is how that fix announced itself here.
    for (const role of ['menuitem', 'menuitemcheckbox', 'menuitemradio'] as const) {
      const hit = screen.queryByRole(role, { name });
      if (hit) return hit;
    }
    fireEvent.click(trigger);
  }
  throw new Error(`No overflow item named ${String(name)}`);
}

beforeEach(() => vi.clearAllMocks());

describe('TSLD toolbar — canvas nav (flag on)', () => {
  // The `Isolate logic path` cases moved to the SELECTION BAR in ADR-0090 M2-T1, re-homed to
  // `selection-actions.canvas.test.tsx`. Next conflict and Snap to grid stay on the toolbar and
  // keep their coverage below.
  // ── Isolate logic path (U1 — split button: main toggles, chevron opens the menu) ──────────
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
    const btn = overflowItem('Next conflict');
    expect(btn).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(spies.goToNextConflict).toHaveBeenCalledOnce();
  });

  it('shades Next conflict with "No conflicts to review" when there are none', () => {
    renderRows(ctx({ hasConflicts: false }));
    const btn = overflowItem('Next conflict');
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAccessibleDescription('No conflicts to review');
    fireEvent.click(btn);
    expect(spies.goToNextConflict).not.toHaveBeenCalled();
  });

  it('shades Next conflict with "Add an activity first" on an empty canvas', () => {
    renderRows(ctx({ hasConflicts: false, hasDiagram: false }));
    expect(overflowItem('Next conflict')).toHaveAccessibleDescription('Add an activity first');
  });

  // ── Snap to grid ────────────────────────────────────────────────────────────────────────
  // Four cases lived here (pressed state, the Visual-mode gate, the pen gate, the Late-overlay
  // gate) and were removed with the control on 2026-08-13. The toggle had no observable effect:
  // `compute.ts:335-338` wraps every `visualStart` in `rollForwardToWorking` unconditionally, so a
  // placement lands on a working day whether the toggle was on or off. The surviving rule — the
  // optimistic ghost previews the roll the engine will perform — is unit-tested in
  // `render/snap.test.ts`, and the product behaviour by the M2 journey.
});
