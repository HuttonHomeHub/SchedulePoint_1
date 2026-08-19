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
  actions,
  className,
}: PageHeaderProps): React.ReactElement {
  const descriptionId = useId();
  const describedBy = description ? descriptionId : undefined;
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1
          className="text-2xl font-semibold tracking-tight wrap-anywhere"
          {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        >
          {title}
        </h1>
        {description ? (
          <p id={describedBy} className="text-muted-foreground mt-1 text-sm">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
