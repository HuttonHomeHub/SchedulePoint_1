import { useEffect, useLayoutEffect, useRef } from 'react';

import type { TsldToolbarContext } from './tsld-toolbar-context';

import { useAnnounce } from '@/components/ui/announcer';
import {
  isPromoted,
  type PromotableEntry,
  type PromotionState,
} from '@/components/ui/toolbar/toolbar-promotion';
import { useCloseWhenChanged } from '@/components/ui/toolbar/use-close-when-changed';

/**
 * **Focus follows the command when a resize moves it between the bar and its menu**
 * (toolbar-redesign M5; spec §4.11 E-1 and E-2; ADR-0135 with a destination).
 *
 * Two halves, and each is handled where the thing that moves is:
 *
 * - **Demotion (E-2)** is the toolbar primitives' business: a promoted item names its source trigger
 *   as `successorId`, and `useToolbarFocusHandoff` lands focus there and announces "Moved into the
 *   ‹menu› menu." The trigger is on the bar at every width, so the reader is never left on the
 *   container.
 * - **Promotion (E-1)** is this file's, because the control that loses focus is a menu row in a
 *   portal, outside any toolbar's reach. {@link usePromotionFocusFollow} remembers the menu row
 *   focus was on and, when a resize promotes exactly that command, moves focus to its new button
 *   and says so. {@link useCloseOnPromotionChange} closes the menu the command left.
 *
 * Neither changes a key, a Tab stop or the roving order of `Toolbar`, `Deck` or `Menu`.
 */

/** The name a reader heard on a control, from the DOM — the same lookup the hand-off hook makes. */
function nameOf(el: HTMLElement): string {
  const labelled = el instanceof HTMLInputElement ? (el.labels?.[0]?.textContent ?? null) : null;
  return (el.getAttribute('aria-label') ?? labelled ?? el.textContent ?? '').trim();
}

/**
 * Close a menu that is open when the viewport crosses a stage: the row a reader may be standing on
 * could have left it, and the menu is portalled, so nothing else will tell it. A reader whose focus
 * is still inside the menu as it closes is handed the control that opened it, and told why
 * ({@link useCloseWhenChanged}); a menu that is shut costs nothing.
 *
 * `restoreTo` is the control the menu returns focus to on Escape — the trigger, or a split button's
 * primary half, never its `tabIndex={-1}` caret.
 */
export function useCloseOnPromotionChange(
  promotion: PromotionState,
  open: boolean,
  close: () => void,
  restoreTo: React.RefObject<HTMLElement | null>,
): void {
  useCloseWhenChanged(promotion, open, close, restoreTo);
}

/**
 * Mounted once, by the host. Remembers the menu or popover row focus is on (by its accessible name,
 * which the menus render from the same `menuLabel` the entries declare) and, when a resize promotes
 * that command from under the reader, focuses its bar button and announces it.
 *
 * It yields to anything else that moves focus — one animation frame, then act only if focus was
 * dropped on `<body>` — exactly as `useToolbarFocusHandoff` does, so it cannot become a second
 * answer to a question the product already answers.
 */
export function usePromotionFocusFollow(
  promotion: PromotionState,
  entries: readonly PromotableEntry<TsldToolbarContext>[],
): void {
  const announce = useAnnounce();
  const focused = useRef<{ element: HTMLElement; name: string } | null>(null);
  const previous = useRef(promotion);

  useEffect(() => {
    const onIn = (event: FocusEvent): void => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      focused.current = target.closest('[role="menu"], [role="dialog"]')
        ? { element: target, name: nameOf(target) }
        : null;
    };
    const onOut = (event: FocusEvent): void => {
      // A real move to another element clears the record; a removal (no related target) must not.
      if (event.relatedTarget !== null) focused.current = null;
    };
    document.addEventListener('focusin', onIn, true);
    document.addEventListener('focusout', onOut, true);
    return () => {
      document.removeEventListener('focusin', onIn, true);
      document.removeEventListener('focusout', onOut, true);
    };
  }, []);

  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = promotion;
    if (before === promotion) return;
    const record = focused.current;
    // The row is still there (a different command moved, or none that this reader was on).
    if (!record || record.element.isConnected) return;
    const arrived = entries.find(
      (entry) =>
        entry.menuLabel === record.name &&
        isPromoted(entry.at, promotion) &&
        !isPromoted(entry.at, before),
    );
    if (!arrived) return;
    focused.current = null;
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active !== null && active !== document.body) return;
      const button = document.querySelector<HTMLElement>(`[data-toolbar-item="${arrived.id}"]`);
      if (!button) return;
      button.focus();
      if (document.activeElement === button) announce(`${arrived.label} is now on the toolbar.`);
    });
  }, [promotion, entries, announce]);
}
