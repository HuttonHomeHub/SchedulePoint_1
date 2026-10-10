import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Deck } from './Deck';
import { defineToolbar, type ToolbarItem } from './toolbar-registry';

/**
 * **`Deck` had no unit suite at all until 2026-08-25 (ADR-0110 M4).**
 *
 * Its keyboard docblock said "this guard was dropped once and the test caught it immediately" — and
 * that test is `Toolbar.test.tsx`'s, about the OTHER primitive. Nothing here had ever asserted the
 * deck's own roving model, which is how the defect below shipped: a comment describing coverage
 * that belonged to a neighbour.
 */
interface Ctx {
  readonly nothing?: never;
}

const items: ToolbarItem<Ctx>[] = defineToolbar<Ctx>([
  { id: 'today', group: 'frame', order: 1, tier: 1, label: 'Today', onActivate: () => {} },
  { id: 'fit', group: 'frame', order: 2, tier: 1, label: 'Fit', onActivate: () => {} },
  {
    id: 'search',
    group: 'find',
    order: 1,
    tier: 1,
    label: 'Search activities',
    render: (_ctx, { itemProps }) => <input aria-label="Search activities" {...itemProps} />,
  },
  { id: 'filter', group: 'find', order: 2, tier: 1, label: 'Filter', onActivate: () => {} },
  {
    id: 'add-activity',
    group: 'tools',
    order: 1,
    tier: 1,
    label: 'Add activity',
    onActivate: () => {},
  },
  { id: 'export', group: 'output', order: 1, tier: 1, label: 'Export', onActivate: () => {} },
]);

function renderDeck(): void {
  render(<Deck items={items} context={{}} label="Plan commands" />);
}

/**
 * A separate fixture, because a date field legitimately **traps** the vertical arrows and would
 * therefore falsify the "every command is reachable by repeated ArrowDown" case above. In the real
 * product this input only exists inside an **open, portalled popover** — the deck's permanent stop
 * is the trigger button — so a bare date item in the shared fixture would not model anything.
 */
const claimingItems: ToolbarItem<Ctx>[] = defineToolbar<Ctx>([
  { id: 'today', group: 'frame', order: 1, tier: 1, label: 'Today', onActivate: () => {} },
  {
    id: 'claims-arrows',
    group: 'output',
    order: 1,
    tier: 1,
    label: 'Claims arrows',
    render: (_ctx, { itemProps }) => (
      <button
        aria-label="Claims arrows"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') e.preventDefault();
        }}
        {...itemProps}
      />
    ),
  },
]);

const dateItems: ToolbarItem<Ctx>[] = defineToolbar<Ctx>([
  { id: 'today', group: 'frame', order: 1, tier: 1, label: 'Today', onActivate: () => {} },
  {
    id: 'go-to-date',
    group: 'frame',
    order: 2,
    tier: 1,
    label: 'Go to date',
    render: (_ctx, { itemProps }) => <input type="date" aria-label="Go to date" {...itemProps} />,
  },
]);

/** Which registry item currently holds focus, by id — never by copy. */
function focusedItemId(): string | null {
  return (
    document.activeElement?.closest('[data-toolbar-item]')?.getAttribute('data-toolbar-item') ??
    null
  );
}

