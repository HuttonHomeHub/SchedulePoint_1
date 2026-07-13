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
              {r.item.icon ? (
                <span aria-hidden="true" className="inline-flex shrink-0 items-center">
                  {r.item.icon}
                </span>
              ) : null}
              {r.item.label}
            </MenuItem>
          ) : (
            // Disabled (or non-activatable) overflow row: inert, focusable for AT with its reason.
            <div
              key={r.item.id}
              role="menuitem"
              aria-disabled="true"
              tabIndex={-1}
              {...(r.disabledReason ? { title: r.disabledReason } : {})}
              // Still an arrow-key stop in the menu, so it needs a visible focus ring like MenuItem —
              // `opacity-60` alone leaves a keyboard user unsure where focus is (WCAG 2.4.7).
              className="text-muted-foreground focus:ring-ring flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm opacity-60 outline-none focus:ring-2 focus:ring-inset"
            >
              {r.item.icon ? (
                <span aria-hidden="true" className="inline-flex shrink-0 items-center">
                  {r.item.icon}
                </span>
              ) : null}
              {r.item.label}
            </div>
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
