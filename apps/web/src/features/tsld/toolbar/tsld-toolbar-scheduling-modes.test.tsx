import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

/**
 * Scheduling-modes toolbar items (ADR-0033): the Go-to-date navigation jump + the Early | Visual mode
 * selector, both on Row 1 · Look. `SCHEDULING_MODES_ENABLED` requires `CANVAS_AUTHORING_ENABLED`, so
 * both are pinned on here. The persisted data date no longer has a toolbar control (ADR-0031 two-row
 * amendment) — it is edited via *Edit plan*.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: true,
  SCHEDULING_MODES_ENABLED: true,
}));

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({
    summaryContent: null,
    hasDiagram: false,
    ...over,
  });
}

/** Render the Row 1 · Look toolbar (Go-to-date and the View popover live here). */
function renderToolbar(context: TsldToolbarContext, authoringEnabled = true) {
  const rows = splitByRow(buildTsldToolbarItems());
  return render(
    <Toolbar
      items={rows.look}
      context={context}
      label="View and navigate"
      authoringEnabled={authoringEnabled}
      alignEndGroup="object"
    />,
  );
}

/**
 * Render the **mode row**, where the `Early | Visual` selector moved at ADR-0091 D1 — it sets how
 * the plan schedules rather than doing anything, so it now sits beside the pen on the identity line
 * instead of inside Row 1's `Display` group.
 */
function renderModeRow(context: TsldToolbarContext, authoringEnabled = true) {
  const rows = splitByRow(buildTsldToolbarItems());
  return render(
    <Toolbar
      items={rows.mode}
      context={context}
      label="Plan mode"
      authoringEnabled={authoringEnabled}
      groupLabels={{ lens: 'Scheduling and view' }}
    />,
  );
}