describe('Deck — the roving keyboard model', () => {
  it('arrow keys move between commands', () => {
    renderDeck();
    const today = screen.getByRole('button', { name: 'Today' });
    today.focus();
    expect(focusedItemId()).toBe('today');
    fireEvent.keyDown(today, { key: 'ArrowRight' });
    expect(focusedItemId()).toBe('fit');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(focusedItemId()).toBe('today');
  });

  it('a text field keeps the horizontal and line keys for its caret', () => {
    renderDeck();
    const field = screen.getByRole('textbox', { name: 'Search activities' });
    field.focus();
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      fireEvent.keyDown(field, { key });
      expect(focusedItemId(), `${key} was stolen from the caret`).toBe('search');
    }
  });

  /**
   * **The regression. WCAG 2.2 §2.1.1 Keyboard, level A.**
   *
   * The guard used to veto all six navigation keys for any form field, which sounds conservative
   * and was not: focusing the search field makes it the roving stop, so every other control drops
   * to `tabIndex={-1}` and the deck's only Tab entry point IS the field. With the arrows and
   * Home/End all going to the caret, there was no key left that reached the other commands —
   * measured in a browser at 18 of 27 unreachable. Not a keyboard *trap* (Tab exits, so §2.1.2 is
   * satisfied), which is exactly why nothing noticed: focus was never stuck, only the commands were
   * unreachable.
   *
   * A single-line input does nothing with the vertical arrows, so they are the route out.
   *
   * **Verified red against the pre-fix `isTextEntry`**, which returned true for every INPUT and
   * therefore left focus on `search` for both presses.
   */
  it('the vertical arrows leave a single-line field, so the deck stays keyboard-reachable', () => {
    renderDeck();
    const field = screen.getByRole('textbox', { name: 'Search activities' });
    field.focus();
    expect(focusedItemId()).toBe('search');

    fireEvent.keyDown(field, { key: 'ArrowDown' });
    expect(focusedItemId(), 'ArrowDown did not leave the search field').toBe('filter');
  });

  it('every command is reachable from the field by repeated ArrowDown', () => {
    renderDeck();
    screen.getByRole('textbox', { name: 'Search activities' }).focus();

    const reached = new Set<string>();
    // One full lap of the roving sequence plus slack; it wraps, so a lap is enough.
    for (let i = 0; i < 20; i += 1) {
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
      const id = focusedItemId();
      if (id !== null) reached.add(id);
    }
    for (const id of ['today', 'fit', 'search', 'filter', 'add-activity', 'export']) {
      expect(reached, `${id} is unreachable by keyboard from the search field`).toContain(id);
    }
  });

  /**
   * **The regression the shared module was extracted for** (`docs/TECH_DEBT.md` #192), asserted
   * through the real primitive rather than only against the pure function.
   *
   * The shipped `Go to date` control is a `render` item supplying `<input type="date">`, and a date
   * input steps its focused segment with the vertical arrows. Verified red against the guard
   * released in `web-v0.106.0`: focus moved to the next command and the date never changed.
   */
  it('a date render-item keeps the vertical arrows the toolbar would otherwise take', () => {
    render(<Deck items={dateItems} context={{}} label="Plan commands" />);
    // A `<input type="date">` maps to no ARIA textbox role — by label, not by role.
    const field = screen.getByLabelText('Go to date');
    field.focus();
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      fireEvent.keyDown(field, { key });
      expect(focusedItemId(), `${key} was taken from the date field`).toBe('go-to-date');
    }
  });

  /**
   * A descendant that already handled the key wins. `ToolbarSplitButton`'s caret, `Menu` and
   * `Combobox` all call `preventDefault()` without `stopPropagation()`, so the event still arrives
   * at the container through the React tree — and when the caret is disabled it has already moved
   * focus somewhere the roving model cannot see, where a naive `indexOf` returns -1 and throws
   * focus to the deck's FIRST stop.
   */
  it('stands down when a descendant has already handled the key', () => {
    render(<Deck items={claimingItems} context={{}} label="Plan commands" />);
    const button = screen.getByRole('button', { name: 'Claims arrows' });
    button.focus();
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    expect(focusedItemId(), 'the deck moved focus over a handled key').toBe('claims-arrows');
  });
});

/**
 * **The captions are static labels, not disclosure buttons** (workspace visual polish, 2026-08-28).
 *
 * The deck shipped with foldable groups and this file held three cases about the fold's `hasActive`
 * guard; the product owner's steer removed the fold ("it adds very little and I don't think someone
 * is ever going to collapse a toolbar"), so the guard, the persisted fold set and the caption
 * buttons went with it. What replaces those cases is the new contract, asserted in both directions
 * so a fold quietly returning fails rather than reflowing past a green suite:
 *
 * - no caption renders as a button (nothing named `<caption> commands`, nothing with
 *   `aria-expanded` anywhere in the deck);
 * - the caption WORD still reaches AT exactly once, as the group's own name — the visible span is
 *   `aria-hidden` precisely so "View, group — View" is not announced twice;
 * - captions are outside the roving order (a static label in the sequence would be a stop that
 *   does nothing — the inverse of the defect that put them in it).
 */
