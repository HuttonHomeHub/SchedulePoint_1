import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Deck } from './Deck';
import { Toolbar } from './Toolbar';
import { ToolbarButton } from './ToolbarButton';
import { ToolbarPopover } from './ToolbarPopover';
import { ToolbarSplitButton } from './ToolbarSplitButton';

/**
 * **Every state paints a different class, on every primitive that can take it** (console epic M3,
 * folding the component review's coverage findings).
 *
 * The review found the ladder asserted nowhere at the unit tier: no `ToolbarButton.test.tsx`
 * existed at all, and neither popover nor split-button suite read a class, so **swapping the
 * `armed` and `selected` values in the CVA would have gone unnoticed** by everything except one
 * browser case that happens to exercise two primitives — neither of which is the one that threads
 * the resolved `activeKind`.
 *
 * **What this asserts is the DISTINCTION, not the literal class strings.** A test pinned to
 * `bg-secondary` goes red on a deliberate re-value and says nothing about the defect; what has to
 * hold is that four states do not collapse into one, which is precisely what the boolean this
 * replaced did (one `bg-accent` wash, 1.34:1, for hover, open and armed alike).
 *
 * **The overlapping cases are here because the review found them untested anywhere** — and the rule
 * they pin was *corrected* by that review: a control's own state outranks the transient fact that
 * its panel is open, in both primitives. The first version made `open` win, justified by a caret
 * that rotates; no caret in this product rotates.
 */
const itemProps = { tabIndex: 0, 'data-toolbar-item': 'probe' } as const;
const classOf = (name: string | RegExp) => screen.getByRole('button', { name }).className;

describe('both renderers hand a plain command its resolved kind', () => {
  /**
   * **The component review found `Toolbar` not forwarding `activeKind` while `Deck`, its sibling,
   * did** — the "one correct pattern applied to a control and not its neighbour" shape this diff's
   * own comments name as the repository's most-recorded defect, occurring inside the diff that
   * names it. It was latent (the one active item reaching `Toolbar` is a `render` item), and the
   * review's sharpest point was that **nothing could have caught it**: the existing suite asserts
   * `aria-pressed` and never a resolved class, and the structural test reads registry data without
   * knowing which renderer an item goes through.
   *
   * So this asserts the pipeline end to end — registry declaration → `resolveItems` → the prop →
   * the paint — through **both** renderers, with the same item.
   */
  const armedItem = {
    id: 'probe',
    group: 'tools' as const,
    order: 1,
    tier: 1 as const,
    label: 'Probe',
    icon: null,
    isActive: () => true,
    activeKind: 'armed' as const,
    onActivate: () => {},
  };

  it.each([
    ['Toolbar', (n: React.ReactNode) => n],
    ['Deck', (n: React.ReactNode) => n],
  ])('%s paints an item declared armed as armed, not as selected', (which) => {
    const { unmount } =
      which === 'Toolbar'
        ? render(<Toolbar items={[armedItem]} context={{}} label="T" />)
        : render(<Deck items={[armedItem]} context={{}} label="T" />);

    const cls = screen.getByRole('button', { name: 'Probe' }).className;
    unmount();

    // The property, not the literal: armed keeps the band's fill and carries amber ink, where
    // `selected` — the value a missing forward silently falls back to — takes a fill.
    expect(cls, `${which} painted ${cls}`).toContain('text-primary');
    expect(cls, `${which} fell back to the selected fill`).not.toContain('bg-secondary');
  });
});

