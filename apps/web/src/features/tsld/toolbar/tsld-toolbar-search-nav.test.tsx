import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

// Flag-ON search navigation. `VITE_CANVAS_SEARCH_NAV` is derived from `VITE_CANVAS_LENSES`, so both
// are mocked on — a build with search nav on and lenses off cannot exist, and mocking only the
// derived flag would test a state the product never reaches.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_LENSES_ENABLED: true,
  CANVAS_SEARCH_NAV_ENABLED: true,
}));

const goToMatch = vi.fn();
const setFilterQuery = vi.fn();

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({
    goToMatch,
    setFilterQuery,
    filterQuery: 'pile',
    hasDiagram: true,
    canvasActive: true,
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

beforeEach(() => {
  goToMatch.mockClear();
  setFilterQuery.mockClear();
});

describe('the search field walks the match set', () => {
  it('Enter jumps forwards', () => {
    renderRows(ctx());
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(goToMatch).toHaveBeenCalledExactlyOnceWith('next');
  });

  it('Shift+Enter jumps backwards', () => {
    renderRows(ctx());
    fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true });
    expect(goToMatch).toHaveBeenCalledExactlyOnceWith('previous');
  });

  it('prevents the default, so an Enter can never submit an enclosing form', () => {
    // The toolbar has no form today. A future host might, and a search that navigates the browser
    // away is a worse failure than one that does nothing.
    renderRows(ctx());
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    field().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves other keys alone', () => {
    renderRows(ctx());
    fireEvent.keyDown(field(), { key: 'a' });
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    expect(goToMatch).not.toHaveBeenCalled();
  });

  it('keeps focus in the field', () => {
    renderRows(ctx());
    const input = field();
    input.focus();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(document.activeElement).toBe(input);
  });

  it('ignores Enter while the field is shaded', () => {
    // A shaded field stays focusable (`aria-disabled`, not native `disabled`) so its reason is
    // reachable — which means it can still receive the key, and must do nothing with it.
    renderRows(ctx({ hasDiagram: false }));
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(goToMatch).not.toHaveBeenCalled();
  });
});

describe('the find read-out', () => {
  it('says how many matched before the first jump', () => {
    renderRows(ctx({ searchStatus: { total: 12, index: null } }));
    expect(screen.getByText('12 matches')).toBeInTheDocument();
  });

  it('says which one you are on after a jump', () => {
    renderRows(ctx({ searchStatus: { total: 12, index: 3 } }));
    expect(screen.getByText('3 of 12')).toBeInTheDocument();
  });

  it('says "1 match", not "1 matches"', () => {
    renderRows(ctx({ searchStatus: { total: 1, index: null } }));
    expect(screen.getByText('1 match')).toBeInTheDocument();
  });

  it('is absent when there is nothing to report', () => {
    renderRows(ctx({ searchStatus: null }));
    expect(screen.queryByText(/matches?$/)).toBeNull();
  });

  it('is aria-hidden, so a screen reader hears the announcer once and not twice', () => {
    const { container } = renderRows(ctx({ searchStatus: { total: 4, index: 2 } }));
    const chip = container.querySelector('[aria-hidden="true"]:has(> span)');
    expect(screen.getByText('2 of 4').closest('[aria-hidden="true"]')).not.toBeNull();
    expect(chip).not.toBeNull();
  });

  it('is not a tab stop', () => {
    const { container } = renderRows(ctx({ searchStatus: { total: 4, index: 2 } }));
    const chip = screen.getByText('2 of 4').closest('span[aria-hidden="true"]');
    expect(chip).not.toBeNull();
    // Presentational items never join the roving tabindex — a read-out you have to tab past is a
    // control that does nothing.
    expect(chip).not.toHaveAttribute('tabindex', '0');
    expect(container.querySelectorAll('[data-toolbar-focusable]').length).toBeGreaterThan(0);
  });
});

describe('the clear button', () => {
  it('appears only once there is something to clear', () => {
    renderRows(ctx({ filterQuery: '' }));
    expect(screen.queryByRole('button', { name: /clear search/i })).toBeNull();
  });

  it('empties the field and returns focus to it', async () => {
    renderRows(ctx());
    const button = screen.getByRole('button', { name: /clear search/i });
    button.focus();
    fireEvent.click(button);
    expect(setFilterQuery).toHaveBeenCalledExactlyOnceWith('');
    // Never `<body>`: the planner cleared in order to type something else. This is also why the
    // button unmounts on the click that moves focus off it, rather than disabling in place.
    expect(document.activeElement).toBe(field());
  });

  it('is reachable by keyboard, unlike the native ✕ it replaces', () => {
    renderRows(ctx());
    const button = screen.getByRole('button', { name: /clear search/i });
    expect(button).not.toHaveAttribute('tabindex', '-1');
    expect(button).not.toBeDisabled();
  });

  it('is absent while the field is shaded', () => {
    renderRows(ctx({ hasDiagram: false }));
    expect(screen.queryByRole('button', { name: /clear search/i })).toBeNull();
  });
});

describe('the field is honest about where it works', () => {
  it('is shaded with a reason in the Gantt, where there is nothing to centre', () => {
    renderRows(ctx({ canvasActive: false }));
    const input = field();
    expect(input).toHaveAttribute('aria-disabled', 'true');
    expect(input).toHaveAttribute('title', 'Only in the diagram view');
  });

  it('is enabled in the diagram', () => {
    renderRows(ctx());
    expect(field()).not.toHaveAttribute('aria-disabled');
  });

  it('keeps the empty-plan reason ahead of the view reason', () => {
    // Both conditions can be false at once. "Add an activity first" is the one the planner can act
    // on, so it wins — the layered-reason pattern the zoom cluster already uses.
    renderRows(ctx({ hasDiagram: false, canvasActive: false }));
    expect(field()).toHaveAttribute('title', expect.not.stringMatching(/diagram view/i));
  });
});