describe('Deck — the captions are gone and the group names are not', () => {
  it('renders no caption at all, and keeps every group name for AT', () => {
    renderDeck();
    // The old buttons were named `<caption> commands`; none may survive, under any state.
    expect(screen.queryByRole('button', { name: /commands$/ })).not.toBeInTheDocument();
    expect(document.querySelector('[aria-expanded]')).toBeNull();

    // **The grouping is kept and this is the milestone's acceptance condition** (console epic
    // M6-T1): the word reaches AT exactly as it did, as the group's own name. Nothing was lost,
    // because the span that went was `aria-hidden` — the argument ADR-0119 used to delete `MODE`.
    for (const name of ['View', 'Find', 'Author', 'Plan']) {
      expect(screen.getByRole('group', { name })).toBeInTheDocument();
    }

    // **And the visible word is gone**, asserted in the group that carries the longest of the four
    // rather than by searching the deck: a document-wide query for "Author" would be satisfied by
    // the group's own `aria-label`, which is exactly the thing that must survive. This case read
    // the opposite until M6 — it required the span to exist and be `aria-hidden` — so it is
    // inverted here rather than deleted, which is what keeps it a discriminator in both
    // directions.
    const authorGroup = screen.getByRole('group', { name: 'Author' });
    expect(
      [...authorGroup.querySelectorAll('span')].filter((el) => el.textContent === 'Author'),
    ).toEqual([]);
  });

  /**
   * **Kept after the captions went, and deliberately.** Its subject was a static label that could
   * have crept back into the sequence; with no label at all the `caption:` filter can only pass —
   * so the assertion that carries this case now is the pinned positive, which still proves the
   * roving walk laps the deck. Deleting it would remove the only unit-level cover of that walk to
   * retire a filter that costs nothing.
   */
  it('laps the deck without ever landing on a caption', () => {
    renderDeck();
    const today = screen.getByRole('button', { name: 'Today' });
    today.focus();
    // One full lap: every stop visited must be a command, never a caption. ArrowDown to leave a
    // text field (a single-line input keeps the horizontal keys for its caret — #189), ArrowRight
    // everywhere else, the same two-key walk the e2e sweep models.
    const reached = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const inField = document.activeElement?.tagName === 'INPUT';
      fireEvent.keyDown(document.activeElement!, { key: inField ? 'ArrowDown' : 'ArrowRight' });
      const id = focusedItemId();
      if (id !== null) reached.add(id);
    }
    expect([...reached].filter((id) => id.startsWith('caption:'))).toEqual([]);
    // The pinned positive — a deck with no stops at all would satisfy the filter trivially.
    expect(reached.size).toBeGreaterThanOrEqual(6);
  });
});

/**
 * **The Panels group and the trailing edge** (toolbar-redesign M2-T2, R4).
 *
 * ADR-0031 group 7 (`help`) is rendered as its own deck group, named "Panels", on the LOOK line;
 * "Plan" no longer holds it. And each line has exactly one trailing group, pushed to the line's end
 * by one `ml-auto` — free space on a flex line is shared among every auto margin on it, so a second
 * would strand a group mid-line (ADR-0091 M7 S10).
 *
 * **Its blind spot, stated**: jsdom does no layout, so that the margin really pushes the group right
 * is `command-surface.spec.ts`'s ("trailing edges at ≥ 1280"). What this pins is the markup that
 * layout consumes, and the order a Tab/arrow walk meets it in.
 */
