import { MoreHorizontal } from 'lucide-react';
import { forwardRef, useRef, useState, type Ref } from 'react';

import type { ResolvedToolbarItem } from './toolbar-registry';
import { toolbarControlVariants } from './toolbar-styles';

import { Menu, MenuItem } from '@/components/ui/menu';

/**
 * The toolbar's **overflow** — a `⋯` trigger (a roving-tabindex member of the {@link Toolbar}) that
 * opens the shared APG {@link Menu} holding the Tier-3 and demoted commands. Each overflow command is
 * a `MenuItem`; a disabled one is shown inert with its reason. `render` items aren't demoted (the
 * `Toolbar` keeps popovers/segmented controls on the bar), so the overflow is a flat action list.
 * The `⋯` is always reachable, so no command is ever lost off the edge.
 */
export interface ToolbarOverflowProps<Ctx> {
  items: ResolvedToolbarItem<Ctx>[];
  context: Ctx;
  tabIndex: number;
  onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onFocus?: (event: React.FocusEvent<HTMLButtonElement>) => void;
}

/** A disabled item never activates; `MenuItem` requires the prop regardless. */
const NOOP = (): void => undefined;

function ToolbarOverflowInner<Ctx>(
  { items, context, tabIndex, onKeyDown, onFocus }: ToolbarOverflowProps<Ctx>,
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
        {items.map((r) =>
          r.item.onActivate && r.enabled ? (
            <MenuItem key={r.item.id} onSelect={() => r.item.onActivate!(context)}>
              {/* The RESOLVED icon — `item.icon` may be a ctx function (see `resolveItems`). */}
              {r.icon ? (
                <span aria-hidden="true" className="inline-flex shrink-0 items-center">
                  {r.icon}
                </span>
              ) : null}
              {r.item.label}
            </MenuItem>
          ) : (
            // Disabled overflow row, as an ordinary `MenuItem` (ADR-0082).
            //
            // This was a bespoke `<div role="menuitem" aria-disabled tabIndex={-1}>` whose two
            // comments claimed it was "focusable for AT with its reason" and "still an arrow-key
            // stop in the menu". **Both were false**: `Menu`'s `itemsOf` filtered `aria-disabled`
            // out of the roving set, so it was never a stop, the focus ring it carefully added
            // could never fire, and its reason lived only in `title` — a hover tooltip no browser
            // shows on keyboard focus. Verbatim the failure `ToolbarButton` records having shipped
            // once, sitting one file from the primitive that caused it.
            <MenuItem
              key={r.item.id}
              disabled
              {...(r.busy ? { busy: true } : {})}
              {...(r.disabledReason ? { disabledReason: r.disabledReason } : {})}
              onSelect={NOOP}
            >
              {r.icon ? (
                <span aria-hidden="true" className="inline-flex shrink-0 items-center">
                  {r.icon}
                </span>
              ) : null}
              {r.item.label}
            </MenuItem>
          ),
        )}
      </Menu>
    </>
  );
}

// forwardRef with a generic component: cast preserves the <Ctx> parameter for callers.
export const ToolbarOverflow = forwardRef(ToolbarOverflowInner) as <Ctx>(
  props: ToolbarOverflowProps<Ctx> & { ref?: Ref<HTMLButtonElement> },
) => React.ReactElement;
