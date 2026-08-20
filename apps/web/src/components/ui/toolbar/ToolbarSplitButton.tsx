import { ChevronDown } from 'lucide-react';
import { useId } from 'react';

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
  /**
   * Gates **both halves**. Correct while a split button's two halves are two faces of one command
   * (`Add ▾`, `Link ▾`), which was every consumer until ADR-0091 C4.
   *
   * When the halves are **different commands** with different gates, pass `primaryDisabled` /
   * `caretDisabled` instead. Merging `Go to today` (gated on a computed diagram in the canvas view)
   * with `Go to date` (gated only on the plan being anchored) under this one prop would have made
   * Go-to-date unreachable on an empty or Gantt-viewed plan — a capability a planner has today,
   * removed by a layout change, which is the ADR-0081 dead-end shape.
   */
  disabled?: boolean;
  /** Overrides {@link disabled} for the primary half alone. */
  primaryDisabled?: boolean;
  /**
   * Why a shaded half is shut, **programmatically associated** — an `sr-only` sibling wired by
   * `aria-describedby`, exactly as {@link ToolbarButton} and {@link ToolbarPopover} do it (ADR-0082).
   *
   * The composite shipped with `title` alone, which is the failure this repository has now recorded
   * four times: a `title` is a hover tooltip that no mainstream browser shows on keyboard focus, so
   * a sighted keyboard-only planner tabbing to a shaded control got a dimmed button and nothing
   * else. It became reachable on a live path when `Go to today ▾` merged two commands with genuinely
   * different gates (ADR-0091 M7-S6): before that, every consumer used one `disabled` for both
   * halves and the primary's `title` happened to cover it.
   */
  primaryDisabledReason?: string;
  caretDisabledReason?: string;
  /** Overrides {@link disabled} for the caret half alone. */
  caretDisabled?: boolean;
  /**
   * What the caret opens, for `aria-haspopup`. `'menu'` (default) for a type menu; `'dialog'` for a
   * popover panel — announcing a dialog as a menu tells a screen-reader user to expect arrow-key
   * item navigation that a panel of fields does not provide.
   */
  haspopup?: 'menu' | 'dialog';
  /**
   * Withhold the visible label, keeping it as the accessible name. Mirrors `ToolbarPopover`'s prop
   * of the same name so the two triggers compact the same way at the same band.
   */
  compact?: boolean;
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
  disabled = false,
  primaryDisabled,
  caretDisabled,
  primaryDisabledReason,
  caretDisabledReason,
  haspopup = 'menu',
  compact = false,
  title,
  icon,
  label,
  caretLabel,
  onPrimary,
  onOpenMenu,
}: ToolbarSplitButtonProps): React.ReactElement {
  const primaryOff = primaryDisabled ?? disabled;
  const caretOff = caretDisabled ?? disabled;
  const reasonIds = useId();
  // Only when there IS a reason: an `aria-describedby` pointing at nothing is a dangling reference,
  // which some AT reads as an empty description rather than as absence.
  const primaryReasonId = primaryOff && primaryDisabledReason ? `${reasonIds}-p` : undefined;
  const caretReasonId = caretOff && caretDisabledReason ? `${reasonIds}-c` : undefined;
  return (
    <span
      className={cn(
        // The wrapper's wash reads "this control is unavailable", so it may only dim when BOTH
        // halves are — otherwise a live caret sits inside a shaded control and looks inert.
        toolbarControlVariants({ active: pressed || open, disabled: primaryOff && caretOff }),
        'gap-0 p-0',
      )}
    >
      <button
        {...itemProps}
        ref={primaryRef}
        type="button"
        aria-pressed={pressed}
        aria-disabled={primaryOff || undefined}
        // The name is pinned whenever a reason span is rendered, for the same reason
        // `ToolbarButton` pins it: the span lives inside the button, and a button's name comes from
        // its content, so without this the reason would join the name as well as the description.
        {...(compact || primaryReasonId ? { 'aria-label': label } : {})}
        {...(primaryReasonId ? { 'aria-describedby': primaryReasonId } : {})}
        title={primaryOff ? (primaryDisabledReason ?? title) : title}
        onClick={() => {
          if (!primaryOff) onPrimary();
        }}
        onKeyDown={(e) => {
          // Either arrow opens the menu and moves into it, so the caret needs no tab stop of its own.
          // Gated on the CARET's state, not the primary's: the arrows are the keyboard route to the
          // menu, and a shaded primary beside a live caret must not take that route away.
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          e.preventDefault();
          if (!caretOff) {
            onOpenMenu();
            return;
          }
          // **A shaded caret still has to be reachable, or its reason is unreadable by keyboard.**
          // The caret is `tabIndex={-1}` by design — the pair is one roving stop — so the arrows are
          // its *only* keyboard route, and gating them on `!caretOff` switched that route off in
          // exactly the state where there is something to explain. A sighted keyboard-only planner
          // got no focus stop, no announcement, and (the caret has no disabled treatment of its own)
          // no visual difference either. Every sibling in this family — `ToolbarButton`,
          // `ToolbarPopover`, `MenuItem` — deliberately keeps a shaded control focusable for this
          // reason; this one did not, which is the "fixed on one control and not its neighbour"
          // shape its own docblock is about.
          caretRef.current?.focus();
        }}
        // `pointer-coarse:px-3` matches `toolbarControlVariants`, and its absence here was the
        // "one correct pattern applied to a control and not its neighbour" shape (ADR-0064 §7)
        // sitting latent: while this region carried a LABEL its width was never near the floor, so
        // nothing measured it. Graphite M5's merged strip made it icon-only, and the coarse-pointer
        // sweep immediately read `today` at **32 px against a 40 px floor** — a WCAG 2.5.8 failure
        // that had been one label away the whole time. ADR-0090 M3 records the caret failing the
        // same gate for the mirror-image reason.
        className="inline-flex min-h-9 items-center gap-1.5 rounded-l-md px-2 outline-none pointer-coarse:px-3"
      >
        {icon}
        {compact ? null : <span className="truncate">{label}</span>}
        {primaryReasonId ? (
          <span id={primaryReasonId} className="sr-only">
            {primaryDisabledReason}
          </span>
        ) : null}
      </button>
      <button
        ref={caretRef}
        type="button"
        tabIndex={-1}
        aria-haspopup={haspopup}
        aria-expanded={open}
        aria-disabled={caretOff || undefined}
        aria-label={caretLabel}
        {...(caretReasonId ? { 'aria-describedby': caretReasonId } : {})}
        {...(caretOff && caretDisabledReason ? { title: caretDisabledReason } : {})}
        onClick={() => {
          if (!caretOff) onOpenMenu();
        }}
        className={cn(
          toolbarSplitCaretVariants(),
          'rounded-r-md px-1 outline-none',
          // Its own dimming: the wrapper's wash only fires when BOTH halves are shut, so a caret
          // shaded beside a live primary looked identical to a live one.
          caretOff && 'cursor-default opacity-50',
        )}
      >
        <ChevronDown aria-hidden="true" className="size-3.5" />
        {caretReasonId ? (
          <span id={caretReasonId} className="sr-only">
            {caretDisabledReason}
          </span>
        ) : null}
      </button>
    </span>
  );
}
