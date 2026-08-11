import { MoreHorizontal } from 'lucide-react';
import { Fragment, forwardRef, useRef, useState, type Ref } from 'react';

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
      <MenuItem onSelect={() => r.item.onActivate!(context)}>
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
      {...(r.busy ? { busy: true } : {})}
      {...(r.disabledReason ? { disabledReason: r.disabledReason } : {})}
      onSelect={NOOP}
    >
      {icon}
      {r.item.label}
    </MenuItem>
  );
}

function ToolbarOverflowInner<Ctx>(
  { items, context, groupLabels, tabIndex, onKeyDown, onFocus }: ToolbarOverflowProps<Ctx>,
  forwardedRef: Ref<HTMLButtonElement>,
) {
  const localRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
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
