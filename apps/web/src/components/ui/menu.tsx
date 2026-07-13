import { createContext, useContext, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

/**
 * A hand-rolled **menu** (WAI-ARIA APG "Menu Button" pattern) on semantic HTML —
 * no new dependency, mirroring {@link Dialog}'s focus conventions. It is a
 * transient, non-modal popup: focus moves into the menu on open, ↑/↓/Home/End
 * rove between items, Escape and item-selection **return focus to the trigger**,
 * and a click/tab away closes it. Anchored to a viewport point (`anchor`) so it
 * serves both a trigger button and a right-click context menu; the anchor is
 * clamped so the menu never overflows the viewport. Rendered in a portal so it
 * escapes clipping/overflow ancestors (e.g. the virtualized tree).
 *
 * Controlled via `open`/`onClose`. Pass `restoreFocusRef` for the element that
 * should regain focus on Escape/selection (the invoking trigger).
 *
 * Scope is intentionally minimal — a flat list of 2–4 actions, no submenus,
 * typeahead, or disabled items. A future consumer needing those should extend
 * this primitive (add the feature here) rather than fork it.
 */

interface MenuAnchor {
  /** Viewport x (px) — the menu's inline-start edge, clamped to stay on-screen. */
  x: number;
  /** Viewport y (px) — the menu's block-start edge, clamped to stay on-screen. */
  y: number;
}

const MenuCloseContext = createContext<(() => void) | null>(null);

/** Estimated menu box used to clamp the anchor before the real size is known. */
const CLAMP_MARGIN = 8;
const ESTIMATED_WIDTH = 208;
const ESTIMATED_HEIGHT = 200;

function clampAnchor({ x, y }: MenuAnchor): { left: number; top: number } {
  const maxLeft = Math.max(CLAMP_MARGIN, window.innerWidth - ESTIMATED_WIDTH - CLAMP_MARGIN);
  const maxTop = Math.max(CLAMP_MARGIN, window.innerHeight - ESTIMATED_HEIGHT - CLAMP_MARGIN);
  return {
    left: Math.min(Math.max(CLAMP_MARGIN, x), maxLeft),
    top: Math.min(Math.max(CLAMP_MARGIN, y), maxTop),
  };
}

/** The focusable menu items currently in the menu, in DOM order. */
function itemsOf(container: HTMLElement | null): HTMLButtonElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
}

export function Menu({
  open,
  onClose,
  anchor,
  label,
  restoreFocusRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchor: MenuAnchor;
  label: string;
  restoreFocusRef?: React.RefObject<HTMLElement | null> | undefined;
  children: React.ReactNode;
}): React.ReactElement | null {
  const ref = useRef<HTMLDivElement>(null);

  // Move focus to the first item on open (APG: opening with the pointer or the
  // menu key places focus on the first item).
  useEffect(() => {
    if (open) itemsOf(ref.current)[0]?.focus();
  }, [open]);

  // Close-and-restore returns focus to the trigger (Escape / selection). Kept in a
  // ref-free closure so the item context and the key handler share one behaviour.
  const closeRestoring = (): void => {
    restoreFocusRef?.current?.focus();
    onClose();
  };

  // Global listeners while open: Escape closes (restoring focus); a pointer press
  // outside closes without stealing focus back from wherever the user clicked.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        restoreFocusRef?.current?.focus();
        onClose();
      }
    };
    const onPointer = (event: PointerEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
    };
    // restoreFocusRef is a stable ref object; onClose is provided stable by callers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const items = itemsOf(ref.current);
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        items[(current + 1) % items.length]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        items[(current - 1 + items.length) % items.length]?.focus();
        break;
      case 'Home':
        event.preventDefault();
        items[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        items[items.length - 1]?.focus();
        break;
      case 'Tab':
        // Tabbing out of a menu dismisses it (APG). The menu is portal-rendered to
        // <body>, so letting native Tab proceed would jump to the top of the document
        // (the menu is detached from the trigger's DOM position); instead close and
        // return focus to the trigger, giving a predictable focus order (SC 2.4.3).
        event.preventDefault();
        closeRestoring();
        break;
    }
  };

  if (!open) return null;

  const { left, top } = clampAnchor(anchor);
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      // The container is programmatically focusable (items receive roving focus); the
      // tabindex keeps it out of the sequential tab order.
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{ position: 'fixed', left, top }}
      className={cn(
        'border-border bg-popover text-popover-foreground z-50 min-w-40 rounded-md border p-1 shadow-md',
      )}
    >
      <MenuCloseContext.Provider value={closeRestoring}>{children}</MenuCloseContext.Provider>
    </div>,
    document.body,
  );
}

/**
 * One menu action. Renders a `role="menuitem"` button that is not a tab stop
 * (roving focus is driven by {@link Menu}); selecting it runs `onSelect` and then
 * closes the menu, restoring focus to the trigger. `destructive` tints the item
 * for delete-style actions.
 */
export function MenuItem({
  onSelect,
  destructive = false,
  children,
}: {
  onSelect: () => void;
  destructive?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const close = useContext(MenuCloseContext);
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={() => {
        onSelect();
        close?.();
      }}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none',
        'focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground',
        destructive && 'text-destructive-text',
      )}
    >
      {children}
    </button>
  );
}
