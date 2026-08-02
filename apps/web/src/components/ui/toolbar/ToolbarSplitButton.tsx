import { ChevronDown } from 'lucide-react';

import { toolbarControlVariants, toolbarSplitCaretVariants } from './toolbar-styles';

import { cn } from '@/lib/utils';

export interface ToolbarSplitButtonProps {
  /**
   * The roving-tabindex props from the toolbar item's API. They go on the **primary**, which is why
   * the pair is one stop rather than two — see {@link toolbarSplitCaretVariants}.
   */
  itemProps: React.ButtonHTMLAttributes<HTMLButtonElement>;
  /**
   * Focus target for the menu's `restoreFocusRef`. Attached to the **primary**, never the caret: the
   * caret is `tabIndex={-1}`, so restoring focus there strands a keyboard user (WCAG 2.4.3). Making
   * it structurally impossible to attach to the wrong half is half the reason this exists — that
   * defect shipped once on each of the two controls this replaces.
   */
  primaryRef: React.RefObject<HTMLButtonElement | null>;
  /** The caret's own ref, used as the menu's anchor. */
  caretRef: React.RefObject<HTMLButtonElement | null>;
  /** Whether the tool this control arms is currently armed — the primary's `aria-pressed`. */
  pressed: boolean;
  /** Whether the type menu is open. Widens the control's active wash and sets `aria-expanded`. */
  open: boolean;
  disabled: boolean;
  /** The primary's tooltip; states the reason when `disabled`. */
  title: string;
  icon: React.ReactNode;
  label: string;
  /** Names the CURRENT selection, e.g. `Link type: Finish-to-Start`. */
  caretLabel: string;
  /** Arm or disarm the tool. Not called while `disabled`. */
  onPrimary: () => void;
  /** Open the type menu. Not called while `disabled`. */
  onOpenMenu: () => void;
}

/**
 * The **toolbar split button**: a primary that arms a tool, and a caret that opens its type menu.
 *
 * Extracted at the two-consumer threshold `docs/COMPONENT_LIBRARY.md` sets — `AddActivityControl`
 * and `LinkControl` had identical wrappers, primary classes, caret classes and key handlers, and
 * the ADR-0064 enablement review found the focus-restore defect **on both**, which is exactly what
 * this shape of duplication produces: a fix applied to the control someone happened to be reading.
 *
 * Two facts it now guarantees rather than asks each caller to remember. The pair is **one roving
 * stop** (`itemProps` on the primary, `tabIndex={-1}` on the caret), and `primaryRef` is the only
 * ref a menu can restore focus to. The keyboard contract is **`ArrowDown` or `ArrowUp`** — the APG
 * split-button pattern names both, `IsolateControl` already honoured both, and these two accepted
 * only `ArrowDown`. Not a 2.1.1 failure, since `ArrowDown` gave full reachability; an
 * inconsistency between siblings, which is how this codebase's defects usually start.
 */
export function ToolbarSplitButton({
  itemProps,
  primaryRef,
  caretRef,
  pressed,
  open,
  disabled,
  title,
  icon,
  label,
  caretLabel,
  onPrimary,
  onOpenMenu,
}: ToolbarSplitButtonProps): React.ReactElement {
  return (
    <span
      className={cn(toolbarControlVariants({ active: pressed || open, disabled }), 'gap-0 p-0')}
    >
      <button
        {...itemProps}
        ref={primaryRef}
        type="button"
        aria-pressed={pressed}
        aria-disabled={disabled || undefined}
        title={title}
        onClick={() => {
          if (!disabled) onPrimary();
        }}
        onKeyDown={(e) => {
          // Either arrow opens the menu and moves into it, so the caret needs no tab stop of its own.
          if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !disabled) {
            e.preventDefault();
            onOpenMenu();
          }
        }}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-l-md px-2 outline-none"
      >
        {icon}
        <span className="truncate">{label}</span>
      </button>
      <button
        ref={caretRef}
        type="button"
        tabIndex={-1}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        aria-label={caretLabel}
        onClick={() => {
          if (!disabled) onOpenMenu();
        }}
        className={cn(toolbarSplitCaretVariants(), 'rounded-r-md px-1 outline-none')}
      >
        <ChevronDown aria-hidden="true" className="size-3.5" />
      </button>
    </span>
  );
}
