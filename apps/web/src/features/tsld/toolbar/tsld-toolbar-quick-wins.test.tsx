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
 * on — plus the flags the five items compose with (`VITE_NOTES` for Comments/Add-note,
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
  openProgress: vi.fn(),
  openActivityNotes: vi.fn(),
  clearVisualPlacement: vi.fn(),
};

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({
    goToDate: spies.goToDate,
    summaryContent: null,
    projectFinishContent: null,
    revealComments: spies.revealComments,
    openProgress: spies.openProgress,
    openActivityNotes: spies.openActivityNotes,
    clearVisualPlacement: spies.clearVisualPlacement,
    ...over,
  });
}

/** Render both rows the workspace renders (Row 1 · Look + Row 2 · Do). */
function renderRows(context: TsldToolbarContext, authoringEnabled = true) {
  const rows = splitByRow(buildTsldToolbarItems());
  return render(
    <div>
      <Toolbar
        items={rows.look}
        context={context}
        label="View and navigate"
        authoringEnabled={authoringEnabled}
        alignEndGroup="object"
      />
      <Toolbar
        items={rows.do}
        context={context}
        label="Build and manage"
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
    expect(btn).toHaveAttribute('title', 'Go to today — Add an activity to go to today');
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

  // --- F3 · Update progress -----------------------------------------------------------------
  it('Update progress: disabled with "Select an activity first" when nothing is selected', () => {
    renderRows(ctx({ selectedActivityId: null }));
    const btn = screen.getByRole('button', { name: 'Update progress…' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute('title', 'Update progress… — Select an activity first');
  });

  it('Update progress: enabled with a resolved selection + canProgress; opens the dialog (not pen-gated)', () => {
    // authoringEnabled false (no pen) — progress is Contributor+, NOT pen-gated, so it stays enabled.
    renderRows(
      ctx({ selectedActivityId: 'a1', selectedActivity: SELECTED, canProgress: true }),
      false,
    );
    const btn = screen.getByRole('button', { name: 'Update progress…' });
    expect(btn).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(spies.openProgress).toHaveBeenCalledOnce();
  });

  it('Update progress: disabled when the selected row is gone (U3 — resolved selection, not the raw id)', () => {
    // The id is still held but its row was deleted elsewhere, so `selectedActivity` is undefined — the
    // button must NOT be enabled (a click would be a silent no-op on a missing target).
    renderRows(ctx({ selectedActivityId: 'a1', selectedActivity: undefined, canProgress: true }));
    const btn = screen.getByRole('button', { name: 'Update progress…' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute('title', 'Update progress… — Select an activity first');
  });

  it('Update progress: disabled with the role reason for a viewer who cannot report progress', () => {
    renderRows(ctx({ selectedActivityId: 'a1', selectedActivity: SELECTED, canProgress: false }));
    const btn = screen.getByRole('button', { name: 'Update progress…' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute(
      'title',
      'Update progress… — You don’t have permission to report progress',
    );
  });

  it('Update progress: role reason wins over selection for a viewer with nothing selected (U2/A5 precedence)', () => {
    // A permanently-blocked user with no selection is told the role reason, not (misleadingly) to
    // select an activity first.
    renderRows(ctx({ selectedActivityId: null, selectedActivity: undefined, canProgress: false }));
    const btn = screen.getByRole('button', { name: 'Update progress…' });
    expect(btn).toHaveAttribute(
      'title',
      'Update progress… — You don’t have permission to report progress',
    );
  });

  // --- F4 · Add note ------------------------------------------------------------------------
  it('Add note: enabled with a resolved selection + canWriteNotes; opens the activity notes (not pen-gated)', () => {
    renderRows(
      ctx({ selectedActivityId: 'a1', selectedActivity: SELECTED, canWriteNotes: true }),
      false,
    );
    const btn = screen.getByRole('button', { name: 'Add note' });
    expect(btn).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(spies.openActivityNotes).toHaveBeenCalledOnce();
  });

  it('Add note: disabled when the selected row is gone (U3 — resolved selection)', () => {
    renderRows(ctx({ selectedActivityId: 'a1', selectedActivity: undefined, canWriteNotes: true }));
    const btn = screen.getByRole('button', { name: 'Add note' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute('title', 'Add note — Select an activity first');
  });

  it('Add note: disabled with "Select an activity first" when nothing is selected', () => {
    renderRows(ctx({ selectedActivityId: null, selectedActivity: undefined }));
    const btn = screen.getByRole('button', { name: 'Add note' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute('title', 'Add note — Select an activity first');
  });

  it('Add note: disabled with the role reason for a viewer who cannot write notes', () => {
    renderRows(ctx({ selectedActivityId: 'a1', selectedActivity: SELECTED, canWriteNotes: false }));
    const btn = screen.getByRole('button', { name: 'Add note' });
    expect(btn).toHaveAttribute('title', 'Add note — You don’t have permission to add notes');
  });

  it('Add note: role reason wins over selection for a viewer with nothing selected (U2/A5 precedence)', () => {
    renderRows(
      ctx({ selectedActivityId: null, selectedActivity: undefined, canWriteNotes: false }),
    );
    const btn = screen.getByRole('button', { name: 'Add note' });
    expect(btn).toHaveAttribute('title', 'Add note — You don’t have permission to add notes');
  });

  // --- F5 · Clear visual placement ----------------------------------------------------------
  it('Clear visual placement: shaded (not hidden) outside Visual mode, with a mode reason (U1)', () => {
    // Shade-don't-hide: the button stays on the bar in Early mode (so Early↔Visual doesn't shift the
    // silhouette) and disables with the reason, rather than disappearing.
    renderRows(
      ctx({ schedulingMode: 'EARLY', selectedActivityId: 'a1', selectedActivity: SELECTED }),
    );
    const btn = screen.getByRole('button', { name: 'Clear visual placement' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute('title', 'Clear visual placement — Only available in Visual mode');
  });

  it('Clear visual placement: Late-start overlay gives a reason, not a bare disable (A1)', () => {
    // The overlay makes `authoringEnabled` false (so the penGated item is disabled) while
    // `canEditSchedule` stays true — the reason must come from `lateOverlayActive`, not fall through.
    renderRows(
      ctx({
        schedulingMode: 'VISUAL',
        selectedActivityId: 'a1',
        selectedActivity: SELECTED,
        canEditSchedule: true,
        lateOverlayActive: true,
      }),
      false,
    );
    const btn = screen.getByRole('button', { name: 'Clear visual placement' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute(
      'title',
      'Clear visual placement — Turn off the Late-start overlay to clear the placement',
    );
  });

  it('Clear visual placement: disabled when the selected row is gone (U3 — resolved selection)', () => {
    renderRows(
      ctx({ schedulingMode: 'VISUAL', selectedActivityId: 'a1', selectedActivity: undefined }),
      true,
    );
    const btn = screen.getByRole('button', { name: 'Clear visual placement' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute('title', 'Clear visual placement — Select an activity first');
  });

  it('Clear visual placement: in Visual mode + pen + selection, clears via clearVisualPlacement(id, version)', () => {
    renderRows(
      ctx({ schedulingMode: 'VISUAL', selectedActivityId: 'a1', selectedActivity: SELECTED }),
      true,
    );
    const btn = screen.getByRole('button', { name: 'Clear visual placement' });
    expect(btn).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(spies.clearVisualPlacement).toHaveBeenCalledWith('a1', 7);
  });

  it('Clear visual placement: pen-gated — shaded without the pen even with a selection', () => {
    renderRows(
      ctx({ schedulingMode: 'VISUAL', selectedActivityId: 'a1', selectedActivity: SELECTED }),
      false,
    );
    const btn = screen.getByRole('button', { name: 'Clear visual placement' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(spies.clearVisualPlacement).not.toHaveBeenCalled();
  });

  it('Clear visual placement: disabled with "Select an activity first" when nothing is selected', () => {
    renderRows(ctx({ schedulingMode: 'VISUAL', selectedActivityId: null }), true);
    const btn = screen.getByRole('button', { name: 'Clear visual placement' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute('title', 'Clear visual placement — Select an activity first');
  });

  it('has no axe violations with the quick-wins live', async () => {
    const { container } = renderRows(
      ctx({ schedulingMode: 'VISUAL', selectedActivityId: 'a1', selectedActivity: SELECTED }),
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});
