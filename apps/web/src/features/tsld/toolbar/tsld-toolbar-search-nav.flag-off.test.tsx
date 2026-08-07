import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

/**
 * The **rollback contract** for `VITE_CANVAS_SEARCH_NAV` (`docs/specs/canvas-search-navigation/`
 * M1-T6).
 *
 * Lenses **on**, search navigation **off** — the shipping default until the M5 gate pass, and the
 * exact state an operator falls back to by setting `VITE_CANVAS_SEARCH_NAV=false` and rebuilding.
 * What it asserts is what the flag must restore: the field filters and nothing more.
 *
 * This suite is **kept, not weakened, at the flip** (the ADR-0053 M6 rule). A parity suite that gets
 * relaxed on the day the flag flips is not a rollback contract — it is a comment.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_LENSES_ENABLED: true,
  CANVAS_SEARCH_NAV_ENABLED: false,
}));

const goToMatch = vi.fn();
const escapeSearchField = vi.fn();

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({
    goToMatch,
    escapeSearchField,
    filterQuery: 'pile',
    hasDiagram: true,
    canvasActive: true,
    // Deliberately populated: even with a live read-out on the context, flag-off nothing renders it.
    searchStatus: { total: 4, index: 2 },
    ...over,
  });
}

function renderRows(context: TsldToolbarContext) {
  const rows = splitByRow(buildTsldToolbarItems());
  return render(
    <Toolbar
      items={rows.look}
      context={context}
      label="View and navigate"
      authoringEnabled
      alignEndGroup="object"
    />,
  );
}

const field = (): HTMLInputElement =>
  screen.getByRole('searchbox', { name: /search or filter activities/i });

describe('flag-off, the search field is today’s filter and nothing more', () => {
  it('Enter does nothing', () => {
    renderRows(ctx());
    goToMatch.mockClear();
    fireEvent.keyDown(field(), { key: 'Enter' });
    fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true });
    expect(goToMatch).not.toHaveBeenCalled();
  });

  it('does not prevent the default on Enter', () => {
    // The handler is not passed at all flag-off — not passed-and-inert. This is the assertion that
    // distinguishes the two, and it is the one that would catch a future refactor that "simplifies"
    // the conditional prop into an always-present handler with an internal flag check.
    renderRows(ctx());
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    field().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('Escape is the browser’s, exactly as it is today', () => {
    // Flag-off the handler is not passed at all, so Escape neither reaches the two-step rule nor is
    // prevented — the native `type="search"` clear and the canvas's own listener both keep today's
    // behaviour. This is the rollback contract for the ADR-0064 amendment.
    renderRows(ctx());
    escapeSearchField.mockClear();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    field().dispatchEvent(event);
    expect(escapeSearchField).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('is enabled in the Gantt, exactly as it is today', () => {
    // The interim shade is a search-navigation behaviour. Flag-off the field keeps its pre-existing
    // (inert-in-the-Gantt) state — which is the thing the rollback restores, not an improvement on it.
    renderRows(ctx({ canvasActive: false }));
    expect(field()).not.toHaveAttribute('aria-disabled');
    expect(field()).not.toHaveAttribute('title');
  });

  it('links no description — the field is exactly what it is today', () => {
    renderRows(ctx());
    expect(field()).not.toHaveAttribute('aria-describedby');
  });

  it('renders no clear button — the native ✕ stays exactly as it is today', () => {
    renderRows(ctx());
    expect(screen.queryByRole('button', { name: /clear search/i })).toBeNull();
  });

  it('renders no find read-out, even with one on the context', () => {
    expect(screen.queryByText(/2 of 4/)).toBeNull();
    renderRows(ctx());
    expect(screen.queryByText(/2 of 4/)).toBeNull();
    expect(screen.queryByText(/4 matches/i)).toBeNull();
  });
});

describe('flag-off, Zoom to selection does not exist', () => {
  it('registers no such item', () => {
    renderRows(ctx());
    expect(screen.queryByRole('button', { name: /zoom to selection/i })).toBeNull();
  });
});