describe('Deck — the Panels group and one trailing group per row', () => {
  const panelItems: ToolbarItem<Ctx>[] = defineToolbar<Ctx>([
    { id: 'today', group: 'frame', order: 1, tier: 1, label: 'Today', onActivate: () => {} },
    { id: 'filter', group: 'find', order: 1, tier: 1, label: 'Filter', onActivate: () => {} },
    { id: 'legend', group: 'help', order: 0, tier: 1, label: 'Legend', onActivate: () => {} },
    { id: 'comments', group: 'help', order: 2, tier: 1, label: 'Comments', onActivate: () => {} },
    { id: 'add', group: 'tools', order: 1, tier: 1, label: 'Add activity', onActivate: () => {} },
    { id: 'analysis', group: 'object', order: 1, tier: 1, label: 'Analysis', onActivate: () => {} },
    { id: 'export', group: 'output', order: 1, tier: 1, label: 'Export', onActivate: () => {} },
  ]);

  it('names the `help` registry group "Panels", on the LOOK line, after Find', () => {
    render(<Deck items={panelItems} context={{}} label="Plan commands" />);
    const look = document.querySelector('[data-deck-row="look"]')!;
    const names = [...look.querySelectorAll(':scope > [role="group"]')].map((g) =>
      g.getAttribute('aria-label'),
    );
    expect(names).toEqual(['View', 'Find', 'Panels']);
    const panels = within(look as HTMLElement).getByRole('group', { name: 'Panels' });
    expect(
      within(panels)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Legend', 'Comments']);
    // And Plan no longer holds it: Analysis and Export are the Plan group.
    const plan = screen.getByRole('group', { name: 'Plan' });
    expect(within(plan).queryByRole('button', { name: 'Legend' })).toBeNull();
  });

  it('pushes exactly one group per line to the trailing edge: Panels on LOOK, Plan on DO', () => {
    render(<Deck items={panelItems} context={{}} label="Plan commands" />);
    for (const [row, trailing] of [
      ['look', 'Panels'],
      ['do', 'Plan'],
    ] as const) {
      const groups = [
        ...document.querySelectorAll(`[data-deck-row="${row}"] > [role="group"]`),
      ] as HTMLElement[];
      const pushed = groups.filter((g) => /(^|\s)ml-auto(\s|$)/.test(g.className));
      expect(
        pushed.map((g) => g.getAttribute('aria-label')),
        `${row} must have exactly one auto margin`,
      ).toEqual([trailing]);
    }
  });

  it('keeps DOM order equal to reading order, so the arrow walk meets Panels after Find', () => {
    render(<Deck items={panelItems} context={{}} label="Plan commands" />);
    const order = [...document.querySelectorAll('[data-toolbar-item]')].map((el) =>
      el.getAttribute('data-toolbar-item'),
    );
    expect(order).toEqual(['today', 'filter', 'legend', 'comments', 'add', 'analysis', 'export']);
  });
});

describe('arrows from the container itself', () => {
  /**
   * **The deck's half of the container-focus case.** `Toolbar.test.tsx` got these two and `Deck`
   * got none — the component gate's finding, and it is this repository's most-recorded defect shape
   * applied to test coverage rather than to behaviour: the wiring is textually identical, which is
   * exactly the state in which a later edit to one and not the other goes unnoticed.
   *
   * The state is the one the focus handoff creates: a peer's write removed the control a reader was
   * standing on, so focus is on the `role="toolbar"` container. Verified red against the old
   * clamp-then-step arithmetic, which landed on the second stop.
   */
  it('lands on the first stop, not the second', () => {
    render(<Deck items={items} context={{}} label="Plan commands" />);
    const bar = screen.getByRole('toolbar', { name: 'Plan commands' });
    const first = bar.querySelector<HTMLElement>('[data-toolbar-focusable]')!;
    bar.focus();

    fireEvent.keyDown(bar, { key: 'ArrowRight' });

    expect(document.activeElement).toBe(first);
  });

  it('lands on the last stop going backwards', () => {
    render(<Deck items={items} context={{}} label="Plan commands" />);
    const bar = screen.getByRole('toolbar', { name: 'Plan commands' });
    const stops = [...bar.querySelectorAll<HTMLElement>('[data-toolbar-focusable]')];
    bar.focus();

    fireEvent.keyDown(bar, { key: 'ArrowLeft' });

    expect(document.activeElement).toBe(stops.at(-1));
  });
});

/**
 * **The label rule on the deck** (toolbar-redesign M1). jsdom has no layout and no container
 * queries, so these cases assert what the *markup* promises — which class the label carries, which
 * name the control keeps, which tooltip is mounted — and the journey (`command-surface.spec.ts`)
 * asserts that Chromium honours it at 79 rem. Verified red by making `Deck` resolve against the
 * `'toolbar'` surface: the `roomy` cases lose their `sr-only` class and their tooltip.
 */
describe('Deck — the label rule', () => {
  const labelItems: ToolbarItem<Ctx>[] = defineToolbar<Ctx>([
    { id: 'plain', group: 'frame', order: 1, tier: 1, label: 'Plain', onActivate: () => {} },
    {
      id: 'quiet',
      group: 'frame',
      order: 2,
      tier: 1,
      label: 'Quiet',
      labelVisibility: 'never',
      onActivate: () => {},
    },
    {
      id: 'roomy',
      group: 'frame',
      order: 3,
      tier: 1,
      label: 'Roomy',
      description: 'Says what it does',
      labelVisibility: 'roomy',
      onActivate: () => {},
    },
  ]);

  const mount = (): void => {
    render(<Deck items={labelItems} context={{}} label="Plan commands" />);
  };

  it('is the container the roomy variant asks, and nothing else is', () => {
    mount();
    const toolbar = screen.getByRole('toolbar', { name: 'Plan commands' });
    expect(toolbar.className).toContain('@container/deck');
    expect(toolbar.querySelectorAll('[class*="@container"]')).toHaveLength(0);
  });

  it('paints an always label plainly and withholds a never label, keeping its name', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Plain' })).toHaveTextContent('Plain');
    const quiet = screen.getByRole('button', { name: 'Quiet' });
    expect(quiet).toHaveTextContent('');
    expect(quiet).toHaveAttribute('aria-label', 'Quiet');
    expect(quiet.className).toContain('min-w-9');
  });

  it('keeps a roomy label in the tree, sr-only below the roomy width, with both widths', () => {
    mount();
    const roomy = screen.getByRole('button', { name: 'Roomy' });
    const label = within(roomy).getByText('Roomy');
    expect(label.className).toContain('@max-roomy/deck:sr-only');
    expect(roomy.className).toContain('@max-roomy/deck:min-w-9');
    expect(roomy.className).toContain('min-w-12');
  });

  it('always mounts a description tooltip for a roomy control, label showing or not', () => {
    mount();
    const roomy = screen.getByRole('button', { name: 'Roomy' });
    // No native title beside the tooltip: two tips on one hover.
    expect(roomy).not.toHaveAttribute('title');
    fireEvent.focus(roomy);
    const tip = document.querySelector('[data-tooltip]');
    expect(tip).toHaveAttribute('role', 'tooltip');
    expect(tip).toHaveTextContent('Roomy — Says what it does');
    expect(roomy).toHaveAccessibleDescription(/Says what it does/);
    expect(roomy).toHaveAccessibleName('Roomy');
  });

  it('dismisses the roomy tooltip with Escape and leaves focus where it was', () => {
    mount();
    const roomy = screen.getByRole('button', { name: 'Roomy' });
    roomy.focus();
    fireEvent.focus(roomy);
    expect(document.querySelector('[data-tooltip]')).not.toBeNull();
    fireEvent.keyDown(roomy, { key: 'Escape' });
    expect(document.querySelector('[data-tooltip]')).toBeNull();
    expect(document.activeElement).toBe(roomy);
  });
});

