import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

// The flag-ON insight-lenses registry: the search field goes live and filter / colour-by /
// baseline-overlay swap their placeholders for real controls. The flag-off stubs are covered by
// `tsld-toolbar.test.tsx` (which pins CANVAS_LENSES_ENABLED off).
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_LENSES_ENABLED: true,
}));

const spies = {
  setFilterQuery: vi.fn(),
  toggleFilterAttr: vi.fn(),
  setColourMode: vi.fn(),
  toggleBaselineOverlay: vi.fn(),
};

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({
    setFilterQuery: spies.setFilterQuery,
    toggleFilterAttr: spies.toggleFilterAttr,
    setColourMode: spies.setColourMode,
    toggleBaselineOverlay: spies.toggleBaselineOverlay,
    hasActiveBaseline: true,
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

describe('TSLD toolbar — insight lenses (flag on)', () => {
  it('renders a live search field that drives the filter query', () => {
    renderRows(ctx());
    const search = screen.getByRole('searchbox', { name: 'Search or filter activities' });
    expect(search).not.toBeDisabled();
    fireEvent.change(search, { target: { value: 'concrete' } });
    expect(spies.setFilterQuery).toHaveBeenCalledWith('concrete');
  });

  it('shades the search field with aria-disabled (NOT native disabled) so it stays focusable, exposing its reason (A3)', () => {
    renderRows(ctx({ hasDiagram: false }));
    const search = screen.getByRole('searchbox', { name: 'Search or filter activities' });
    // Native `disabled` would drop the control from the roving tabindex order (focus stranding); use
    // aria-disabled so it stays focusable and the reason is reachable (WCAG 2.1.1 / 2.4.3 / 2.4.7).
    expect(search).not.toBeDisabled();
    expect(search).toHaveAttribute('aria-disabled', 'true');
    expect(search).toHaveAttribute('title', 'Add an activity first');
    // Focusable (not removed from the tab order)…
    search.focus();
    expect(search).toHaveFocus();
    // …and typing is a no-op while shaded (never drives the filter).
    fireEvent.change(search, { target: { value: 'x' } });
    expect(spies.setFilterQuery).not.toHaveBeenCalled();
  });

  it('opens the Filter menu and toggles an attribute', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: /Filter/ }));
    const panel = screen.getByRole('dialog', { name: 'Filter' });
    fireEvent.click(within(panel).getByLabelText('Critical'));
    expect(spies.toggleFilterAttr).toHaveBeenCalledWith('critical');
  });

  it('reflects an engaged attribute filter as pressed once the popover is closed (U1)', () => {
    renderRows(ctx({ filterAttrs: new Set(['critical']) }));
    // The popover is closed, but the trigger still shows the engaged (pressed) state.
    const trigger = screen.getByRole('button', { name: /Filter/ });
    expect(trigger).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows no pressed state when no attribute filter is engaged', () => {
    renderRows(ctx());
    expect(screen.getByRole('button', { name: /Filter/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shades the Filter trigger with its disabled reason on an empty canvas (A2)', () => {
    renderRows(ctx({ hasDiagram: false }));
    const trigger = screen.getByRole('button', { name: /Filter/ });
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(trigger).toHaveAttribute('title', 'Add an activity first');
  });

  // Colour-by moved into `View ▾` in ADR-0090 M2-T2 (183 px of pinned Row-1 width, paid at every
  // viewport). Both assertions came with it. The second is deliberately STRONGER than the one it
  // replaces: the old trigger always named the mode, so it could only ever pin one half. The
  // annotation is conditional, so both halves are now pinned — it names a surprising mode, and it
  // stays quiet in the ordinary one. Losing that second half is how a "show it only when it
  // matters" rule decays into "show it always" without anyone deciding to.
  it('switches colour mode from the View popover', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Colour · Total float' }));
    expect(spies.setColourMode).toHaveBeenCalledWith('totalFloat');
  });

  it('names a NON-DEFAULT colour mode on the View trigger', () => {
    renderRows(ctx({ colourMode: 'wbs' }));
    expect(screen.getByRole('button', { name: 'View · WBS group' })).toBeInTheDocument();
  });

  it('says nothing about colour on the View trigger at the default mode', () => {
    renderRows(ctx({ colourMode: 'criticality' }));
    expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /View · / })).not.toBeInTheDocument();
  });

  it('marks the active mode as the checked radio', () => {
    renderRows(ctx({ colourMode: 'wbs' }));
    fireEvent.click(screen.getByRole('button', { name: 'View · WBS group' }));
    expect(screen.getByRole('radio', { name: 'Colour · WBS group' })).toBeChecked();
  });

  it('toggles the Baseline overlay when an active baseline exists', () => {
    renderRows(ctx());
    const overlay = screen.getByRole('button', { name: 'Baseline overlay' });
    expect(overlay).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(overlay);
    expect(spies.toggleBaselineOverlay).toHaveBeenCalledOnce();
  });

  it('disables the Baseline overlay with a reason when there is no active baseline', () => {
    renderRows(ctx({ hasActiveBaseline: false }));
    const overlay = screen.getByRole('button', { name: 'Baseline overlay' });
    expect(overlay).toHaveAttribute('aria-disabled', 'true');
    expect(overlay).toHaveAttribute('title', 'Baseline overlay — No active baseline');
    fireEvent.click(overlay);
    expect(spies.toggleBaselineOverlay).not.toHaveBeenCalled();
  });

  it('disables the Baseline overlay while variance is loading / errored', () => {
    renderRows(ctx({ varianceLoading: true }));
    expect(screen.getByRole('button', { name: 'Baseline overlay' })).toHaveAttribute(
      'title',
      'Baseline overlay — Loading baseline…',
    );
  });

  // U4 — the pinned Look-row lens render controls (search / Filter / View) never demote into `⋯`
  // (render items stay inline), so at a constrained width they must remain KEYBOARD/AT-reachable — the
  // toolbar's roving tabindex always includes them (they carry `data-toolbar-focusable`), so a keyboard
  // user reaches them by Arrow keys and they are never a trap, even when the row is narrow. (Real
  // horizontal clipping is a property of the shared `overflow-hidden` primitive — not lens-specific —
  // and the demotable buttons overflow first to make room.)
  it('keeps the pinned lens controls keyboard-reachable at a constrained width (U4)', () => {
    const { container } = render(
      <div style={{ width: 320 }}>
        <Toolbar
          items={splitByRow(buildTsldToolbarItems()).look}
          context={ctx()}
          label="View and navigate"
          authoringEnabled
          alignEndGroup="object"
        />
      </div>,
    );
    // `colour-by` left this list in ADR-0090 M2-T2 — it is inside `View ▾` now, and `view` is
    // itself a pinned render control, so the reachability guarantee still covers the same commands
    // by covering the popover that holds them.
    for (const id of ['search', 'filter', 'view']) {
      const el = container.querySelector(`[data-toolbar-item="${id}"]`);
      expect(el).not.toBeNull();
      // A roving-tabindex member (focusable marker present) — reachable by Arrow keys, not stranded.
      expect(el).toHaveAttribute('data-toolbar-focusable', '');
      (el as HTMLElement).focus();
      expect(el).toHaveFocus();
    }
  });
});