describe('the state ladder paints five distinct states', () => {
  describe('ToolbarButton', () => {
    const renderAt = (props: {
      pressed?: boolean;
      activeKind?: 'armed' | 'selected' | 'primary';
    }) => {
      const { unmount } = render(
        <ToolbarButton
          itemId="probe"
          label="Probe"
          icon={null}
          showLabel
          disabled={false}
          disabledReason={undefined}
          srDescription={undefined}
          tabIndex={0}
          onActivate={() => {}}
          {...props}
        />,
      );
      const cls = classOf('Probe');
      unmount();
      return cls;
    };

    it('rest, selected, armed and primary are four different treatments', () => {
      const rest = renderAt({});
      const selected = renderAt({ pressed: true, activeKind: 'selected' });
      const armed = renderAt({ pressed: true, activeKind: 'armed' });
      const primary = renderAt({ pressed: true, activeKind: 'primary' });

      expect(
        new Set([rest, selected, armed, primary]).size,
        `rest=${rest} selected=${selected} armed=${armed} primary=${primary}`,
      ).toBe(4);
    });

    it('PRIMARY takes the amber fill and ARMED takes amber ink on the band', () => {
      // **The pair that shipped collapsed**, which is why this is a case of its own and not a fourth
      // clause above. `primary` is reserved to the pen and `armed` to the four modal tools, and the
      // console epic's M5 wired the pen to `armed` — so the row's loudest control and the tool
      // beside it painted the same picture, in the one group where they sit next to each other.
      // Distinctness (the case above) would not have caught it: with `primary` unused, there were
      // only ever three treatments to be distinct.
      //
      // Asserted as PROPERTIES so a re-value stays free: the pen is the row's one amber slab, an
      // armed tool keeps the band's own fill and carries amber ink. The negative on `text-primary`
      // is the half that discriminates — both class strings contain the word.
      const primary = renderAt({ pressed: true, activeKind: 'primary' });
      const armed = renderAt({ pressed: true, activeKind: 'armed' });

      expect(primary).toContain('bg-primary');
      expect(primary).toContain('text-primary-foreground');
      expect(primary.split(/\s+/)).not.toContain('text-primary');

      expect(armed).not.toContain('bg-primary');
      expect(armed.split(/\s+/)).toContain('text-primary');
    });

    it('SELECTED takes a fill and ARMED takes ink — they are not interchangeable', () => {
      // **This exists because the case above is not enough, and that was proved rather than
      // reasoned**: swapping the two values in the CVA left "three distinct treatments" true and
      // every case green. Distinctness says the states do not collapse; it says nothing about which
      // is which, and a swap is exactly the edit a later reader might make while tidying.
      //
      // Asserted as a PROPERTY rather than a literal class, so a re-value stays free: selected is
      // the chosen one of alternatives and reads as a filled chip; armed keeps the band's own fill
      // and carries amber ink instead — which is what puts both of its channels at 7.91:1 on the
      // band rather than 2.51:1 on a fill.
      expect(renderAt({ pressed: true, activeKind: 'selected' })).toContain('bg-secondary');
      expect(renderAt({ pressed: true, activeKind: 'armed' })).not.toContain('bg-secondary');
      expect(renderAt({ pressed: true, activeKind: 'armed' })).toContain('text-primary');
    });

    it('a pressed control with no declared kind is SELECTED, never armed', () => {
      // The default matters: `activeKind` is absent on every toggle in the product, and a default
      // of `armed` would paint every lens toggle as though it held the next canvas gesture.
      expect(renderAt({ pressed: true })).toBe(renderAt({ pressed: true, activeKind: 'selected' }));
    });

    it('an unpressed control is at rest whatever kind it would be', () => {
      expect(renderAt({ activeKind: 'armed' })).toBe(renderAt({}));
    });
  });

  describe('ToolbarPopover — the engaged state outranks the panel being open', () => {
    /**
     * `open` is the popover's OWN state and not a prop, so the overlap this block exists to pin is
     * reachable only by opening the panel. The first version of these cases set `active` from props
     * and never opened anything — and reverting the precedence to `open ? 'open' : …` left them all
     * green, which is the shape the component review found elsewhere in this diff and which this
     * suite then reproduced. Established by running that revert against them, not by reading.
     */
    const renderAt = (props: { active?: boolean }, opened: boolean) => {
      const { unmount } = render(
        <ToolbarPopover itemProps={itemProps} label="Filter" {...props}>
          <div>panel</div>
        </ToolbarPopover>,
      );
      if (opened) fireEvent.click(screen.getByRole('button', { name: /Filter/ }));
      const cls = classOf(/Filter/);
      unmount();
      return cls;
    };

    it('engaged and idle are different treatments while closed', () => {
      expect(renderAt({ active: true }, false)).not.toBe(renderAt({ active: false }, false));
    });

    it('an engaged trigger KEEPS its own treatment when the panel opens', () => {
      // The failure this pins: a filtered `Filter ▾` losing the one mark saying a filter is applied
      // at exactly the moment a planner opens the menu to check. The withdrawn rule did that.
      expect(renderAt({ active: true }, true)).toBe(renderAt({ active: true }, false));
    });

    it('opening reports aria-expanded and NOT aria-pressed when nothing is engaged', () => {
      // **The ARIA half of the change, and jsdom can see it** — unlike paint. It read
      // `aria-pressed={open || active}`, so opening `Filter ▾` with no attribute engaged flipped
      // the attribute false→true and a screen-reader user heard "pressed" for a click that engaged
      // nothing. The accessibility review found this untested: `ToolbarPopover.test.tsx` has no
      // `aria-pressed` assertion at all, and Filter's own lens suite only reads it while closed.
      render(
        <ToolbarPopover itemProps={itemProps} label="Filter" active={false}>
          <div>panel</div>
        </ToolbarPopover>,
      );
      const trigger = screen.getByRole('button', { name: /Filter/ });
      fireEvent.click(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(trigger).toHaveAttribute('aria-pressed', 'false');
    });

    it('an idle trigger DOES take the open treatment, so opening stays visible', () => {
      // The other half, and what stops the case above being satisfiable by a popover that paints
      // nothing on open at all.
      expect(renderAt({}, true)).not.toBe(renderAt({}, false));
    });
  });

  describe('ToolbarSplitButton — armed outranks its type menu being open', () => {
    const renderAt = (props: {
      pressed: boolean;
      open: boolean;
      activeKind?: 'armed' | 'selected' | 'primary';
    }) => {
      const { unmount } = render(
        <ToolbarSplitButton
          itemProps={itemProps}
          primaryRef={{ current: null }}
          caretRef={{ current: null }}
          title="Add activity"
          icon={null}
          label="Add activity"
          caretLabel="Activity type"
          onPrimary={() => {}}
          onOpenMenu={() => {}}
          {...props}
        />,
      );
      const cls =
        screen.getByRole('button', { name: 'Add activity' }).parentElement?.className ?? '';
      unmount();
      return cls;
    };

    it('armed, open and rest are three different treatments', () => {
      const rest = renderAt({ pressed: false, open: false });
      const open = renderAt({ pressed: false, open: true });
      const armed = renderAt({ pressed: true, open: false });

      expect(new Set([rest, open, armed]).size, `rest=${rest} open=${open} armed=${armed}`).toBe(3);
    });

    it('armed AND open reads as armed — the overlap the review found untested', () => {
      expect(renderAt({ pressed: true, open: true })).toBe(
        renderAt({ pressed: true, open: false }),
      );
    });
  });
});
