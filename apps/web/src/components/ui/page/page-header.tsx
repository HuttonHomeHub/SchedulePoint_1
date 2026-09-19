import { useId } from 'react';

import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  /** The page's `<h1>`. Exactly one per page — this archetype is how that stays true. */
  title: React.ReactNode;
  /**
   * One or two sentences saying what the screen is for. Rendered as the heading's accessible
   * description, so it is announced with the title rather than as a stray paragraph after it.
   */
  description?: React.ReactNode;
  /**
   * Facts about the subject, beside the title. **Facts, never actions** — `actions` is the slot for
   * anything pressable, and the two are separated because they behave differently under pressure:
   * actions stay put and facts may stack.
   *
   * It exists because the detail screens described nothing. Client detail was a breadcrumb, a name,
   * one card and one row; a reader could not tell how much work sat under the client without
   * counting the table. The aside is where "4 projects · 11 plans" goes.
   *
   * **It is a sibling of the title column, not inside it**, and that is load-bearing:
   * `page-header.tsx`'s whole reason for `flex-1 max-w-prose` on that column is that an
   * `auto`-width flex item shrink-wraps to its content, so a 42-character description rendered
   * 267px wide and a 116-character one 736px — the same description, two measures. Putting the
   * aside inside would reintroduce exactly that, one element along.
   */
  aside?: React.ReactNode;
  /**
   * The screen's primary action, and at most one or two more.
   *
   * **Aligned to the header row's trailing edge** — which is opposite the title while the row holds
   * one line, and opposite the {@link aside} on the second line below `md` when both are passed.
   * This said "aligned opposite the title" unconditionally and that was false in the only shape
   * both props are used in today (see the wrapper below); corrected rather than deleted, because
   * the sentence is what a reader checks the layout against.
   */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * A screen's title, its description and its primary action.
 *
 * **Sixteen screens hand-rolled this**, each as an `<h1 className="text-2xl font-semibold
 * tracking-tight">` with an optional `<p className="text-muted-foreground mt-1 text-sm">` beneath
 * and an optional button pushed right — sixteen independent judgements about the rank, size and
 * weight of a page title, in a product whose typeface now carries hierarchy through weight
 * (ADR-0097). One of them was going to drift, and nothing would have reported it.
 *
 * The description is wired with `aria-describedby` rather than left as a sibling paragraph: it is
 * about the heading, and a landmark-navigating reader who lands on the title should get it. That is
 * the ADR-0073 C2.5 finding — a caveat reachable only by reading serially is not reachable.
 *
 * The id comes from `useId()`, not from a constant. A fixed id was the first version and is a
 * latent duplicate-id defect: this archetype is a page's single header today, but "today" is not
 * something a primitive gets to assume about its call sites, and a duplicated `id` makes
 * `aria-describedby` resolve to whichever element the browser saw first — wrong, and invisible.
 * `SectionCard` already did it this way, which is what made the inconsistency worth looking at.
 */
export function PageHeader({
  title,
  description,
  aside,
  actions,
  className,
}: PageHeaderProps): React.ReactElement {
  const descriptionId = useId();
  const describedBy = description ? descriptionId : undefined;
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      {/* **`flex-1` and `max-w-prose` together are what make the description ONE measure.**
          With `min-w-0` alone this column is an `auto`-width flex item, so it shrink-wraps to its
          content: a 42-character description rendered 267 px wide and a 116-character one 736 px,
          on screens sitting side by side in the same product. That is not a measure at all — it is
          the text's own width wearing one — and M1 measured exactly that divergence
          (`docs/specs/page-consistency/m1-measurement.md`). `flex-1` gives the column the frame's
          width and `max-w-prose` caps the line length inside it, which is the same pairing
          `EmptyState` already uses one file over. */}
      <div className="min-w-0 flex-1">
        <h1
          className="text-2xl font-semibold tracking-tight wrap-anywhere"
          {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        >
          {title}
        </h1>
        {description ? (
          <p id={describedBy} className="text-muted-foreground mt-1 max-w-prose text-sm">
            {description}
          </p>
        ) : null}
      </div>
      {/* **Facts STACK below `md`; they are never hidden.** The first version of this reached for
          `hidden md:block`, which is the wrong instinct twice over: a count is a fact about the
          subject, and a screen that withholds facts from a narrow reader has answered the layout
          question by deleting the content. `basis-full md:basis-auto` puts the aside on its own
          line when the row cannot hold it and beside the title when it can.

          **The aside and the actions share ONE wrapper, and that is the M8 fix rather than tidying.**
          They were siblings, and `basis-full` on a wrapping flex item does not merely take a line
          for itself — it consumes the line, so **everything after it is pushed onto another one**.
          Both real consumers pass the two together, so below `md` the screen's primary action was
          stranded on a third line at `justify-between`'s flex-start, i.e. left-aligned and
          disconnected from the title this file's own `actions` docblock said it sits opposite.
          Reproduced in Chromium at 375px by the M8 component review: title y=1..28, aside y=44..60,
          actions y=76..111 at x=1. One wrapper makes that line two items instead of one, so the
          aside leads it and the actions close it.

          **DOM order is unchanged — aside then actions — at every width**, which is the reason this
          is not solved with `order-*`: visual order and reading order stay the same sequence, so
          there is no WCAG 1.3.2 divergence to argue about (`PageGrid` refuses `order` for exactly
          this reason and would be hard to defend one file over).

          **`basis-full` is conditional on the aside, and `justify-between` on both**, so the two
          shapes that existed before this prop are byte-identical: actions alone still shrink-wrap
          beside the title and wrap naturally, an aside alone still takes its own line. Above `md`
          the wrapper is `basis-auto shrink-0` and paints exactly what two siblings painted. */}
      {aside || actions ? (
        <div
          className={cn(
            'flex shrink-0 items-center gap-4',
            aside ? 'basis-full md:basis-auto' : null,
            aside && actions ? 'justify-between md:justify-end' : null,
          )}
        >
          {aside ? <div className="text-muted-foreground text-sm">{aside}</div> : null}
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
