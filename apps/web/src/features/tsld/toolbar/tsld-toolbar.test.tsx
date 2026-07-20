import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

// This suite covers the **flag-off** registry (plain Add toggle, no Link tool). Now that
// `VITE_CANVAS_AUTHORING` defaults on, pin it off here; the flag-on registry is covered by
// `tsld-toolbar-authoring.test.tsx`.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: false,
  // Pin undo/redo OFF here so the "Coming soon" placeholder assertions below exercise the flag-off
  // rollback path; the real flag-on Undo/Redo items are covered in tsld-toolbar-undo-redo.test.tsx.
  UNDO_REDO_ENABLED: false,
  // Pin the canvas insight lenses OFF here too (this is the flag-off registry suite): the search field
  // stays the disabled stub and filter/colour-by/baseline-overlay stay "Coming soon" placeholders. The
  // real flag-on lens controls are covered in tsld-toolbar-lenses.test.tsx.
  CANVAS_LENSES_ENABLED: false,
  // Pin canvas nav OFF here too: isolate / next-conflict / snap stay "Coming soon" placeholders. The
  // real flag-on nav controls are covered in tsld-toolbar-canvas-nav.test.tsx.
  CANVAS_NAV_ENABLED: false,
}));

const spies = {
  setZoomPreset: vi.fn(),
  stepZoom: vi.fn(),
  fit: vi.fn(),
  toggleView: vi.fn(),
  toggleAddActivity: vi.fn(),
  recalculate: vi.fn(),
  openBaselines: vi.fn(),
  openCalendar: vi.fn(),
  openEarnedValue: vi.fn(),
  openResourceHistogram: vi.fn(),
  editPlan: vi.fn(),
  openShortcuts: vi.fn(),
  toggleLegend: vi.fn(),
};

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({
    setZoomPreset: spies.setZoomPreset,
    stepZoom: spies.stepZoom,
    fit: spies.fit,
    toggleView: spies.toggleView,
    toggleAddActivity: spies.toggleAddActivity,
    recalculate: spies.recalculate,
    openBaselines: spies.openBaselines,
    openCalendar: spies.openCalendar,
    openEarnedValue: spies.openEarnedValue,
    openResourceHistogram: spies.openResourceHistogram,
    editPlan: spies.editPlan,
    openShortcuts: spies.openShortcuts,
    toggleLegend: spies.toggleLegend,
    ...over,
  });
}

/** Render the two-row toolbar the workspace renders (ADR-0031 amendment): Row 1 · Look + Row 2 · Do. */
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

