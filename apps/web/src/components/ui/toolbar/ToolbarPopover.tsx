import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { ToolbarItemRenderApi } from './toolbar-registry';

import { cn } from '@/lib/utils';

/** Estimated panel box, to clamp the anchor before the real size is known (mirrors `Menu`). */
const CLAMP_MARGIN = 8;
const ESTIMATED_WIDTH = 288;
const ESTIMATED_HEIGHT = 320;

/**
 * A **Tier-2 labelled disclosure** for the {@link Toolbar} — the `View▾` / `Summary▾` / `Legend▾`
 * buttons. A non-modal popover (unlike the action-only `Menu`): the trigger is a roving-tabindex
 * member of the toolbar (spread `itemProps` from the item's `render` api), and the panel hosts
 * **arbitrary content** (checkbox groups, the summary strip, the legend). Escape and an outside
 * pointer press close it, restoring focus to the trigger — matching `Menu`/`Dialog` conventions.
 * Rendered in a portal so it escapes the toolbar's `overflow-hidden` clip.
 */
export function ToolbarPopover({
  label,
  icon,
  itemProps,
  disabled,
  align = 'start',
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  /** From the toolbar item's `render(ctx, api)` — joins the trigger to the roving tab order. */
  itemProps: ToolbarItemRenderApi['itemProps'];
  disabled?: boolean;
  /** Align the panel's inline-start (`start`) or inline-end (`end`) to the trigger. */
  align?: 'start' | 'end';
  children: React.ReactNode;
}): React.ReactElement {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ left: 0, top: 0 });

  const openPanel = (): void => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = align === 'end' ? rect.right - ESTIMATED_WIDTH : rect.left;
    const maxLeft = Math.max(CLAMP_MARGIN, window.innerWidth - ESTIMATED_WIDTH - CLAMP_MARGIN);
    const maxTop = Math.max(CLAMP_MARGIN, window.innerHeight - ESTIMATED_HEIGHT - CLAMP_MARGIN);
    setAnchor({
      left: Math.min(Math.max(CLAMP_MARGIN, left), maxLeft),
      top: Math.min(Math.max(CLAMP_MARGIN, rect.bottom + 4), maxTop),
    });
    setOpen(true);
  };

  const close = (restoreFocus: boolean): void => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  // While open: move focus into the panel; Escape / outside-pointer close it.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(true);
      }
    };
    const onPointer = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        close(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, [open]);

  return (
    <>
      <button
        {...itemProps}
        ref={triggerRef}
        type="button"
        aria-disabled={disabled || undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (disabled) return;
          if (open) close(false);
          else openPanel();
        }}
        className={cn(
          'text-foreground hover:bg-accent/60 focus-visible:ring-ring inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset',
          open && 'bg-accent text-accent-foreground',
          disabled && 'cursor-default opacity-50',
        )}
      >
        {icon ? (
          <span aria-hidden="true" className="inline-flex shrink-0 items-center">
            {icon}
          </span>
        ) : null}
        <span className="truncate">{label}</span>
        <ChevronDown aria-hidden="true" className="size-3.5 opacity-70" />
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label={label}
              tabIndex={-1}
              style={{ position: 'fixed', left: anchor.left, top: anchor.top }}
              className="border-border bg-popover text-popover-foreground z-50 max-w-[min(20rem,calc(100vw-1rem))] rounded-md border p-3 shadow-md outline-none"
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
