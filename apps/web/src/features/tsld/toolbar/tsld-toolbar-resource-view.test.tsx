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
/**
 * The description a lens row exposes — **all** of it. `aria-describedby` takes an id *list*, and
 * since ADR-0090 M5 this row can carry two: why it is shut, and what it does when you tick it
 * (`docs/TECH_DEBT.md` #125). The single-id version of this helper returned `null` the moment the
 * second id appeared, which reads as "no reason at all" rather than as a helper that stopped
 * keeping up.
 */
function lensReason(el: HTMLElement): string | null {
  const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  if (ids.length === 0) return null;
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
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

/**
 * **The row says what it is about to do** (ADR-0090 M5, closing `docs/TECH_DEBT.md` #125).
 *
 * `Resource view` is the only member of `View ▾` that opens a panel rather than marking the canvas.
 * The panel takes focus (ADR-0049 — a revealed panel should receive it) and the popover closes
 * behind the departing focus, so from inside a list that invites toggling several things it read as
 * being thrown out. The focus behaviour is right and an `e2e-resource-view` assertion depends on it;
 * what was missing was any warning, so the note is the fix and the surprise is what goes.
 */
describe('the Resource view row explains that it opens a panel', () => {
  it('carries a standing note, linked as a description rather than folded into the name', () => {
    renderRows(ctx({ resourceViewOpen: false, hasDiagram: true }));
    const item = viewLens('Resource view');
    expect(item).toHaveAccessibleName('Resource view');
    expect(lensReason(item)).toContain('Opens the resource panel and moves focus to it');
  });

  it('keeps both the note and the shut reason when the canvas is empty', () => {
    // Two ids on one `aria-describedby`. Naming only one silently drops the other, and "why it is
    // shut" and "what it does" are both wanted — the case that broke the single-id helper above.
    renderRows(ctx({ resourceViewOpen: false, hasDiagram: false }));
    const text = lensReason(viewLens('Resource view'));
    expect(text).toContain('Add an activity first');
    expect(text).toContain('Opens the resource panel');
  });

  it('gives a plain lens no note at all', () => {
    // The note exists for exactly one row. A neighbour acquiring one would mean the distinction it
    // draws has been lost.
    renderRows(ctx({ hasDiagram: true }));
    expect(lensReason(viewLens('Flag over-allocated')) ?? '').not.toContain('Opens the');
  });
});
