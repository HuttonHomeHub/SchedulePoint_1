import { createContext, useContext, useId, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  clampAnchor,
  overlayMaxHeight,
  portalTarget,
  useMeasuredBox,
  type OverlayAnchor,
} from '@/components/ui/overlay-position';
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

type MenuAnchor = OverlayAnchor;

const MenuCloseContext = createContext<(() => void) | null>(null);

/**
 * The pre-measurement estimate box for a menu — the first paint only. The clamp itself, the
 * measured correction and the reasons they exist moved verbatim to `overlay-position.ts`
 * (TECH_DEBT #203(b) — one clamp), including this box's own defect record.
 */
const MENU_ESTIMATE = { width: 208, height: 200 };

/**
 * Clamp the menu against its **own measured box**, not an assumed one — the shared
 * {@link useMeasuredBox} + {@link clampAnchor}, with the menu's estimate for the first paint.
 */
function useClampedPosition(
  panelRef: React.RefObject<HTMLDivElement | null>,
  anchor: MenuAnchor,
  open: boolean,
): { left: number; top: number } {
  const box = useMeasuredBox(panelRef, anchor, open);
  return clampAnchor(
    anchor,
    box?.width ?? MENU_ESTIMATE.width,
    box?.height ?? MENU_ESTIMATE.height,
  );
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
  /**
   * Before `if (!open) return null` — a hook cannot sit after an early return, and the panel is
   * unmounted while closed, so this measures a freshly mounted box on every open.
   *
   * **Its position relative to the focus-on-open effect below is load-bearing, and a reorder would
   * break it silently.** React runs every layout effect for a commit — and flushes the state update
   * one triggers — before any passive effect and before paint. Declared here, the sequence is:
   * render at the estimate → measure → re-render at the corrected position → paint → *then* focus
   * moves into the first item. Move this after that `useEffect`, or add an early return between
   * them, and focus lands first and the panel slides out from under it — which a magnifier or
   * screen-reader user meets and jsdom cannot see. Raised by the accessibility gate, which
   * confirmed the current order is correct by construction rather than by luck.
   */
  const { left, top } = useClampedPosition(ref, anchor, open);
  /**
   * The menu's height ceiling (#203(a), fix-slice M-C): a menu taller than the viewport used to
   * pin its top at the margin and run its bottom off-screen with NO scroll — reachable at a short
   * viewport or 200 % browser zoom, which roughly halves `innerHeight` in CSS px and is exactly
   * the population WCAG 2.4.11 protects. The panel now scrolls inside the viewport instead of
   * running off. Same rule as `usePopoverPanel`'s, from the same shared leaf — and deliberately
   * NOT `innerHeight - top - CLAMP_MARGIN`, which is self-referential and shipped the very
   * defect it was written to fix (see {@link overlayMaxHeight}).
   */
  const maxHeight = overlayMaxHeight();

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
        // **Both, and `preventDefault` is the load-bearing one.** `stopPropagation` keeps the key
        // from other LISTENERS; a modal `<dialog>`'s Escape-to-close is a **default action**,
        // checked against `defaultPrevented` after the whole dispatch finishes, so propagation is
        // irrelevant to it. Without this line one Escape closed the menu AND fired the surrounding
        // dialog's close request — discarding a half-typed form in `ResourceFormDialog` and
        // `AddCrossPlanLinkDialog`, which set no `confirmBeforeClose` (`docs/TECH_DEBT.md` #196).
        event.preventDefault();
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

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      // The container is programmatically focusable (items receive roving focus); the
      // tabindex keeps it out of the sequential tab order.
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{ position: 'fixed', left, top, maxHeight }}
      className={cn(
        'border-border bg-popover text-popover-foreground z-50 min-w-40 overflow-y-auto rounded-md border p-1 shadow-md',
      )}
    >
      <MenuCloseContext.Provider value={closeRestoring}>{children}</MenuCloseContext.Provider>
    </div>,
    portalTarget(),
  );
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
        className="text-muted-foreground text-micro block px-2 pt-2 pb-1 font-semibold tracking-wider uppercase"
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
  srDescription,
  busy = false,
  children,
}: {
  /**
   * **`itemId` was here and is gone** (2026-09-01, `docs/TECH_DEBT.md` #149 item 1).
   *
   * It stamped `data-toolbar-item` on a menu row so `e2e-library/support.ts` could locate a command
   * that the width ladder had demoted into the `⋯` — a real defect, fixed by a real prop. **Its
   * reason is now structurally gone**: ADR-0109 D1 deleted `ToolbarOverflow` along with the ladder,
   * and `Deck` wraps rather than hides, so no toolbar command can be in a menu at all. It had zero
   * call sites when it was removed.
   *
   * The row that filed it argued against "a wider API for one caller"; by the time anyone looked
   * there was **no** caller, which is a different and easier decision. Recorded rather than
   * silently deleted so that if a menu ever renders registry commands again, the next reader knows
   * this existed, why, and that git has it.
   */
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
  /**
   * A fact about the item that a sighted reader gets some other way — announced as a description
   * **whether or not the item is enabled**, which is the whole difference from {@link disabledReason}.
   *
   * Added because `srDescription` reached the inline `ToolbarButton` and stopped there: a toolbar
   * command demoted into this menu silently lost it, so `next-conflict`'s "3 conflicts in this plan"
   * — the entire AT channel for a count whose visible chip is `aria-hidden` — vanished at exactly the
   * widths where a planner most needs to know whether opening the menu is worth it. Found by three
   * independent reviews of ADR-0094's diff, which is the "one correct pattern applied to a control
   * and not its neighbour" shape this register keeps recording: `disabledReason` had been extended
   * to both surfaces and this had not.
   *
   * Composed **after** `disabledReason` when both apply, matching `ToolbarButton`'s reason-first
   * order — why you cannot use it outranks what it would tell you.
   */
  srDescription?: string;
  /** A write is in flight — `aria-busy`, so the item is not silently inert. This said
   * "(ToolbarOverflow parity)" until the 2026-08-28 reconciliation pass — that component went
   * with the width ladder (ADR-0109 D1); the surviving statement of the rule is
   * `ToolbarButton`'s busy handling, and the reason stands on its own. */
  busy?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const close = useContext(MenuCloseContext);
  const reasonId = useId();
  const srDescriptionId = useId();
  // Only when there IS something to point at: `aria-describedby` pointing at an element that renders
  // nothing is a dangling reference, which some AT reads as an empty description rather than as
  // absence. Reason first, then the standing description — the same order `ToolbarButton` composes.
  const describedBy =
    [disabled && disabledReason ? reasonId : undefined, srDescription ? srDescriptionId : undefined]
      .filter(Boolean)
      .join(' ') || undefined;
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
      onClick={(event) => {
        // **A portalled click bubbles through the REACT tree, not the DOM one.** The menu is a
        // portal, so this click reaches whatever JSX encloses `<Menu>` — a Gantt row's `onClick`,
        // for instance — even though the item's DOM node was never inside it. `GanttRowMenu`'s
        // trigger already stops propagation for exactly this reason, and the rule was never
        // extended to CHOOSING an item from the menu it opens, so picking a row action also
        // re-selected the row underneath (`docs/TECH_DEBT.md` #196).
        event.stopPropagation();
        // `busy` guards too, not only `disabled`. Today's one consumer always pairs them, so this
        // is defence for the next one: `aria-busy` says "a write is in flight", and a primitive
        // that announces that while still firing its action on a second click is telling the
        // reader one thing and doing another.
        if (disabled || busy) return;
        onSelect();
        close?.();
      }}
      className={cn(
        // `pointer-coarse:min-h-(--control-h)` (ADR-0118 M3): a menu item is a touch target, and
        // at 32 px it was the one control class the epic's surface sweeps structurally cannot
        // see — a menu is portalled and only exists while open. The fine 32 px is untouched.
        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none pointer-coarse:min-h-(--control-h)',
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
      {disabled && disabledReason ? (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      ) : null}
      {srDescription ? (
        <span id={srDescriptionId} className="sr-only">
          {srDescription}
        </span>
      ) : null}
    </>
  ) : (
    button
  );
}
