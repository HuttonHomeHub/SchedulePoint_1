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

beforeEach(() => vi.clearAllMocks());

describe('TSLD toolbar — export & print (flag on)', () => {
  it('renders a real Export menu-button (not the "Coming soon" placeholder)', () => {
    renderRows(ctx());
    const trigger = screen.getByRole('button', { name: /Export/ });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('exports the whole schedule (scope "all") from the Schedule (CSV) item', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Schedule (CSV)' }));
    expect(spies.exportScheduleCsv).toHaveBeenCalledWith('all');
  });

  it('hides the "Matching activities only" item when no lens is narrowing the set', () => {
    renderRows(ctx({ filterActive: false }));
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    expect(screen.getByRole('menuitem', { name: 'Schedule (CSV)' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Matching activities only/ })).toBeNull();
  });

  it('offers "Matching activities only (N)" and exports scope "matching" when a lens narrows', () => {
    renderRows(ctx({ filterActive: true, matchingCount: 3 }));
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    const matching = screen.getByRole('menuitem', { name: 'Matching activities only (3)' });
    fireEvent.click(matching);
    expect(spies.exportScheduleCsv).toHaveBeenCalledWith('matching');
  });

  it('offers BOTH Diagram PNG extents (whole plan / current view) in the menu', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    expect(
      screen.getByRole('menuitem', { name: 'Diagram — whole plan (PNG)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Diagram — current view (PNG)' }),
    ).toBeInTheDocument();
  });

  it('exports the whole plan PNG (extent "whole") from the whole-plan item', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Diagram — whole plan (PNG)' }));
    expect(spies.exportDiagramPng).toHaveBeenCalledWith('whole');
  });

  it('exports the current view PNG (extent "view") from the current-view item', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Diagram — current view (PNG)' }));
    expect(spies.exportDiagramPng).toHaveBeenCalledWith('view');
  });

  it('offers BOTH Diagram PDF extents (whole plan / current view) in the menu', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    expect(
      screen.getByRole('menuitem', { name: 'Diagram — whole plan (PDF)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Diagram — current view (PDF)' }),
    ).toBeInTheDocument();
  });

  it('exports the whole plan PDF (extent "whole") from the whole-plan PDF item', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Diagram — whole plan (PDF)' }));
    expect(spies.exportDiagramPdf).toHaveBeenCalledWith('whole');
  });

  it('exports the current view PDF (extent "view") from the current-view PDF item', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Diagram — current view (PDF)' }));
    expect(spies.exportDiagramPdf).toHaveBeenCalledWith('view');
  });

  it('shows a loading state and blocks the PDF items while a PDF export is in flight (pdfExporting)', () => {
    renderRows(ctx({ pdfExporting: true }));
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
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

  it('shades the Export control with its reason on an empty/uncomputed canvas (shade-don’t-hide)', () => {
    renderRows(ctx({ hasDiagram: false }));
    const trigger = screen.getByRole('button', { name: /Export/ });
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(trigger).toHaveAttribute('title', 'Add an activity first');
    fireEvent.click(trigger);
    // Disabled ⇒ the menu never opens, so no item is reachable.
    expect(screen.queryByRole('menuitem', { name: 'Schedule (CSV)' })).toBeNull();
  });

  it('renders the real Print… action (not the "Coming soon" placeholder) with the flag on', () => {
    renderRows(ctx());
    const print = screen.getByRole('button', { name: 'Print…' });
    expect(print).not.toHaveAttribute('aria-disabled', 'true');
    expect(print).not.toHaveAttribute('title', 'Print… — Coming soon');
  });

  it('calls printDiagram when the Print… action is activated', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: 'Print…' }));
    expect(spies.printDiagram).toHaveBeenCalledTimes(1);
  });

  it('shades the Print… action with its reason on an empty/uncomputed canvas (shade-don’t-hide)', () => {
    renderRows(ctx({ hasDiagram: false }));
    const print = screen.getByRole('button', { name: 'Print…' });
    expect(print).toHaveAttribute('aria-disabled', 'true');
    expect(print).toHaveAttribute('title', 'Print… — Add an activity first');
    fireEvent.click(print);
    expect(spies.printDiagram).not.toHaveBeenCalled();
  });
});
