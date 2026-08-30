import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { PLAN_MODE_SEGMENT_LABELS } from '@/components/layout/workspace/plan-workspace-toolbar';
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
      items={rows.strip}
      context={context}
      label="Plan commands"
      authoringEnabled={authoringEnabled}
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
      label="Plan mode and view"
      authoringEnabled={authoringEnabled}
      // The host's own map, imported rather than restated — a second copy here would let this
      // surface and the product disagree about what the row is called, which only a reader who
      // opened both would ever see (`docs/TECH_DEBT.md` #201).
      segmentLabels={PLAN_MODE_SEGMENT_LABELS}
    />,
  );
}

describe('TSLD toolbar — scheduling modes (flag on)', () => {
  /**
   * **The mode row names its two switches** (`docs/TECH_DEBT.md` #201). Verified red against the
   * pre-M3 build, which rendered one region called "Scheduling and view" holding all four.
   *
   * The compound name was the honest thing to do while the primitive could only name a whole
   * taxonomy group — it at least stopped the cluster announcing itself as "Display", which is also
   * the deck's `lens` group name. What it could not do is say where one switch ends, because
   * nothing in the markup knew. The negative assertion is here rather than implied: leaving the old
   * name behind beside the new ones would give the row three names and be invisible on screen.
   */
  it('renders two named groups, and the old compound name is gone', () => {
    renderModeRow(ctx());

    const scheduling = screen.getByRole('group', { name: 'Scheduling mode' });
    const view = screen.getByRole('group', { name: 'Plan view' });
    expect(within(scheduling).getAllByRole('button').length).toBeGreaterThanOrEqual(2);
    expect(within(view).getAllByRole('button').length).toBeGreaterThanOrEqual(2);

    expect(screen.queryByRole('group', { name: 'Scheduling and view' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Display' })).toBeNull();
  });

  it('has no persisted data-date control on the toolbar (moved to Edit plan)', () => {
    renderToolbar(ctx());
    expect(screen.queryByLabelText(/Project start/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Timeline start/)).not.toBeInTheDocument();
  });

  it('keeps Go to date reachable on a plan with no diagram — the merge must not swallow it', () => {
    // The gate the merge is most likely to get wrong (ADR-0081's dead-end shape, named in
    // `ToolbarSplitButton`'s own docblock): under a single `disabled` the caret would inherit the
    // primary's "needs a computed diagram" gate, and a capability planners have today would vanish
    // on exactly the plans that need it — the empty ones. This suite's default IS that plan.
    const goToDate = vi.fn();
    renderToolbar(ctx({ goToDate }));
    expect(screen.getByRole('button', { name: 'Go to today' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    const caret = screen.getByRole('button', { name: 'Go to date' });
    expect(caret).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(caret);
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-06-15' } });
    expect(goToDate).toHaveBeenCalledWith('2026-06-15');
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

  it('shades "Go to date" with a reason until the plan is anchored (no plannedStart)', () => {
    // **This inverted with ADR-0091 M7-S6 and the inversion is the point.** `Go to date` used to be
    // its own item and could be hidden outright by `isVisible`. It is now the caret of `Go to
    // today ▾`, and hiding it would have to hide the whole control — taking away a command with a
    // different gate. So it shades, and shading obliges it to say why (ADR-0082's discriminator: an
    // unanchored plan is a state the reader can change, via Edit plan).
    // `hasDiagram: true` so the two gates are visibly independent: this suite's default is a plan
    // with no diagram, which would shade the primary for its own unrelated reason.
    renderToolbar(ctx({ plannedStart: null, hasDiagram: true }));
    const caret = screen.getByRole('button', { name: 'Go to date' });
    expect(caret).toHaveAttribute('aria-disabled', 'true');
    // The reason is ASSOCIATED, not merely nearby — a `title` alone is a hover affordance, which a
    // keyboard-only planner never sees.
    const describedBy = caret.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      "Set the plan's start date first",
    );
    // Its neighbour keeps its own gate: going to today needs a diagram, not an anchor.
    expect(screen.getByRole('button', { name: 'Go to today' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('makes Today the primary half rather than a shortcut buried in the panel', () => {
    // The panel used to carry its own `Today` button, two clicks deep, duplicating a toolbar command
    // that sat immediately beside it. ADR-0091 M7-S6 merged the two controls, so the primary half
    // IS that command — one click, and no second copy to keep in step.
    const goToDate = vi.fn();
    renderToolbar(ctx({ goToDate, todayIso: '2026-07-27', hasDiagram: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Go to today' }));
    expect(goToDate).toHaveBeenCalledWith('2026-07-27');

    // And the panel no longer duplicates it.
    fireEvent.click(screen.getByRole('button', { name: 'Go to date' }));
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Today' })).toBeNull();
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
