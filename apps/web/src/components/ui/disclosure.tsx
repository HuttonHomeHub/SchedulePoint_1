import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface DisclosureProps {
  /** The button's text. It names the control, so it says what opens: "What this records". */
  label: string;
  /**
   * **What a collapsed disclosure does with its content, required because both answers are right
   * for different content and neither is a safe default.**
   *
   * - `'described'` keeps the content in the DOM and in the accessibility tree, clipped with
   *   `sr-only`. It is for **prose that another element describes into** (`aria-describedby`): a
   *   closed `<details>` was measured, in Chromium, to deliver no description at all, so the rule
   *   the list relies on has to stay resolvable while it is folded away (ADR-0145 D5).
   * - `'hidden'` does not render the content. It is for **controls and detail nobody describes
   *   into** — rendering them clipped would leave focusable things in the tab order that a sighted
   *   keyboard user cannot see, which is WCAG 2.4.7 failing silently.
   *
   * A default would let the second kind of content be given the first kind's treatment by omission.
   */
  collapsed: 'described' | 'hidden';
  /**
   * The content's id — the `aria-describedby` target when `described`. Defaults to a generated one;
   * a caller whose list points at it by id supplies it.
   */
  contentId?: string;
  /** Open on first render. The state is the disclosure's own and is not remembered. */
  defaultOpen?: boolean;
  /** Classes for the wrapper (spacing against what precedes it). */
  className?: string;
  /** Classes for the trigger, for a disclosure sitting on a tinted ground that the muted ink fails on. */
  triggerClassName?: string;
  children: React.ReactNode;
}

/**
 * A button that folds content away: `aria-expanded` and `aria-controls` on a `<button>`, a chevron
 * for the affordance.
 *
 * **It is `CoverageDisclosure`'s mechanism, promoted** (staff console redesign M2). That component
 * recorded the measurement that settled the shape — a `<details>` cannot be used where the content
 * is described into, because a closed one resolves no accessible description — and a second
 * disclosure (a condition's "How to fix") was about to copy it. The probe is in
 * `features/audit/components/CoverageDisclosure.tsx`'s history and in ADR-0145 D5; this file does
 * not restate it as evidence of anything it did not itself run.
 *
 * **Keyboard contract:** Enter and Space toggle (a native `<button>`); there is no roving focus, no
 * Escape handling and no focus movement on open or close — focus stays on the button, which is the
 * APG disclosure pattern. Nothing about it needs a `Tabs`-style contract.
 *
 * The chevron is `aria-hidden`: the state is already on the button, and announcing it twice is how a
 * reader hears "expanded" and then "chevron".
 */
export function Disclosure({
  label,
  collapsed,
  contentId,
  defaultOpen = false,
  className,
  triggerClassName,
  children,
}: DisclosureProps): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  const generatedId = useId();
  const id = contentId ?? generatedId;
  // A `hidden` disclosure unmounts its content, so while closed there is nothing for
  // `aria-controls` to name; a dangling idref is a defect axe reports.
  const controls = collapsed === 'hidden' && !open ? undefined : id;

  return (
    <div className={className}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={open}
        {...(controls === undefined ? {} : { 'aria-controls': controls })}
        onClick={() => setOpen((previous) => !previous)}
        className={cn('text-muted-foreground -ml-3', triggerClassName)}
      >
        <ChevronDown
          aria-hidden="true"
          className={cn('size-4 transition-transform', open && 'rotate-180')}
        />
        {label}
      </Button>
      {collapsed === 'hidden' && !open ? null : (
        // `sr-only` when a `described` disclosure is closed, NOT `hidden` and NOT unmounted: this
        // element is the `aria-describedby` target, so it stays in the accessibility tree whatever
        // the toggle says.
        <div
          id={id}
          className={open ? 'text-muted-foreground mt-2 flex flex-col gap-2 text-sm' : 'sr-only'}
        >
          {children}
        </div>
      )}
    </div>
  );
}
