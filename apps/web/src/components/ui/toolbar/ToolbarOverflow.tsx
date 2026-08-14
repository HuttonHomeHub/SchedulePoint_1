import { MoreHorizontal } from 'lucide-react';
import { Fragment, forwardRef, useEffect, useRef, useState, type Ref } from 'react';

import type { ResolvedToolbarItem, ToolbarGroupId } from './toolbar-registry';
import { toolbarControlVariants } from './toolbar-styles';

import { Menu, MenuItem, MenuSection } from '@/components/ui/menu';

/**
 * The toolbar's **overflow** — a `⋯` trigger (a roving-tabindex member of the {@link Toolbar}) that
 * opens the shared APG {@link Menu} holding the Tier-3 and demoted commands. Each overflow command is
 * a `MenuItem`; a disabled one is shown inert with its reason. `render` items aren't demoted (the
 * `Toolbar` keeps popovers/segmented controls on the bar), so the overflow is an action list.
 *
 * **Sectioned by the same 7-group taxonomy the bar uses** (ADR-0031), under the same names the
 * inline `role="group"` wrappers carry — the menu's own `groupLabels` are threaded through rather
 * than re-derived, so the two can't drift about what a group is called. It was a single
 * undifferentiated run until then, which is defensible for the three or four Tier-3 commands the
 * `⋯` was designed to hold and stops being defensible at the width where it holds fifteen: at 1440
 * a planner opened it to a wall of unrelated verbs in registry order. `overflowItems` already
 * arrives sorted by `groupRank` then `order` (`Toolbar.tsx:335-341`), so a section break is just a
 * change of group between neighbours — no second sort, and no way for the sections to disagree with
 * the bar about ordering.
 *
 * The `⋯` is always reachable, so no command is ever lost off the edge.
 */
export interface ToolbarOverflowProps<Ctx> {
  items: ResolvedToolbarItem<Ctx>[];
  context: Ctx;
  /** Group names, resolved by {@link Toolbar} — the same strings its `role="group"` wrappers use. */
  groupLabels: Record<ToolbarGroupId, string>;
  tabIndex: number;
  onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onFocus?: (event: React.FocusEvent<HTMLButtonElement>) => void;
  /**
   * Called when the menu opens or closes, so the row can hold its layout still for the duration.
   *
   * Without it, a `ResizeObserver` pass that admits a Tier-3 item while this menu is open removes
   * that item's `MenuItem` from under the reader's focus — and a `Menu` has no effect watching its
   * own item set shrink, so focus lands on `<body>` (WCAG 2.4.3). Before tier-3 admission an item
   * could only ever move INTO this menu, never out of it, so the shape was unreachable here.
   */
  onOpenChange?: (open: boolean) => void;
}

/** A disabled item never activates; `MenuItem` requires the prop regardless. */
const NOOP = (): void => undefined;

