import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

// The flag-ON export & print registry: the `export` placeholder becomes the real Export ▾ menu-button.
// The flag-off stubs (both `export` and `print` "Coming soon") are covered by `tsld-toolbar.test.tsx`
// (which pins EXPORT_PRINT_ENABLED off).
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  EXPORT_PRINT_ENABLED: true,
}));

const spies = {
  exportScheduleCsv: vi.fn(),
  exportDiagramPng: vi.fn(),
  exportDiagramPdf: vi.fn(),
  printDiagram: vi.fn(),
};

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({
    exportScheduleCsv: spies.exportScheduleCsv,
    exportDiagramPng: spies.exportDiagramPng,
    exportDiagramPdf: spies.exportDiagramPdf,
    printDiagram: spies.printDiagram,
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
 * Open the **Share & export** trigger (ADR-0090 M2-T4) and return one of its rows.
 *
 * Export, Print and Share were three Row-2 stops; they are one menu now, so every assertion that
 * used to click a top-level button clicks a `menuitem` inside this trigger instead. Nothing about
 * what those assertions PROVE changes — which is the point of re-homing them rather than rewriting.
 */
function openDeliver(): void {
  const trigger = screen.getByRole('button', { name: /Share & export/ });
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
}

beforeEach(() => vi.clearAllMocks());

describe('TSLD toolbar — export & print (flag on)', () => {
  it('renders a real Export menu-button (not the "Coming soon" placeholder)', () => {
    renderRows(ctx());
    const trigger = screen.getByRole('button', { name: /Share & export/ });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('exports the whole schedule (scope "all") from the Schedule (CSV) item', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: /Share & export/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Schedule (CSV)' }));
    expect(spies.exportScheduleCsv).toHaveBeenCalledWith('all');
  });

  it('hides the "Matching activities only" item when no lens is narrowing the set', () => {
    renderRows(ctx({ filterActive: false }));
    fireEvent.click(screen.getByRole('button', { name: /Share & export/ }));
    expect(screen.getByRole('menuitem', { name: 'Schedule (CSV)' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Matching activities only/ })).toBeNull();
  });

  it('offers "Matching activities only (N)" and exports scope "matching" when a lens narrows', () => {
    renderRows(ctx({ filterActive: true, matchingCount: 3 }));
    fireEvent.click(screen.getByRole('button', { name: /Share & export/ }));
    const matching = screen.getByRole('menuitem', { name: 'Matching activities only (3)' });
    fireEvent.click(matching);
    expect(spies.exportScheduleCsv).toHaveBeenCalledWith('matching');
  });

  it('offers BOTH Diagram PNG extents (whole plan / current view) in the menu', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: /Share & export/ }));
    expect(
      screen.getByRole('menuitem', { name: 'Diagram — whole plan (PNG)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Diagram — current view (PNG)' }),
    ).toBeInTheDocument();
  });

  it('exports the whole plan PNG (extent "whole") from the whole-plan item', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: /Share & export/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Diagram — whole plan (PNG)' }));
    expect(spies.exportDiagramPng).toHaveBeenCalledWith('whole');
  });

  it('exports the current view PNG (extent "view") from the current-view item', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: /Share & export/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Diagram — current view (PNG)' }));
    expect(spies.exportDiagramPng).toHaveBeenCalledWith('view');
  });

  it('offers BOTH Diagram PDF extents (whole plan / current view) in the menu', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: /Share & export/ }));
    expect(
      screen.getByRole('menuitem', { name: 'Diagram — whole plan (PDF)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Diagram — current view (PDF)' }),
    ).toBeInTheDocument();
  });

  it('exports the whole plan PDF (extent "whole") from the whole-plan PDF item', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: /Share & export/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Diagram — whole plan (PDF)' }));
    expect(spies.exportDiagramPdf).toHaveBeenCalledWith('whole');
  });

  it('exports the current view PDF (extent "view") from the current-view PDF item', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: /Share & export/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Diagram — current view (PDF)' }));
    expect(spies.exportDiagramPdf).toHaveBeenCalledWith('view');
  });

  it('shows a loading state and blocks the PDF items while a PDF export is in flight (pdfExporting)', () => {
    renderRows(ctx({ pdfExporting: true }));
    fireEvent.click(screen.getByRole('button', { name: /Share & export/ }));
    const whole = screen.getByRole('menuitem', { name: 'Diagram — whole plan (PDF)' });
    const view = screen.getByRole('menuitem', { name: 'Diagram — current view (PDF)' });
    expect(whole).toHaveAttribute('aria-disabled', 'true');
    expect(view).toHaveAttribute('aria-disabled', 'true');
    // Disabled ⇒ picking is a no-op (guards the double-click), so the command never re-fires.
    fireEvent.click(whole);
    fireEvent.click(view);
    expect(spies.exportDiagramPdf).not.toHaveBeenCalled();
    // CSV / PNG stay operable while a PDF is loading.
    fireEvent.click(screen.getByRole('menuitem', { name: 'Schedule (CSV)' }));
    expect(spies.exportScheduleCsv).toHaveBeenCalledWith('all');
  });

  it('shades the whole trigger only when NOTHING inside it is actionable (ADR-0090 M2-T4)', () => {
    // `canShare: false` is load-bearing, not incidental. The trigger is shut when the exports have
    // no diagram AND the caller cannot share — because Share needs a permission, not a schedule.
    // The first version of this menu inherited the old Export button's `hasDiagram` gate and took
    // Share down with it on every freshly created plan.
    renderRows(ctx({ hasDiagram: false, canShare: false }));
    const trigger = screen.getByRole('button', { name: /Share & export/ });
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(trigger).toHaveAttribute('title', 'Add an activity first');
    fireEvent.click(trigger);
    // Disabled ⇒ the menu never opens, so no item is reachable.
    expect(screen.queryByRole('menuitem', { name: 'Schedule (CSV)' })).toBeNull();
  });

  it('renders the real Print… action (not the "Coming soon" placeholder) with the flag on', () => {
    renderRows(ctx());
    openDeliver();
    const print = screen.getByRole('menuitem', { name: 'Print…' });
    expect(print).not.toHaveAttribute('aria-disabled', 'true');
    expect(print).not.toHaveAttribute('title', 'Print… — Coming soon');
  });

  it('calls printDiagram when the Print… action is activated', () => {
    renderRows(ctx());
    openDeliver();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Print…' }));
    expect(spies.printDiagram).toHaveBeenCalledTimes(1);
  });

  it('shades the Print… action with its reason on an empty/uncomputed canvas (shade-don’t-hide)', () => {
    renderRows(ctx({ hasDiagram: false }));
    openDeliver();
    const print = screen.getByRole('menuitem', { name: 'Print…' });
    expect(print).toHaveAttribute('aria-disabled', 'true');
    // A `MenuItem` links its reason by `aria-describedby` rather than folding it into a `title`
    // (ADR-0082) — announced on focus, where a tooltip is not. Asserting the linked text is the
    // same guarantee in the vocabulary the destination actually uses.
    expect(print).toHaveAccessibleDescription('Add an activity first');
    fireEvent.click(print);
    expect(spies.printDiagram).not.toHaveBeenCalled();
  });
});

