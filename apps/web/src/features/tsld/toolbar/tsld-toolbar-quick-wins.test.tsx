import type { ActivitySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

/**
 * Flag-ON TSLD toolbar quick-wins (spec `docs/specs/toolbar-quick-wins/`). Pins `VITE_TOOLBAR_QUICK_WINS`
 * on — plus the flags the four items compose with (`VITE_NOTES` for Comments/Add-note,
 * `VITE_SCHEDULING_MODES`/canvas authoring for Clear-visual-placement) — and asserts each item's
 * visible/enabled/disabledReason/onActivate against the pen-gating matrix. The flag-OFF byte-for-byte
 * placeholders are covered in `tsld-toolbar.test.tsx`.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: true,
  SCHEDULING_MODES_ENABLED: true,
  NOTES_ENABLED: true,
  UNDO_REDO_ENABLED: false,
  TOOLBAR_QUICK_WINS_ENABLED: true,
}));

/** A stand-in selected activity — only id + version are read by the clear-placement onActivate. */
const SELECTED = { id: 'a1', version: 7, name: 'Excavate' } as unknown as ActivitySummary;

const spies = {
  goToDate: vi.fn(),
  revealComments: vi.fn(),
  openActivityNotes: vi.fn(),
};

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({
    goToDate: spies.goToDate,
    summaryContent: null,
    revealComments: spies.revealComments,
    openActivityNotes: spies.openActivityNotes,
    ...over,
  });
}

