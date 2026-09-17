import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * **The coverage rule: folded away for a sighted reader, always announced to a screen reader.**
 *
 * M3 of the page-consistency epic moved both audit screens' standing prose out of the top of the
 * page — it cost ~108 px in front of every reader including the ones who already know the rule,
 * and `AuditEventList`'s own empty state says the same thing compressed. It first did that with a
 * `<details>`, on the stated-but-unverified belief that `aria-describedby` resolves into a
 * collapsed one.
 *
 * **It does not, and this component exists because the claim was finally checked.** Measured in
 * Chromium via CDP `Accessibility.getFullAXTree`, with a `role="region"` pointing at a paragraph
 * inside a `<details>`:
 *
 * ```
 * COLLAPSED  description = null
 * EXPANDED   description = "The coverage rule, …"
 * ```
 *
 * A closed `<details>` has its subtree skipped in a way the accessible-description computation
 * cannot reach — unlike the `hidden` attribute and unlike an `sr-only` clip, both of which DO
 * resolve (probed in the same run). So the description was delivered only when the disclosure was
 * already open, which is exactly the state where a reader can see it anyway: the link bought
 * nothing in the state that mattered.
 *
 * **So the content is always in the DOM and the toggle changes only whether it is visible.** One
 * copy of the text, one element for `aria-describedby` to resolve, correct in both states — rather
 * than an `sr-only` duplicate beside a visible one, which would announce the rule twice to anyone
 * who opened it.
 *
 * A `<button aria-expanded>` rather than `<summary>`, because `<summary>` only exists inside
 * `<details>` and `<details>` is the thing that cannot hold this content.
 */
export function CoverageDisclosure({
  contentId,
  children,
}: {
  /** The id the list's `aria-describedby` points at. Stable, supplied by the screen. */
  contentId: string;
  children: React.ReactNode;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const labelId = useId();

  return (
    <div className="mt-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        id={labelId}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((previous) => !previous)}
        className="text-muted-foreground -ml-3"
      >
        {/*
          **A chevron, because a bold phrase on its own line reads as a heading with missing
          content.** The product owner's screenshot shows "What this records" sitting above the
          filter block with nothing beneath it, and nothing about it says it is pressable.

          **Only the visual layer changes here.** `aria-expanded`, `aria-controls` and the
          `sr-only`-not-`hidden` rule below are untouched — those mechanics are correct and were
          established by a CDP measurement recorded in this file's own docblock, so the existing
          test passing unchanged is what proves this did not disturb them. The icon is
          `aria-hidden`: the state is already on the button, and announcing it twice is how a
          reader hears "expanded" and then "chevron".
        */}
        <ChevronDown
          aria-hidden="true"
          className={cn('size-4 transition-transform', open && 'rotate-180')}
        />
        What this records
      </Button>
      {/* `sr-only` when collapsed, NOT `hidden` and NOT unmounted: this element is the
          `aria-describedby` target, so it has to stay in the accessibility tree whatever the
          toggle says. Clipped is the one state that hides it from sight while leaving it
          announceable — verified rather than assumed, in the same probe that disproved the
          `<details>` version. */}
      <div
        id={contentId}
        className={open ? 'text-muted-foreground mt-2 flex flex-col gap-2 text-sm' : 'sr-only'}
      >
        {children}
      </div>
    </div>
  );
}