/**
 * **The all-shaded case** (ADR-0090 M2-T7, ADR-0082) — a Viewer on a freshly created plan, where
 * every row behind `Share & export` is shut: the exports need a computed diagram and Share needs a
 * permission this caller lacks.
 *
 * **The milestone specified that the group should render NO trigger here, and that is wrong on this
 * surface.** ADR-0082's no-trigger clause is about the Project Explorer's row menu, where a menu of
 * nothing but refusals is a dead end and its absence costs nothing. A **toolbar** is the opposite
 * case: ADR-0031 §4 makes the read-only↔editing flip legible precisely by keeping the row's shape
 * fixed and shading its members as a set — the same reason `penGated` items may not leave the pen
 * cluster. Removing a trigger by permission would reflow the row for a Viewer, so two people
 * looking at the same plan would see different bars and neither could be talked through the other's.
 *
 * So the rule for this surface is: **shade the trigger, and say why.** These assertions pin that,
 * and they pin the discrimination that makes it honest — the trigger is shut only when *nothing*
 * inside it is actionable, which is the defect M2-T4 shipped and caught.
 */
describe('Share & export — the all-shaded case (ADR-0090 M2-T7)', () => {
  it('shades the trigger with a reason rather than removing it', () => {
    renderRows(ctx({ hasDiagram: false, canShare: false }));
    const trigger = screen.getByRole('button', { name: /Share & export/ });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(trigger).toHaveAttribute('title', 'Add an activity first');
  });

  it('stays OPEN for a Viewer once the plan has a diagram — the exports are not permission-gated', () => {
    // The discrimination that makes the shade honest: a Viewer can export. Shading the trigger for
    // everyone without `plan:share` would have taken that away, and nothing would have failed.
    renderRows(ctx({ hasDiagram: true, canShare: false }));
    expect(screen.getByRole('button', { name: /Share & export/ })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('stays OPEN for a sharer on an uncomputed plan — sharing needs no schedule', () => {
    renderRows(ctx({ hasDiagram: false, canShare: true }));
    expect(screen.getByRole('button', { name: /Share & export/ })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
