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
  /** The screen's primary action, and at most one or two more. Aligned opposite the title. */
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
          line when the row cannot hold it and beside the title when it can. */}
      {aside ? (
        <div className="text-muted-foreground shrink-0 basis-full text-sm md:basis-auto">
          {aside}
        </div>
      ) : null}
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
