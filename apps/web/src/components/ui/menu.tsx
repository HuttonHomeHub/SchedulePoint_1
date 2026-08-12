import { createContext, useContext, useId, useEffect, useRef, useState } from 'react';
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
 * Scope is intentionally minimal — a flat list of a handful of actions, no
 * submenus or typeahead. Items may be **disabled** (`aria-disabled`), and roving
 * focus **still reaches them** so a `disabledReason` is readable by keyboard
 * (ADR-0082 — this sentence said "skipped by roving focus" until then, which is
 * exactly why the reason could not be shown at any call site). A future consumer
 * needing more should extend this primitive (add the feature here) rather than
 * fork it.
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

/**
 * The menu items currently in the menu, in DOM order (plain + radio items).
 *
 * **Disabled items are included** (ADR-0082). They used to be filtered out, and that one line had
 * four consequences: a shaded item's reason was unreachable by keyboard, which is why `#111` could
 * not be fixed at the call site; `ToolbarOverflow`'s disabled row claimed in a comment to be "an
 * arrow-key stop" while being excluded here; `onKeyDown`'s `indexOf` returned `-1` when focus sat on
 * a filtered-out item, so ArrowUp landed on the **second-to-last** item; and a menu whose items were
 * all disabled focused nothing on open, leaving focus on the trigger outside the portal where the
 * container's React handler never sees the arrows.
 *
 * The APG's *Developing a Keyboard Interface* practice names "Menu items in a Menu or menu bar" in
 * its keep-focusable list, so including them is a return to the pattern this primitive implements
 * rather than a departure from it. The accepted cost is that arrow keys pass through inert items —
 * which the APG accepts for menus, and these are a flat handful of actions by design.
 */
function itemsOf(container: HTMLElement | null): HTMLButtonElement[] {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]',
    ),
  );
}

/**
 * The trigger-side state a **menu button** needs: an open flag, the viewport anchor computed from the
 * trigger's rect, and open/close/toggle helpers. Extracted so the toolbar's menu-buttons (the Add
 * split-button, the Link-type selector, …) share one implementation instead of re-deriving the
 * ref + `getBoundingClientRect()` + `useState` dance each time (component review, ADR-0032). Pair it
 * with {@link Menu}: spread nothing special on the trigger beyond `ref={triggerRef}` and wire
 * `onClick={toggle}`; pass `open`/`anchor`/`onClose={close}`/`restoreFocusRef={triggerRef}` to `Menu`.
 */
export function useMenuTrigger(): {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  open: boolean;
  anchor: MenuAnchor;
  openMenu: () => void;
  close: () => void;
  toggle: () => void;
} {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<MenuAnchor>({ x: 0, y: 0 });
  const openMenu = (): void => {
    const rect = triggerRef.current?.getBoundingClientRect();
    setAnchor({ x: rect?.left ?? 0, y: rect?.bottom ?? 0 });
    setOpen(true);
  };
  const close = (): void => setOpen(false);
  const toggle = (): void => (open ? close() : openMenu());
  return { triggerRef, open, anchor, openMenu, close, toggle };
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
    portalTarget(),
  );
}

/**
 * Where the menu mounts: the **topmost open modal `<dialog>`** if there is one, else `document.body`.
 *
 * A modal `<dialog>` (opened with `showModal()`) lives in the browser's **top layer**, which sits
 * above the whole normal stacking context — `z-50` on a sibling of `<body>` is not merely lower, it
 * is in a different layer and no z-index can reach it. So a menu portalled to `document.body` from
 * inside a dialog renders *underneath* the dialog: visible in the DOM, entirely unclickable, and
 * silently so. Every consumer until now opened its menu from a page, which is why this went unseen
 * until a Playwright journey drove one from inside the calendar dialog and the click retried for
 * thirty seconds against "subtree intercepts pointer events".
 *
 * `position: fixed` stays viewport-relative inside a dialog (a dialog establishes no containing
 * block of its own), so the anchor maths above is unaffected. The **last** open dialog is chosen
 * because a nested one is the topmost.
 */
function portalTarget(): HTMLElement {
  const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
  return dialogs[dialogs.length - 1] ?? document.body;
}

/**
 * A **labelled section break** inside a {@link Menu} — the rule plus the heading above the group it
 * introduces.
 *
 * Extracted from `tsld-toolbar-items.tsx`, where it was a private component rendering a bare `<p>`.
 * Two things were wrong with that, and only one of them is why it moved. **ARIA restricts a
 * `role="menu"`'s children** to `menuitem`/`menuitemradio`/`menuitemcheckbox`/`group`/`separator`,
 * so a stray paragraph is an `aria-required-children` violation and the heading reached AT as
 * nothing at all — the sections were a purely visual grouping. And every section after the first was
 * preceded by a hand-written `<div role="separator">`, so the two halves of one idea were separate
 * markup that a new section could get half-right.
 *
 * **It renders as a named `separator`, not a `group`.** The obvious shape — wrap the items in
 * `role="group" aria-labelledby` — is the stronger semantic, and it was rejected here for a reason
 * worth stating: it requires the section to *contain* its items, and the call sites are flat runs of
 * conditionals hundreds of lines long. Re-indenting them buys the better role at the cost of a diff
 * nobody can review. A separator may carry an accessible name, its children are presentational, and
 * it is a permitted child of `menu` — so the heading becomes announceable without moving a single
 * item. If a future menu needs true group semantics, add a `MenuGroup` beside this rather than
 * changing what this one does.
 *
 * `divider` draws the rule. It defaults **off** so the first section in a menu opens without a line
 * above it, which is what every existing menu already looked like.
 */
