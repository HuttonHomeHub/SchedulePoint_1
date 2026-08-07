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
const escapeSearchField = vi.fn();
const zoomToSelection = vi.fn();
const setFilterQuery = vi.fn();

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({
    goToMatch,
    escapeSearchField,
    zoomToSelection,
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
  escapeSearchField.mockClear();
  zoomToSelection.mockClear();
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

describe('Escape belongs to the field', () => {
  it('hands Escape to the field’s own two-step rule', () => {
    renderRows(ctx());
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(escapeSearchField).toHaveBeenCalledOnce();
  });

  it('prevents the default, so the native ✕ cannot clear it unannounced', () => {
    // `type="search"` clears itself on Escape in Blink and WebKit. Without `preventDefault` the
    // native clear and the handled one both fire, so the announced step races an unannounced one.
    renderRows(ctx());
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    field().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not walk the match set', () => {
    renderRows(ctx());
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(goToMatch).not.toHaveBeenCalled();
  });

  it('ignores Escape while the field is shaded', () => {
    renderRows(ctx({ hasDiagram: false }));
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(escapeSearchField).not.toHaveBeenCalled();
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

describe('the count reaches the accessibility tree', () => {
  // The gate-pass finding (M5): the visible chip is `aria-hidden` so it cannot duplicate the
  // announcer, which left a screen-reader user with no count at all until they pressed Enter — a
  // read-out on screen and none in the accessibility tree.
  it('describes the field with the match count', () => {
    renderRows(ctx({ searchStatus: { total: 7, index: null } }));
    const described = field().getAttribute('aria-describedby');
    expect(described).toBeTruthy();
    const node = document.getElementById(described!);
    expect(node?.textContent).toMatch(/7 activities match/i);
    expect(node?.textContent).toMatch(/press enter/i);
  });

  it('describes the position once cycling has started', () => {
    renderRows(ctx({ searchStatus: { total: 7, index: 3 } }));
    const node = document.getElementById(field().getAttribute('aria-describedby')!);
    expect(node?.textContent).toMatch(/match 3 of 7/i);
  });

  it('says "1 activity matches", not "1 activities match"', () => {
    renderRows(ctx({ searchStatus: { total: 1, index: null } }));
    const node = document.getElementById(field().getAttribute('aria-describedby')!);
    expect(node?.textContent).toMatch(/1 activity matches/i);
  });

  it('is not a live region — the announcer already speaks on jump', () => {
    // Two polite regions would say the number twice on every keystroke.
    renderRows(ctx({ searchStatus: { total: 7, index: 3 } }));
    const node = document.getElementById(field().getAttribute('aria-describedby')!);
    expect(node).not.toHaveAttribute('aria-live');
    expect(node).not.toHaveAttribute('role', 'status');
  });

  it('describes nothing when there is nothing to describe', () => {
    renderRows(ctx({ searchStatus: null }));
    expect(field()).not.toHaveAttribute('aria-describedby');
  });
});

describe('the clear button', () => {
  it('appears only once there is something to clear', () => {
    renderRows(ctx({ filterQuery: '' }));
    expect(screen.queryByRole('button', { name: /clear search/i })).toBeNull();
  });

  it('empties the field and returns focus to it', () => {
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
  it('is enabled in the Gantt too, once M4 gave it a match set there', () => {
    // M1 shaded it here, honestly, because Enter had nothing to centre in the Gantt. M4 handed the
    // Gantt the same match set and a row scroll, so the interim shade is reverted rather than left
    // as a permanent half-truth — which is what it becomes if nobody comes back to it.
    renderRows(ctx({ canvasActive: false }));
    expect(field()).not.toHaveAttribute('aria-disabled');
  });

  it('is enabled in the diagram', () => {
    renderRows(ctx());
    expect(field()).not.toHaveAttribute('aria-disabled');
  });

  it('still shades on an empty plan, in either view', () => {
    renderRows(ctx({ hasDiagram: false, canvasActive: false }));
    expect(field()).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('Zoom to selection', () => {
  const activity = { id: 'a', name: 'Piling' } as TsldToolbarContext['selectedActivity'];
  const button = () => screen.getByRole('button', { name: /zoom to selection/i });

  it('frames the selection when one is held in the diagram', () => {
    renderRows(ctx({ selectedActivity: activity }));
    fireEvent.click(button());
    expect(zoomToSelection).toHaveBeenCalledOnce();
  });

  it('says to select something first when nothing is selected', () => {
    renderRows(ctx({ selectedActivity: undefined }));
    expect(button()).toHaveAttribute('aria-disabled', 'true');
    // The toolbar prefixes the item label onto the reason, so a tooltip reads as a sentence.
    expect(button()).toHaveAttribute('title', 'Zoom to selection — Select an activity first');
  });

  it('says it is diagram-only in the Gantt — the first version, not a later fix', () => {
    // `zoomToActivity` is a canvas-handle command and the Gantt mounts no canvas. Without this the
    // button would be lit and do nothing, which is exactly the ADR-0059 M6 defect.
    renderRows(ctx({ selectedActivity: activity, canvasActive: false }));
    expect(button()).toHaveAttribute('title', 'Zoom to selection — Only in the diagram view');
  });

  it('says to add an activity on an empty plan, ahead of the other two reasons', () => {
    renderRows(ctx({ selectedActivity: undefined, canvasActive: false, hasDiagram: false }));
    expect(button()).toHaveAttribute('title', 'Zoom to selection — Add an activity to zoom to');
  });

  it('does not fire while shaded', () => {
    renderRows(ctx({ selectedActivity: undefined }));
    fireEvent.click(button());
    expect(zoomToSelection).not.toHaveBeenCalled();
  });
});
