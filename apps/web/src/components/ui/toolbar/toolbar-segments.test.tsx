import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { partitionBySegment, Toolbar } from './Toolbar';
import { defineToolbar, type ToolbarItem } from './toolbar-registry';

/**
 * **`Toolbar.segmentLabels` — a taxonomy group rendered as N named sub-groups**
 * (`docs/TECH_DEBT.md` #201, `docs/specs/mode-toggles/`).
 *
 * The defect: the plan's mode row holds `Early mode | Visual mode | Diagram | Gantt`, which are two
 * independent two-way switches, and the seven-group taxonomy puts all four in `lens`. That is one
 * `role="group"`, one accessible name and four identical gaps — so nothing in the markup or on the
 * screen says where one switch ends and the next begins.
 *
 * **Every case here was verified red before it was made green**, and against the specific defect it
 * names rather than against "some earlier version" (ADR-0110 D5: a gate is finished when it has been
 * made to fail by the thing it was written for, not when it passes). What each was run against is
 * recorded on the case.
 */

interface Ctx {
  active: string;
}

/** Two two-state switches in ONE taxonomy group — the exact shape the mode row has. */
function twoSwitches(): ToolbarItem<Ctx>[] {
  return defineToolbar<Ctx>(
    (
      [
        { id: 'early', segment: 'scheduling-mode', label: 'Early mode' },
        { id: 'visual', segment: 'scheduling-mode', label: 'Visual mode' },
        { id: 'tsld', segment: 'view-mode', label: 'Diagram' },
        { id: 'gantt', segment: 'view-mode', label: 'Gantt' },
      ] as const
    ).map((d, i): ToolbarItem<Ctx> => ({
      id: d.id,
      segment: d.segment,
      label: d.label,
      group: 'lens',
      tier: 1,
      // `'always'` so these cases exercise the labelled chrome whatever width jsdom reports (0) —
      // the same reason `Toolbar.test.tsx`'s own registry pins it.
      showLabel: 'always',
      order: i,
      isActive: (c: Ctx) => c.active === d.id,
      onActivate: () => {},
    })),
  );
}

const LABELS = { 'scheduling-mode': 'Scheduling mode', 'view-mode': 'Plan view' };

function renderToolbar(props: Partial<React.ComponentProps<typeof Toolbar<Ctx>>> = {}) {
  return render(
    <Toolbar<Ctx>
      items={twoSwitches()}
      context={{ active: 'early' }}
      label="Plan mode"
      {...props}
    />,
  );
}

describe('partitionBySegment', () => {
  /**
   * The rule in its pure form. It is exported and tested separately because the render branch is
   * one `if` over this function: the interesting decision is "may this group be split at all", and
   * asking that of the DOM makes a rule about data into a rule about markup.
   */
  it('splits in first-appearance order and never re-sorts', () => {
    const items = twoSwitches().map((item) => ({ item }));
    const out = partitionBySegment(items, LABELS);
    expect(out?.map((s) => [s.segment, s.label, s.items.length])).toEqual([
      ['scheduling-mode', 'Scheduling mode', 2],
      ['view-mode', 'Plan view', 2],
    ]);
  });

  /**
   * **The refusal, which is the load-bearing half.** A partial partition would put some items in a
   * named region and leave the rest in an unnamed one — a container a screen-reader user must enter
   * to discover holds nothing they were told about, which is worse than the undifferentiated group
   * this feature exists to fix.
   *
   * Both ways of failing the precondition are covered, because they are different mistakes: an item
   * with no `segment` at all, and an item whose `segment` the caller forgot to name.
   */
  it('refuses a partial partition — an item with no segment', () => {
    const items = twoSwitches().map((item) => ({ item }));
    // The key is OMITTED, not set to `undefined`: `exactOptionalPropertyTypes` makes those two
    // different types, and an item that never declared a segment is the fixture the defect has.
    const { segment: _omitted, ...withoutSegment } = items[2]!.item;
    items[2] = { item: withoutSegment };
    expect(partitionBySegment(items, LABELS)).toBeNull();
  });

  it('refuses a partition whose segment the caller did not name', () => {
    const items = twoSwitches().map((item) => ({ item }));
    expect(partitionBySegment(items, { 'scheduling-mode': 'Scheduling mode' })).toBeNull();
  });

  it('refuses when there is nothing to partition, rather than returning an empty split', () => {
    // A pinned positive is not enough on its own: a helper that returned `[]` for every input would
    // satisfy "does not crash" and produce a group containing no sub-groups at all.
    expect(partitionBySegment([], LABELS)).toBeNull();
    expect(
      partitionBySegment(
        twoSwitches().map((item) => ({ item })),
        undefined,
      ),
    ).toBeNull();
  });
});