describe('TSLD toolbar — scheduling modes (flag on)', () => {
  it('has no persisted data-date control on the toolbar (moved to Edit plan)', () => {
    renderToolbar(ctx());
    expect(screen.queryByLabelText(/Project start/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Timeline start/)).not.toBeInTheDocument();
  });

  it('offers "Go to date" as a pure view jump — no write, available even without the pen', () => {
    const goToDate = vi.fn();
    // A read-only viewer (authoring off) can still navigate.
    renderToolbar(ctx({ goToDate }), false);
    // It is a disclosure: open it, then pick a date in the panel.
    fireEvent.click(screen.getByRole('button', { name: 'Go to date' }));
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-06-15' } });
    expect(goToDate).toHaveBeenCalledWith('2026-06-15');
  });

  it('hides "Go to date" until the plan is anchored (no plannedStart)', () => {
    renderToolbar(ctx({ plannedStart: null }));
    expect(screen.queryByRole('button', { name: 'Go to date' })).not.toBeInTheDocument();
  });

  it('offers a Today shortcut inside the Go-to-date popover that jumps without closing it', () => {
    const goToDate = vi.fn();
    renderToolbar(ctx({ goToDate, todayIso: '2026-07-27' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go to date' }));
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(goToDate).toHaveBeenCalledWith('2026-07-27');
    // Still open — picking Today behaves like picking a date, it doesn't dismiss the popover.
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
  });

  it('shows the "nothing is saved" hint on first use, then hides it (visually) once seen', () => {
    localStorage.clear();
    renderToolbar(ctx({ goToDate: vi.fn() }));
    fireEvent.click(screen.getByRole('button', { name: 'Go to date' }));
    const hint = screen.getByText('Pans the timeline only — nothing is saved.');
    expect(hint).not.toHaveClass('sr-only');

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-06-15' } });
    expect(hint).toHaveClass('sr-only');
    localStorage.clear();
  });

  it('offers an Early | Visual mode selector (labelled), marks the active mode, and switches', () => {
    const setSchedulingMode = vi.fn();
    renderModeRow(ctx({ schedulingMode: 'EARLY', setSchedulingMode }));
    const early = screen.getByRole('button', { name: 'Early mode' });
    const visual = screen.getByRole('button', { name: 'Visual mode' });
    // The buttons carry visible text (tier-1), not just an aria-label (ux/a11y: no blank buttons).
    expect(early).toHaveTextContent('Early mode');
    expect(visual).toHaveTextContent('Visual mode');
    expect(early).toHaveAttribute('aria-pressed', 'true');
    expect(visual).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(visual);
    expect(setSchedulingMode).toHaveBeenCalledWith('VISUAL');
  });

  it('keeps the mode selector visible but shaded for a read-only viewer (shade-don’t-hide)', () => {
    const setSchedulingMode = vi.fn();
    renderModeRow(ctx({ setSchedulingMode: null, schedulingMode: 'VISUAL' }));
    const early = screen.getByRole('button', { name: 'Early mode' });
    const visual = screen.getByRole('button', { name: 'Visual mode' });
    // The selector stays on the bar — the mode changes how the diagram reads, so a viewer must see it…
    expect(early).toHaveAttribute('aria-disabled', 'true');
    expect(visual).toHaveAttribute('aria-disabled', 'true');
    // …with the active mode still marked, and operating it is a no-op.
    expect(visual).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(visual);
    expect(setSchedulingMode).not.toHaveBeenCalled();
  });

  it('offers the Late-start overlay toggle in the View popover (M4) and flips it', () => {
    const toggleView = vi.fn();
    renderToolbar(ctx({ toggleView, hasDiagram: true }));
    fireEvent.click(screen.getByRole('button', { name: /View/ }));
    const panel = screen.getByRole('dialog', { name: 'View' });
    fireEvent.click(within(panel).getByLabelText('Late-start overlay'));
    expect(toggleView).toHaveBeenCalledWith('lateOverlay');
  });

  /**
   * ADR-0091 D3 relocates the zoom presets into `View ▾`. This asserts the section RENDERS and
   * OPERATES, not merely that it is registered — the `zoom` group carries no toggle keys and no
   * lenses, so the panel's emptiness guard dropped it on the first attempt and the section was
   * registered, ordered, typed and unreachable. That is the ADR-0081 shape, and no typecheck sees
   * it.
   */
  it('offers the zoom presets as a radio group in View ▾ and sets the preset', () => {
    const setZoomPreset = vi.fn();
    // `zoomPreset` is pinned to a level we are NOT clicking: a radio that is already checked fires
    // no change event, so clicking the default would assert nothing and pass for the wrong reason.
    renderToolbar(ctx({ setZoomPreset, hasDiagram: true, zoomPreset: 'day' }));
    fireEvent.click(screen.getByRole('button', { name: /View/ }));
    const panel = screen.getByRole('dialog', { name: 'View' });
    const group = within(panel).getByRole('radiogroup', { name: 'Zoom level' });
    // Exclusive by construction — the levels are alternatives, so a checkbox set would let a
    // planner ask for two framings at once.
    expect(within(group).getByRole('radio', { name: /Day/ })).toBeChecked();
    fireEvent.click(within(group).getByRole('radio', { name: /Month/ }));
    expect(setZoomPreset).toHaveBeenCalledWith('month');
  });

  it('groups the View popover into Structure / Markers / Insight overlays, Late-start overlay as an ordinary insight member', () => {
    renderToolbar(ctx({ hasDiagram: true }));
    fireEvent.click(screen.getByRole('button', { name: /View/ }));
    const panel = screen.getByRole('dialog', { name: 'View' });
    const groups = ['Structure', 'Markers', 'Insight overlays'];
    for (const label of groups) {
      expect(within(panel).getByText(label)).toBeInTheDocument();
    }
    // Late-start overlay lives under the same Insight overlays <fieldset> as the ADR-0054 lenses —
    // no separate border-t treatment setting it apart.
    const insightLegend = within(panel).getByText('Insight overlays');
    const insightFieldset = insightLegend.closest('fieldset');
    expect(insightFieldset).not.toBeNull();
    expect(within(insightFieldset!).getByLabelText('Late-start overlay')).toBeInTheDocument();
    expect(within(insightFieldset!).getByLabelText('Float & drift')).toBeInTheDocument();
  });
});