export function MenuSection({
  label,
  divider = false,
}: {
  /** The section heading. Also the separator's accessible name — the visible text is presentational. */
  label: string;
  /** Draw a rule above the heading. Off for the first section in a menu. */
  divider?: boolean;
}): React.ReactElement {
  return (
    <div
      role="separator"
      aria-label={label}
      className={cn(divider && 'border-border mt-1 border-t pt-1')}
    >
      <span
        aria-hidden="true"
        className="text-muted-foreground block px-2 pt-2 pb-1 text-[10px] font-semibold tracking-wider uppercase"
      >
        {label}
      </span>
    </div>
  );
}

/**
 * One menu action. Renders a `role="menuitem"` button that is not a tab stop
 * (roving focus is driven by {@link Menu}); selecting it runs `onSelect` and then
 * closes the menu, restoring focus to the trigger. `destructive` tints the item
 * for delete-style actions.
 *
 * When `selected` is provided the item becomes a **radio** menu item
 * (`role="menuitemradio"` + `aria-checked`) so a screen reader announces which
 * option in a single-choice group is currently active — the visual check on its
 * own (an `aria-hidden` icon) conveys nothing to AT (component/a11y review).
 *
 * `disabled` renders a non-actionable item (`aria-disabled`, muted) that {@link Menu}'s roving focus
 * **still reaches** (ADR-0082) — so the option is discoverable, and `disabledReason` can explain it.
 *
 * **`disabledReason` is a description, never part of the name.** Folding it into the name would make
 * the name narrate state, repeat one sentence across every shaded item in a menu, and re-introduce
 * the exact defect `ToolbarButton` fixed one primitive along — where thirteen existing tests caught
 * it the moment it was written. Use it for a reason the reader can act on (the ADR-0028 pen, a
 * role); a permanently inert "Coming soon" placeholder needs no sentence beyond its label.
 *
 * The `sr-only` span is a **sibling** of the button, not a child. `ToolbarButton` had to keep its
 * copy inside — the button is that component's single forwarded-ref root — and pin the name with
 * `aria-label` to stop it leaking, because a button's accessible name comes from its content. This
 * component forwards no ref and takes arbitrary `children` (so there is no label string to pin
 * `aria-label` to anyway), which makes the sibling the simpler and stricter answer: the name is
 * whatever the children say, and nothing else.
 */
export function MenuItem({
  checked,
  onSelect,
  destructive = false,
  selected,
  disabled = false,
  disabledReason,
  busy = false,
  children,
}: {
  onSelect: () => void;
  destructive?: boolean;
  /**
   * A **toggle**'s on/off state — renders `role="menuitemcheckbox"` + `aria-checked`.
   *
   * Added by ADR-0090 M2 (2026-08-12), when four commands moved to tier 3 to buy the two rows their
   * labels at 1920 and one of them — `Float paths` — turned out to be a toggle. On the bar it
   * carried `aria-pressed`; in the menu it became a plain `menuitem` announcing **no state at all**,
   * so a screen-reader user could not tell whether the panel was open. The overflow had only ever
   * held plain actions before, so nothing had needed this.
   *
   * Distinct from {@link selected}, which is `menuitemradio` — one of several. A toggle is not one
   * of several, and collapsing the two would announce an independent switch as a mutually exclusive
   * choice.
   */
  checked?: boolean;
  selected?: boolean;
  disabled?: boolean;
  /** Why this item is shut, for a reader who can do something about it. Announced as a description. */
  disabledReason?: string;
  /** A write is in flight — `aria-busy`, so the item is not silently inert (ToolbarOverflow parity). */
  busy?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const close = useContext(MenuCloseContext);
  const reasonId = useId();
  // Only when there IS a reason: `aria-describedby` pointing at an element that renders nothing is
  // a dangling reference, which some AT reads as an empty description rather than as absence.
  const describedBy = disabled && disabledReason ? reasonId : undefined;
  const button = (
    <button
      type="button"
      role={
        checked !== undefined
          ? 'menuitemcheckbox'
          : selected === undefined
            ? 'menuitem'
            : 'menuitemradio'
      }
      {...(checked !== undefined
        ? { 'aria-checked': checked }
        : selected === undefined
          ? {}
          : { 'aria-checked': selected })}
      {...(disabled ? { 'aria-disabled': true } : {})}
      {...(busy ? { 'aria-busy': true } : {})}
      {...(describedBy ? { 'aria-describedby': describedBy } : {})}
      tabIndex={-1}
      onClick={() => {
        // `busy` guards too, not only `disabled`. Today's one consumer always pairs them, so this
        // is defence for the next one: `aria-busy` says "a write is in flight", and a primitive
        // that announces that while still firing its action on a second click is telling the
        // reader one thing and doing another.
        if (disabled || busy) return;
        onSelect();
        close?.();
      }}
      className={cn(
        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none',
        disabled
          ? [
              'text-muted-foreground cursor-default',
              // A shaded item is now an arrow-key stop, so it needs a visible focus indicator like
              // any other (WCAG 2.4.7). Contrast of the muted label itself stays exempt — 1.4.11
              // excludes inactive components.
              'focus:ring-ring focus:ring-2 focus:ring-inset',
            ]
          : [
              'cursor-pointer',
              // A visible focus ring for the roving-focus item — `bg-accent` alone is ~1.09:1 on the
              // popover surface (fails WCAG 1.4.11); `ring` clears the 3:1 non-text floor (~4.9:1).
              'focus:bg-accent focus:text-accent-foreground focus:ring-ring focus:ring-2 focus:ring-inset',
              'hover:bg-accent hover:text-accent-foreground',
              destructive && 'text-destructive-text',
            ],
      )}
    >
      {children}
    </button>
  );

  return describedBy ? (
    <>
      {button}
      <span id={reasonId} className="sr-only">
        {disabledReason}
      </span>
    </>
  ) : (
    button
  );
}