describe('Toolbar — segmentLabels', () => {
  /**
   * **The partition case.** Verified red against the pre-M2 code, which rendered one `role="group"`
   * named "Display" holding all four.
   */
  it('renders one named group per segment, each holding only its own items', () => {
    renderToolbar({ segmentLabels: LABELS });

    const scheduling = screen.getByRole('group', { name: 'Scheduling mode' });
    const view = screen.getByRole('group', { name: 'Plan view' });

    expect(
      within(scheduling)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Early mode', 'Visual mode']);
    expect(
      within(view)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Diagram', 'Gantt']);

    // And exactly two — the outer wrapper gives up its role rather than nesting one group inside
    // another. Nested `role="group"` is avoided rather than reasoned about: no screen reader runs
    // in this repository's build container (`docs/TECH_DEBT.md` #154), so its real behaviour is not
    // observable here and the design does not rest on a guess.
    expect(screen.getAllByRole('group')).toHaveLength(2);
    expect(screen.queryByRole('group', { name: 'Display' })).toBeNull();
  });

  /**
   * **The fallback case**, and its red run is the part worth reading. "Verified red" for a negative
   * assertion cannot mean "red against today's code" — today's code passes it trivially. It was run
   * against a deliberately naive `partitionBySegment` that skipped the precondition and grouped
   * whatever it found, which emitted a `role="group"` named "Scheduling mode" plus an unnamed
   * region holding the rest. That is the implementation a later reader would plausibly write.
   */
  it('falls back to ONE group named from groupLabels when any item lacks a segment', () => {
    const items = twoSwitches();
    const { segment: _omitted, ...withoutSegment } = items[2]!;
    items[2] = withoutSegment;
    render(
      <Toolbar<Ctx>
        items={items}
        context={{ active: 'early' }}
        label="Plan mode"
        groupLabels={{ lens: 'Scheduling and view' }}
        segmentLabels={LABELS}
      />,
    );

    const groups = screen.getAllByRole('group');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveAttribute('aria-label', 'Scheduling and view');
    expect(within(groups[0]!).getAllByRole('button')).toHaveLength(4);
  });

  /**
   * **The dark-ship claim, asserted rather than asserted about.** M2 adds a prop with no caller, so
   * every toolbar in the product must render byte-identically. The 93 pre-existing toolbar cases
   * passing unchanged is the broad form of this; this is the narrow one, on the exact registry the
   * partition would otherwise split.
   */
  it('renders exactly as before when no segmentLabels are passed', () => {
    const { container: first } = renderToolbar();
    const before = first.innerHTML;
    const { container: second } = renderToolbar();
    expect(second.innerHTML).toBe(before);
    expect(screen.getAllByRole('group')).toHaveLength(2); // one per render, both named "Display"
  });
});

describe('Toolbar — the keyboard model across a partition (M2-T3)', () => {
  /**
   * **jsdom pins the MODEL, not the experience** — it has no layout, no focus ring and no top
   * layer, so what these cases can say is "one tab stop, and the arrows traverse every item". The
   * browser half is M3's journey. ADR-0111 is explicit that this tier structurally cannot ask what
   * a real focus ring does, and states that as the weak instrument it is rather than implying
   * otherwise.
   *
   * Verified red by wrapping each sub-group in its own `onKeyDown` — the mistake a later reader
   * would plausibly make, since a sub-group looks like a thing that should own its own keys. It
   * splits the roving sequence in two: ArrowRight from `Visual mode` then stops rather than
   * crossing into `Diagram`.
   */
  it('exposes exactly one tab stop across both sub-groups', () => {
    renderToolbar({ segmentLabels: LABELS });
    const stops = screen.getAllByRole('button').filter((b) => b.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveTextContent('Early mode');
  });

  it('ArrowRight crosses the sub-group boundary and wraps at the end', () => {
    renderToolbar({ segmentLabels: LABELS });
    const button = (name: string): HTMLElement => screen.getByRole('button', { name });

    /**
     * `.focus()` **and** an explicit `fireEvent.focus`, which is the pattern the pre-existing suite
     * uses (`Toolbar.test.tsx:144`, `:152`, `:176`) and not a workaround invented here. The roving
     * index is state set by each control's `onFocus`; jsdom's `.focus()` does not reliably reach
     * React's delegated focus handler, so without the second call `activeId` stays null, the
     * container falls back to the FIRST focusable, and ArrowRight "moves" to the item already
     * focused. The first draft of this case did exactly that and reported the boundary as broken —
     * a red run whose cause was the harness, not the product. The browser half is M3's journey.
     */
    const focusButton = (name: string): HTMLElement => {
      const el = button(name);
      el.focus();
      fireEvent.focus(el);
      return el;
    };

    // The boundary itself: last of segment A → first of segment B.
    fireEvent.keyDown(focusButton('Visual mode'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(button('Diagram'));

    fireEvent.keyDown(focusButton('Gantt'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(button('Early mode'));
  });

  it('Home and End reach the first and last item across the boundary', () => {
    renderToolbar({ segmentLabels: LABELS });
    const diagram = screen.getByRole('button', { name: 'Diagram' });
    diagram.focus();
    fireEvent.focus(diagram);

    fireEvent.keyDown(diagram, { key: 'Home' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Early mode' }));

    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Gantt' }));
  });
});