/** One overflow row. Extracted only so the section-break map above stays readable. */
function renderItem<Ctx>(r: ResolvedToolbarItem<Ctx>, context: Ctx): React.ReactElement {
  const icon = r.icon ? (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center">
      {r.icon}
    </span>
  ) : null;

  // The RESOLVED icon — `item.icon` may be a ctx function (see `resolveItems`).
  if (r.item.onActivate && r.enabled) {
    return (
      <MenuItem
        // A toggle keeps its state in the menu (ADR-0090 M2). An item that declares `isActive` is a
        // toggle, and on the bar its `ToolbarButton` carries `aria-pressed`; without this it became a
        // plain `menuitem` here and announced nothing, so a screen-reader user could not tell whether
        // Float paths was open. Items with no `isActive` stay plain `menuitem`s.
        //
        // **`checked` or `selected`, discriminated by `demotionGroup`** (ADR-0090 M5, component
        // gate). `checked` was applied uniformly, which is right for an independent toggle and wrong
        // for a **segment**: `mode-early`/`mode-visual` and `view-tsld`/`view-gantt` are
        // mutually-exclusive pairs, guaranteed by D3 to demote together, and two independent
        // `menuitemcheckbox`es say a planner can have both Early and Visual at once. `demotionGroup`
        // is exactly the marker for "these are one choice" — it is what makes them demote as a unit
        // — so it is the honest discriminator rather than a second field meaning the same thing.
        //
        // Latent rather than observed: no segment has been seen in the `⋯` (they are tier 1 and
        // pinned-adjacent), which is also why nothing caught it. `MenuItem` already knows how to say
        // this correctly — `selected` → `menuitemradio` — and `IsolateControl`'s own Full/Driving
        // picker uses it. One correct pattern applied to a control and not its neighbour, again.
        {...(r.item.isActive
          ? r.item.demotionGroup
            ? { selected: r.active }
            : { checked: r.active }
          : {})}
        // The item's standing description follows it into the menu (ADR-0094 M5). It did not: this
        // surface forwarded `disabledReason` and stopped, so a demoted `next-conflict` lost the
        // count — the ONLY channel an AT user has for it, since the visible chip is `aria-hidden` —
        // at exactly the widths where knowing whether to open the menu matters most. Three
        // independent reviews of one diff found it; `MenuItem` grew the prop rather than this file
        // growing a bespoke span, so the composition order stays in one place.
        {...(r.srDescription ? { srDescription: r.srDescription } : {})}
        onSelect={() => r.item.onActivate!(context)}
      >
        {icon}
        {r.item.label}
      </MenuItem>
    );
  }

  // Disabled overflow row, as an ordinary `MenuItem` (ADR-0082).
  //
  // This was a bespoke `<div role="menuitem" aria-disabled tabIndex={-1}>` whose two comments
  // claimed it was "focusable for AT with its reason" and "still an arrow-key stop in the menu".
  // **Both were false**: `Menu`'s `itemsOf` filtered `aria-disabled` out of the roving set, so it
  // was never a stop, the focus ring it carefully added could never fire, and its reason lived only
  // in `title` — a hover tooltip no browser shows on keyboard focus. Verbatim the failure
  // `ToolbarButton` records having shipped once, sitting one file from the primitive that caused it.
  return (
    <MenuItem
      disabled
      {...(r.item.isActive ? { checked: r.active } : {})}
      {...(r.busy ? { busy: true } : {})}
      {...(r.disabledReason ? { disabledReason: r.disabledReason } : {})}
      {...(r.srDescription ? { srDescription: r.srDescription } : {})}
      onSelect={NOOP}
    >
      {icon}
      {r.item.label}
    </MenuItem>
  );
}

function ToolbarOverflowInner<Ctx>(
  {
    items,
    context,
    groupLabels,
    tabIndex,
    onKeyDown,
    onFocus,
    onOpenChange,
  }: ToolbarOverflowProps<Ctx>,
  forwardedRef: Ref<HTMLButtonElement>,
) {
  const localRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // Tell the row when the menu is open. `Toolbar` freezes the ladder for the duration — see its
  // `menuOpen` guard — because an item that leaves this menu while somebody is arrow-keyed onto it
  // unmounts under their focus.
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });

  const setRefs = (node: HTMLButtonElement | null): void => {
    localRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  const openMenu = (): void => {
    const rect = localRef.current?.getBoundingClientRect();
    // Right-align the menu under the ⋯ (it sits at the bar's trailing edge).
    setAnchor({ x: (rect?.right ?? 0) - 176, y: rect?.bottom ?? 0 });
    setOpen(true);
  };

  return (
    <>
      <button
        ref={setRefs}
        type="button"
        data-toolbar-focusable=""
        data-toolbar-item="__overflow__"
        aria-label="More toolbar actions"
        aria-haspopup="menu"
        aria-expanded={open}
        tabIndex={tabIndex}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={toolbarControlVariants({ active: open })}
      >
        <MoreHorizontal aria-hidden="true" className="size-4" />
      </button>

      <Menu
        open={open}
        onClose={() => setOpen(false)}
        anchor={anchor}
        label="More toolbar actions"
        restoreFocusRef={localRef}
      >
        {items.map((r, index) => (
          <Fragment key={r.item.id}>
            {/* A break wherever the group changes. The first section draws no rule — there is
                nothing above it to separate it from. */}
            {index === 0 || items[index - 1]!.item.group !== r.item.group ? (
              <MenuSection
                label={groupLabels[r.item.group]}
                {...(index === 0 ? {} : { divider: true })}
              />
            ) : null}
            {renderItem(r, context)}
          </Fragment>
        ))}
      </Menu>
    </>
  );
}

// forwardRef with a generic component: cast preserves the <Ctx> parameter for callers.
export const ToolbarOverflow = forwardRef(ToolbarOverflowInner) as <Ctx>(
  props: ToolbarOverflowProps<Ctx> & { ref?: Ref<HTMLButtonElement> },
) => React.ReactElement;
