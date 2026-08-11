import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

// The flag-ON resource-view registry (Stage E, ADR-0049): `resource-view` swaps its "Coming soon"
// placeholder for a real pressed-state toggle. The flag-off stub is covered by `tsld-toolbar.test.tsx`
// (which pins CANVAS_RESOURCE_VIEW_ENABLED off). Only this flag is forced on — the rest stay real.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_RESOURCE_VIEW_ENABLED: true,
}));

const spies = { toggleResourceView: vi.fn(), toggleOverAllocation: vi.fn() };

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({
    toggleResourceView: spies.toggleResourceView,
    toggleOverAllocation: spies.toggleOverAllocation,
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
 * Open `View ▾` and return one relocated lens checkbox (ADR-0090 M2-T2).
 *
 * These assertions came across from Row 1 unchanged in substance — pressed state, both shade
 * reasons, the clickable-to-off rule — but their control changed shape, so the vocabulary changes
 * with it: `aria-pressed` on a button becomes `checked` on a checkbox, and a `title` tooltip becomes
 * an `aria-describedby`-linked reason. That second swap is a strict improvement and the reason the
 * move is safe at all: a `title` is not reliably announced on a shut control, and ADR-0083's whole
 * point is that a reason nobody can read is not a reason.
 */
function viewLens(name: string): HTMLElement {
  const trigger = screen.getByRole('button', { name: /^View/ });
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
  return screen.getByRole('checkbox', { name });
}

/** The reason text linked to a shut lens checkbox, or null when it is open. */
function lensReason(el: HTMLElement): string | null {
  const id = el.getAttribute('aria-describedby');
  return id ? (document.getElementById(id)?.textContent ?? null) : null;
}

beforeEach(() => vi.clearAllMocks());

describe('TSLD toolbar — resource-view lens (flag on)', () => {
  it('is a real toggle button (not a "Coming soon" placeholder) with a pressed state', () => {
    renderRows(ctx({ resourceViewOpen: false }));
    const item = viewLens('Resource view');
    // A real, live toggle — not shut, and unchecked rather than merely present.
    expect(item).not.toHaveAttribute('aria-disabled', 'true');
    expect(item).not.toBeChecked();
  });

  it('reflects the open state as pressed', () => {
    renderRows(ctx({ resourceViewOpen: true }));
    expect(viewLens('Resource view')).toBeChecked();
  });

  it('toggles the resource strip on activation', () => {
    renderRows(ctx({ resourceViewOpen: false }));
    fireEvent.click(viewLens('Resource view'));
    expect(spies.toggleResourceView).toHaveBeenCalledOnce();
  });

  it('shades — not hides — on an empty/uncomputed canvas, disabled with the shared lens reason', () => {
    renderRows(ctx({ hasDiagram: false }));
    const item = viewLens('Resource view');
    expect(item).toHaveAttribute('aria-disabled', 'true');
    // The shared "Add an activity first" lens reason, now READABLE rather than in a `title`.
    expect(lensReason(item)).toContain('Add an activity first');
    fireEvent.click(item);
    expect(spies.toggleResourceView).not.toHaveBeenCalled();
  });
});

describe('TSLD toolbar — over-allocation highlight (flag on, Stage E M2)', () => {
  it('is a real toggle (a second lens item, not a "Coming soon" placeholder) with a pressed state', () => {
    renderRows(ctx({ overAllocationHighlight: false, hasOverAllocation: true }));
    const item = viewLens('Flag over-allocated');
    expect(item).not.toHaveAttribute('aria-disabled', 'true');
    expect(item).not.toBeChecked();
  });

  it('reflects the highlight mode as pressed', () => {
    renderRows(ctx({ overAllocationHighlight: true, hasOverAllocation: true }));
    expect(viewLens('Flag over-allocated')).toBeChecked();
  });

  it('toggles the highlight on activation', () => {
    renderRows(ctx({ overAllocationHighlight: false, hasOverAllocation: true }));
    fireEvent.click(viewLens('Flag over-allocated'));
    expect(spies.toggleOverAllocation).toHaveBeenCalledOnce();
  });

  it('shades — not hides — with the empty-state reason when nothing is over-allocated', () => {
    renderRows(ctx({ hasOverAllocation: false }));
    const item = viewLens('Flag over-allocated');
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(lensReason(item)).toContain('No over-allocation to show');
    fireEvent.click(item);
    expect(spies.toggleOverAllocation).not.toHaveBeenCalled();
  });

  it('shades with the shared lens reason on an empty/uncomputed canvas (diagram gate wins first)', () => {
    renderRows(ctx({ hasDiagram: false, hasOverAllocation: false }));
    const item = viewLens('Flag over-allocated');
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(lensReason(item)).toContain('Add an activity first');
  });

  it('stays enabled (clickable-to-off) when active but a recalc cleared all over-allocation (B5)', () => {
    // The mode is ON but nothing is currently over-allocated — the button must NOT be a stuck-on
    // dead-end (aria-pressed=true AND aria-disabled=true). It stays enabled so a click toggles it off.
    renderRows(ctx({ overAllocationHighlight: true, hasOverAllocation: false }));
    const item = viewLens('Flag over-allocated');
    expect(item).toBeChecked();
    expect(item).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(item);
    expect(spies.toggleOverAllocation).toHaveBeenCalledOnce();
  });
});