describe('TSLD toolbar registry (two-row)', () => {
  it('renders the frame controls and drives the canvas seam', () => {
    renderRows(ctx());
    // Zoom level is a single dropdown now (not five buttons): open it and pick a level.
    fireEvent.click(screen.getByRole('button', { name: 'Zoom level: Week' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Month' }));
    expect(spies.setZoomPreset).toHaveBeenCalledWith('month');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(spies.stepZoom).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole('button', { name: 'Fit to plan' }));
    expect(spies.fit).toHaveBeenCalledOnce();
  });

  it('reflects the active scale preset on the zoom trigger and menu', () => {
    renderRows(ctx({ zoomPreset: 'month' }));
    const trigger = screen.getByRole('button', { name: 'Zoom level: Month' });
    expect(trigger).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByRole('menuitemradio', { name: 'Month' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('menuitemradio', { name: 'Week' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('opens the View popover and toggles a display layer', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: /View/ }));
    const panel = screen.getByRole('dialog', { name: 'View' });
    fireEvent.click(within(panel).getByLabelText('Non-working'));
    expect(spies.toggleView).toHaveBeenCalledWith('nonWorking');
  });

  it('keeps the two rows on distinct toolbars (Look / Do)', () => {
    renderRows(ctx());
    // Row 1 hosts view/navigate; Row 2 hosts build/manage. Both are APG toolbars.
    expect(screen.getByRole('toolbar', { name: 'View and navigate' })).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Build and manage' })).toBeInTheDocument();
  });

  it('pins the Project-finish chip inline on Row 1 (product-owner decision #1)', () => {
    renderRows(ctx());
    const lookRow = screen.getByRole('toolbar', { name: 'View and navigate' });
    expect(within(lookRow).getByText('Finish: 01 Aug 2026')).toBeInTheDocument();
  });

  it('renders the Summary popover body from the context', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: /Summary/ }));
    expect(screen.getByTestId('summary-body')).toBeInTheDocument();
  });

  it('toggles the on-canvas Legend panel (a show/hide button, not a popover)', () => {
    // The legend lives on the canvas now (ADR-0031 amendment): the toolbar item is a pressed-state
    // toggle that drives the workspace's floating panel — it renders no key of its own.
    const { rerender } = renderRows(ctx({ legendOpen: false }));
    const legend = screen.getByRole('button', { name: /Legend/ });
    expect(legend).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(legend);
    expect(spies.toggleLegend).toHaveBeenCalledOnce();

    // Reflecting the open state marks the toggle pressed.
    const rows = splitByRow(buildTsldToolbarItems());
    const opened = ctx({ legendOpen: true });
    rerender(
      <div>
        <Toolbar
          items={rows.look}
          context={opened}
          label="View and navigate"
          authoringEnabled
          alignEndGroup="object"
        />
        <Toolbar items={rows.do} context={opened} label="Build and manage" authoringEnabled />
      </div>,
    );
    expect(screen.getByRole('button', { name: /Legend/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('pen-gates Add activity: disabled read-only, enabled + wired when authoring', () => {
    const { rerender } = renderRows(ctx(), false);
    const add = screen.getByRole('button', { name: 'Add activity' });
    expect(add).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(add);
    expect(spies.toggleAddActivity).not.toHaveBeenCalled();

    const rows = splitByRow(buildTsldToolbarItems());
    rerender(
      <div>
        <Toolbar
          items={rows.look}
          context={ctx()}
          label="View and navigate"
          authoringEnabled
          alignEndGroup="object"
        />
        <Toolbar items={rows.do} context={ctx()} label="Build and manage" authoringEnabled />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }));
    expect(spies.toggleAddActivity).toHaveBeenCalledOnce();
  });

  it('disables Recalculate when the model says it cannot recalc', () => {
    renderRows(ctx({ canRecalc: false }));
    expect(screen.getByRole('button', { name: 'Recalculate' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('shows the plan actions inline on Row 2 and drives their seams (Baselines)', () => {
    renderRows(ctx());
    // Plan & deliverable actions now sit inline (tier-2 icon buttons), not in a `⋯` overflow.
    // A live icon-only button carries a hover tooltip naming it (not just an aria-label).
    const baselines = screen.getByRole('button', { name: 'Baselines…' });
    expect(baselines).toHaveAttribute('title', 'Baselines…');
    fireEvent.click(baselines);
    expect(spies.openBaselines).toHaveBeenCalledOnce();
  });

  it('has no standalone Plan-details or Edit-plan toolbar buttons (folded into Summary)', () => {
    renderRows(ctx());
    // Both were consolidated (ADR-0031 amendment): Plan-details facts live in the Summary popover,
    // which also carries the Edit-plan shortcut (plus a header edit-pencil).
    expect(screen.queryByRole('button', { name: 'Plan details…' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit plan…' })).not.toBeInTheDocument();
  });

  it('shades — not hides — the frame controls on an empty plan (stable shape)', () => {
    renderRows(ctx({ hasDiagram: false }));
    // Zoom + Fit stay on the bar but disabled, so the toolbar's silhouette doesn't shift as the plan
    // gains a computed diagram (ADR-0031 "shade, don't hide").
    expect(screen.getByRole('button', { name: 'Fit to plan' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Zoom level: Week' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    // View stays available (display toggles apply to the empty canvas too). The presentational
    // finish read-out is still gated on a computed finish — it's a value, not a control.
    expect(screen.getByRole('button', { name: /View/ })).toBeInTheDocument();
    expect(screen.queryByText('Finish: 01 Aug 2026')).not.toBeInTheDocument();
    // Author + recalc remain reachable.
    expect(screen.getByRole('button', { name: 'Add activity' })).toBeInTheDocument();
  });

  it('keeps Auto-arrange on the bar and greys it without the pen (shade-don’t-hide)', () => {
    // Regression: Auto-arrange used to disappear in view mode and reappear when editing. It now
    // stays on the bar and greys with the rest of the authoring cluster, like Add/Recalculate.
    renderRows(ctx({ canAutoArrange: true }), false);
    expect(screen.getByRole('button', { name: 'Auto-arrange lanes' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('enables Auto-arrange with the pen when arrangement is available', () => {
    const requestAutoArrange = vi.fn();
    renderRows(ctx({ canAutoArrange: true, requestAutoArrange }), true);
    const arrange = screen.getByRole('button', { name: 'Auto-arrange lanes' });
    expect(arrange).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(arrange);
    expect(requestAutoArrange).toHaveBeenCalledOnce();
  });

  it('shows future features as disabled "Coming soon" placeholders (undo/redo)', () => {
    renderRows(ctx());
    for (const name of ['Undo', 'Redo']) {
      const btn = screen.getByRole('button', { name });
      expect(btn).toHaveAttribute('aria-disabled', 'true');
      // Icon-only tooltip names the button, then the reason (WCAG/discoverability).
      expect(btn).toHaveAttribute('title', `${name} — Coming soon`);
    }
  });

  it('renders the search field and inline roadmap placeholders, disabled with a reason', () => {
    renderRows(ctx());
    // Search leads the Find cluster as a disabled field (not a menu item).
    expect(screen.getByRole('searchbox', { name: /Search or filter activities/ })).toBeDisabled();
    // The rest are inline "Coming soon" icon buttons whose tooltip names them.
    for (const name of ['Export…', 'Share…', 'Colour by…']) {
      const item = screen.getByRole('button', { name });
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).toHaveAttribute('title', `${name} — Coming soon`);
    }
  });

  it('shows the canvas-nav features (isolate / next-conflict / snap) as "Coming soon" placeholders when VITE_CANVAS_NAV is off', () => {
    // CANVAS_NAV_ENABLED is left at its real default (off) — this suite doesn't mock it — so the three
    // ids must resolve to their byte-for-byte placeholder stubs (the flag-off parity gate).
    renderRows(ctx({ schedulingMode: 'VISUAL', selectedActivity: undefined }));
    for (const name of ['Isolate logic path', 'Next conflict', 'Snap to grid']) {
      const btn = screen.getByRole('button', { name });
      expect(btn).toHaveAttribute('aria-disabled', 'true');
      expect(btn).toHaveAttribute('title', `${name} — Coming soon`);
    }
  });

  it('has no axe violations across both rows', async () => {
    const { container } = renderRows(ctx());
    expect((await axe(container)).violations).toEqual([]);
  });
});
