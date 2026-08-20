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
      <Toolbar items={rows.strip} context={context} label="Plan commands" authoringEnabled />
    </div>,
  );
}

/**
 * The `overflowItem` helper lived here and is **deleted** (ADR-0094, 2026-08-13).
 *
 * It opened the `⋯` and read a `menuitem`, because ADR-0090 M2 moved four commands to tier 3 so the
 * two rows could label themselves at 1920. `next-conflict` was one of them, and this file's three
 * Next-conflict cases were its only callers — promoting the item back to tier 1 left the helper with
 * nothing to reach. Removed rather than kept "in case": an unused helper documenting a layout that
 * no longer holds is the drift class this epic is about, and `isolate-logic` (the other command this
 * file covers) reads its own control directly.
 */

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
  //
  // **Reached inline since ADR-0094, not through `overflowItem`.** These three used that helper —
  // which opens the `⋯` first — because the item was tier 3 and therefore admitted last, so at the
  // width a planner actually uses it was inside the menu. That is what the epic promoted it out of:
  // a control shaded "No conflicts to review" inside a menu is a shading nobody sees. A top-level
  // button links its reason by `title`, not `aria-describedby`, which is why the shade assertions
  // changed shape with the query.
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
    expect(btn).toHaveAccessibleDescription('No conflicts to review');
    fireEvent.click(btn);
    expect(spies.goToNextConflict).not.toHaveBeenCalled();
  });

  it('shades Next conflict with "Add an activity first" on an empty canvas', () => {
    renderRows(ctx({ hasConflicts: false, hasDiagram: false }));
    expect(screen.getByRole('button', { name: 'Next conflict' })).toHaveAccessibleDescription(
      'Add an activity first',
    );
  });

  // The count reaches assistive tech through the BUTTON, because the read-out beside it is
  // `aria-hidden` (ADR-0094 M3-T2). Asserted at rest — with nothing selected and no cycle started —
  // because that is the state the epic exists for and the one a loose "the count is visible"
  // assertion would have passed against the OLD code for the wrong reason: the old chip already
  // rendered "Conflict i of n" once you were cycling.
  it('describes the conflict count to assistive tech at rest, not only mid-cycle', () => {
    renderRows(ctx({ hasConflicts: true, conflictCount: 3 }));
    expect(screen.getByRole('button', { name: 'Next conflict' })).toHaveAccessibleDescription(
      '3 conflicts in this plan',
    );
  });

  it('describes the position instead once a planner is stepping', () => {
    renderRows(
      ctx({
        hasConflicts: true,
        conflictCount: 5,
        currentConflict: {
          index: 2,
          total: 5,
          name: 'Pour slab',
          reasons: ['constraint conflict'],
        },
      }),
    );
    expect(screen.getByRole('button', { name: 'Next conflict' })).toHaveAccessibleDescription(
      'Conflict 2 of 5',
    );
  });

  it('says one conflict rather than 1 conflicts', () => {
    renderRows(ctx({ hasConflicts: true, conflictCount: 1 }));
    expect(screen.getByRole('button', { name: 'Next conflict' })).toHaveAccessibleDescription(
      '1 conflict in this plan',
    );
  });

  // The visible half. It rendered ONLY while cycling until ADR-0094 — a count that cannot tell you
  // whether cycling is worth starting, which was the product owner's actual complaint.
  it('shows the count at rest, before any cycling has started', () => {
    renderRows(ctx({ hasConflicts: true, conflictCount: 3 }));
    expect(screen.getByTitle('3 conflicts')).toBeInTheDocument();
  });

  it('renders no read-out when the plan has no conflicts', () => {
    const { container } = renderRows(ctx({ hasConflicts: false, conflictCount: 0 }));
    // Scoped to the read-out's own item, NOT `queryByTitle(/conflict/i)` — which the first version
    // used and which matched the shaded BUTTON's tooltip ("No conflicts to review"). A query broad
    // enough to hit a neighbour is a query that cannot say which control it is talking about.
    expect(container.querySelector('[data-toolbar-item="next-conflict-status"]')).toBeNull();
  });

  // ── Snap to grid ────────────────────────────────────────────────────────────────────────
  // Four cases lived here (pressed state, the Visual-mode gate, the pen gate, the Late-overlay
  // gate) and were removed with the control on 2026-08-13. The toggle had no observable effect:
  // `compute.ts:335-338` wraps every `visualStart` in `rollForwardToWorking` unconditionally, so a
  // placement lands on a working day whether the toggle was on or off. The surviving rule — the
  // optimistic ghost previews the roll the engine will perform — is unit-tested in
  // `render/snap.test.ts`, and the product behaviour by the M2 journey.
});