/** Render both rows the workspace renders (Row 1 · Look + Row 2 · Do). */
function renderRows(context: TsldToolbarContext, authoringEnabled = true) {
  const rows = splitByRow(buildTsldToolbarItems());
  return render(
    <div>
      <Toolbar
        items={rows.strip}
        context={context}
        label="Plan commands"
        authoringEnabled={authoringEnabled}
      />
    </div>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('TSLD toolbar quick-wins (flag on)', () => {
  // --- F1 · Go to today ---------------------------------------------------------------------
  it('Go to today: enabled with a diagram, jumps via goToDate(todayIso)', () => {
    renderRows(ctx());
    const btn = screen.getByRole('button', { name: 'Go to today' });
    expect(btn).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(spies.goToDate).toHaveBeenCalledWith('2026-07-19');
  });

  it('Go to today: disabled with a reason when there is no diagram', () => {
    renderRows(ctx({ hasDiagram: false }));
    const btn = screen.getByRole('button', { name: 'Go to today' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    // The tooltip is the REASON alone, because the control is labelled here and its name is already
    // on screen — `ToolbarButton` only prefixes the name for an icon-only control, where the
    // tooltip is the sole hover affordance.
    //
    // This assertion used to expect the prefixed form, and it changed for a reason worth stating
    // rather than editing over. ADR-0091 D3a gave this item `showLabel: { atLeast: 'comfortable' }`,
    // and jsdom has no layout, so `Toolbar` never re-measures and keeps its initial `comfortable`
    // band — under which this item is labelled. Under the previous `'auto'` policy the same absence
    // of layout made `autoLabelsFit` false and rendered it icon-only. So the change here reflects a
    // different DEFAULT in a layout-less environment, not a change to what a planner sees: at a real
    // 1920 the control is labelled either way, and `item-widths` measures it at 120 px labelled and
    // 32 px icon-only at 1440.
    expect(btn).toHaveAttribute('title', 'Add an activity to go to today');
    // The reason is also `aria-describedby`-associated, which is the part that must never regress —
    // a title alone is a hover affordance, unreachable by keyboard and by touch (ADR-0082).
    const describedBy = btn.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      'Add an activity to go to today',
    );
  });

  it('Go to today: works for a read-only viewer (not pen-gated)', () => {
    // authoringEnabled false = no pen. Go-to-today is view-only, so it stays enabled.
    renderRows(ctx(), false);
    const btn = screen.getByRole('button', { name: 'Go to today' });
    expect(btn).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(spies.goToDate).toHaveBeenCalledWith('2026-07-19');
  });

  // --- F2 · Comments ------------------------------------------------------------------------
  it('Comments: visible under VITE_NOTES and reveals the plan notes thread', () => {
    renderRows(ctx());
    const btn = screen.getByRole('button', { name: 'Comments' });
    fireEvent.click(btn);
    expect(spies.revealComments).toHaveBeenCalledOnce();
  });

  // --- F3 · Report progress — REMOVED (ADR-0093) ----------------------------------------------
  // Five cases lived here covering this item's selection gate, its U3 resolved-row gate and its
  // U2/A5 reason precedence. The item is gone: an action on the selected object belongs on the
  // object's surface, so the equivalent gates are asserted on the canvas dock's `progress` item
  // (`selection-actions.entry-routes.test.tsx`) and the activities-table row action
  // (`ActivitiesTable.test.tsx`), both of which pre-date this removal and pass unchanged.
  //
  // Deliberately NOT replaced with a "the item is absent" case here: this file's subject is the
  // quick-wins items' behaviour, and absence is pinned once, structurally, in
  // `selection-duplication.structural.test.ts`.

  // --- F4 · Add note ------------------------------------------------------------------------
  it('Add note: enabled with a resolved selection + canWriteNotes; opens the activity notes (not pen-gated)', () => {
    renderRows(
      ctx({ selectedActivityId: 'a1', selectedActivity: SELECTED, canWriteNotes: true }),
      false,
    );
    const btn = screen.getByRole('button', { name: 'Add note' });
    expect(btn).not.toHaveAttribute('aria-disabled', 'true');
    // Logic discoverability (entry-route gap #6): the hover tooltip points a toolbar-only user at the
    // Logic panel, without changing the accessible name ("Add note").
    // This one KEEPS its label prefix where the disabled cases below dropped theirs, and the
    // difference is real rather than an inconsistency: this is an ENABLED button carrying a
    // `description`, and `ToolbarButton` composes `label — description` for those. The disabled
    // cases carry a `disabledReason`, which stands alone once the label is visible.
    expect(btn).toHaveAttribute('title', 'Add note — Opens the Logic panel (links & notes)');
    fireEvent.click(btn);
    expect(spies.openActivityNotes).toHaveBeenCalledOnce();
  });

  it('Add note: disabled when the selected row is gone (U3 — resolved selection)', () => {
    renderRows(ctx({ selectedActivityId: 'a1', selectedActivity: undefined, canWriteNotes: true }));
    const btn = screen.getByRole('button', { name: 'Add note' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute('title', 'Select an activity first');
  });

  it('Add note: disabled with "Select an activity first" when nothing is selected', () => {
    renderRows(ctx({ selectedActivityId: null, selectedActivity: undefined }));
    const btn = screen.getByRole('button', { name: 'Add note' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute('title', 'Select an activity first');
  });

  it('Add note: disabled with the role reason for a viewer who cannot write notes', () => {
    renderRows(ctx({ selectedActivityId: 'a1', selectedActivity: SELECTED, canWriteNotes: false }));
    const btn = screen.getByRole('button', { name: 'Add note' });
    expect(btn).toHaveAttribute('title', 'You don’t have permission to add notes');
  });

  it('Add note: role reason wins over selection for a viewer with nothing selected (U2/A5 precedence)', () => {
    renderRows(
      ctx({ selectedActivityId: null, selectedActivity: undefined, canWriteNotes: false }),
    );
    const btn = screen.getByRole('button', { name: 'Add note' });
    expect(btn).toHaveAttribute('title', 'You don’t have permission to add notes');
  });

  // --- F5 · Clear visual placement -----------------------------------------------------------
  //
  // **Its six cases moved with it** (ADR-0094 M4-T1). The command surface no longer registers this
  // item — its `isEnabled` consulted the selection, which is ADR-0093's discriminator — so the four
  // gate conditions are now unit cases against the shared `clearVisualPlacementGate`
  // (`conflict-remedy.gate.test.ts`, including the precedence between them, which was only ever
  // implied here by the order the cases happened to be written in) and the rendered
  // shade/click behaviour is `selection-actions.clear-placement.test.tsx`.
  //
  // Moved rather than deleted, and said so here rather than silently: a suite that simply loses six
  // cases looks identical to a capability that was dropped.

  it('has no axe violations with the quick-wins live', async () => {
    const { container } = renderRows(
      ctx({ schedulingMode: 'VISUAL', selectedActivityId: 'a1', selectedActivity: SELECTED }),
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});