/**
 * **The scrolling line's keyboard contract** (toolbar-redesign M3, US-6, ADR-0111).
 *
 * jsdom has no layout, so `scrollWidth` and `clientWidth` are stubbed to say the deck overflows —
 * the property under test is what the deck DOES about a focused control when it does, not what a
 * browser lays out (`narrow-shell.spec.ts` asserts the rects). `scrollIntoView` is absent from
 * jsdom, so a spy stands in for it.
 */
describe('Deck — a focused control is scrolled into the line below lg', () => {
  const scrollIntoView = vi.fn();

  afterEach(() => {
    scrollIntoView.mockReset();
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  });

  function renderOverflowing(overflows: boolean): HTMLElement {
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    render(<Deck items={items} context={{}} label="Plan commands" />);
    const deck = screen.getByRole('toolbar', { name: 'Plan commands' });
    Object.defineProperty(deck, 'scrollWidth', {
      configurable: true,
      value: overflows ? 900 : 300,
    });
    Object.defineProperty(deck, 'clientWidth', { configurable: true, value: 300 });
    return deck;
  }

  it('asks for the nearest edge on both axes when the keyboard moves focus, and not before', () => {
    renderOverflowing(true);
    const today = screen.getByRole('button', { name: 'Today' });
    today.focus();
    scrollIntoView.mockClear();
    fireEvent.keyDown(today, { key: 'ArrowRight' });
    expect(focusedItemId()).toBe('fit');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });

  it('does it for Home and End too, so a lap to either end is brought into view', () => {
    renderOverflowing(true);
    const today = screen.getByRole('button', { name: 'Today' });
    today.focus();
    scrollIntoView.mockClear();
    fireEvent.keyDown(today, { key: 'End' });
    expect(focusedItemId()).toBe('export');
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(focusedItemId()).toBe('today');
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('leaves the browser’s own focus-scroll alone when the deck does not overflow', () => {
    renderOverflowing(false);
    const today = screen.getByRole('button', { name: 'Today' });
    today.focus();
    fireEvent.keyDown(today, { key: 'ArrowRight' });
    expect(focusedItemId()).toBe('fit');
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('keeps the browser’s focus-scroll off the roving move so there is exactly one scroll', () => {
    renderOverflowing(true);
    const today = screen.getByRole('button', { name: 'Today' });
    const fit = screen.getByRole('button', { name: 'Fit' });
    const focus = vi.spyOn(fit, 'focus');
    today.focus();
    fireEvent.keyDown(today, { key: 'ArrowRight' });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('does not move a control a pointer press focused', () => {
    renderOverflowing(true);
    const fit = screen.getByRole('button', { name: 'Fit' });
    // A press focuses the button without :focus-visible; scrolling it from under the pointer
    // between pointerdown and click is how a tap lands on a neighbour.
    // **A unit-level approximation:** jsdom has no `:focus-visible`, so this mocks `matches` to
    // say the press was not keyboard focus. The real browser behaviour (a press does not match
    // `:focus-visible`, a Tab does) is what the narrow-shell journey drives.
    fireEvent.mouseDown(fit);
    fit.focus();
    scrollIntoView.mockClear();
    vi.spyOn(fit, 'matches').mockImplementation(
      (selector: string) => selector !== ':focus-visible',
    );
    fit.blur();
    fit.focus();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe('Deck — which row leads (owner decision, 2026-10-10)', () => {
  /** Stub `matchMedia` so the one query the deck reads answers `wide`. */
  function viewport(wide: boolean): void {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('min-width') ? wide : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  }
  afterEach(() => vi.unstubAllGlobals());

  const rowsInDocumentOrder = (): string[] =>
    [...document.querySelectorAll('[data-deck-row]')].map(
      (row) => row.getAttribute('data-deck-row') ?? '',
    );
  const stopsInDocumentOrder = (): string[] =>
    [...document.querySelectorAll('[data-toolbar-focusable]')].map(
      (el) => el.getAttribute('data-toolbar-item') ?? '',
    );

  it('stacks LOOK above DO at the floor and wider, as it always did', () => {
    viewport(true);
    renderDeck();
    expect(rowsInDocumentOrder()).toEqual(['look', 'do']);
    expect(stopsInDocumentOrder()).toEqual([
      'today',
      'fit',
      'search',
      'filter',
      'add-activity',
      'export',
    ]);
  });

  it('leads with DO below the floor, and the DOM order IS the new reading order (red: rows not reordered)', () => {
    viewport(false);
    renderDeck();
    expect(rowsInDocumentOrder()).toEqual(['do', 'look']);
    // The roving walk reads the document, so the Tab and arrow sequence is DO's then LOOK's.
    expect(stopsInDocumentOrder()).toEqual([
      'add-activity',
      'export',
      'today',
      'fit',
      'search',
      'filter',
    ]);
  });

  it('makes the first Tab stop the first control on screen, and the arrows walk the same order', () => {
    viewport(false);
    renderDeck();
    const first = screen.getByRole('button', { name: 'Add activity' });
    expect(first).toHaveAttribute('tabindex', '0');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(focusedItemId()).toBe('export');
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' });
    expect(focusedItemId()).toBe('today');
  });

  it('keeps focus on the same item when the window crosses the floor and the rows trade places', () => {
    let wide = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() {
        return query.includes('min-width') ? wide : false;
      },
      media: query,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    }));
    renderDeck();
    // The LOOK row is the one React moves when the rows swap (the DO row keeps its place).
    const today = screen.getByRole('button', { name: 'Today' });
    today.focus();
    const refocus = vi.spyOn(HTMLElement.prototype, 'focus');
    act(() => {
      wide = false;
      for (const listener of listeners) listener();
    });
    expect(rowsInDocumentOrder()).toEqual(['do', 'look']);
    // React restores the focused element after moving its row; a browser would otherwise have
    // dropped it. The spy shows the restore happened, which jsdom alone would not (it keeps focus).
    expect(refocus).toHaveBeenCalled();
    expect(today).toHaveFocus();
    refocus.mockRestore();
  });

  it('puts the row seam before the second row on the scrolling line, whichever row that is', () => {
    viewport(false);
    renderDeck();
    const seamed = [...document.querySelectorAll('[data-deck-row] > [role="group"]')].filter((g) =>
      g.className.includes('max-lg:after:absolute'),
    );
    expect(seamed).toHaveLength(1);
    expect(seamed[0]?.closest('[data-deck-row]')?.getAttribute('data-deck-row')).toBe('look');
  });
});
