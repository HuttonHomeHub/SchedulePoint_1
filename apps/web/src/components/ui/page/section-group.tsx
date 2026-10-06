import { HeadingLevelContext, deeper, useHeadingLevel } from './heading-level';

import { textLinkVariants } from '@/components/ui/text-link';
import { cn } from '@/lib/utils';

export interface SectionGroupProps {
  /** The group's heading — a rank-2 `<h2>`, with every section inside it one rank deeper. */
  title: string;
  /** One line saying what the group is for. */
  description?: string;
  /**
   * The group's anchor id, making it a target for an in-page jump list and a place focus can be
   * sent. Setting it also sets `tabIndex={-1}`, for the reason `SectionCard`'s `id` does.
   */
  id?: string;
  /**
   * Where the "Back to top" link goes (a fragment such as `#top`). Omitted, the link is not
   * rendered — a page with no in-page navigation has nothing to return to.
   */
  backToTopHref?: string;
  children: React.ReactNode;
}

/**
 * A named run of sections under one `<h2>` — what a long page is grouped by.
 *
 * **It is a `<section>` with NO accessible name, which makes it generic and not a landmark, and that
 * is deliberate.** Every `SectionCard` inside it is already a named `region`; a group that was one
 * too would nest a landmark around every landmark (the review counted about twenty on `/staff`),
 * and a screen-reader user listing regions would hear the group's name and then its sections' with
 * nothing to tell them apart. The heading is what names the group, and headings are how the page is
 * navigated.
 *
 * **It supplies the heading rank to its children** (`HeadingLevelContext`): the group is the `h2`,
 * so a `SectionCard` inside it is an `h3` and its `SubSection`s are `h4`s. The rank is derived from
 * where the thing sits, so a caller cannot get it wrong by omission.
 *
 * A group nested in a group would render an `h3` group heading and is not a supported shape; the
 * rank still follows the context rather than being clamped to 2, so the tree stays free of skips.
 */
export function SectionGroup({
  title,
  description,
  id,
  backToTopHref,
  children,
}: SectionGroupProps): React.ReactElement {
  const level = useHeadingLevel();
  const Heading = `h${level}` as const;
  return (
    <section
      {...(id === undefined ? {} : { id, tabIndex: -1 })}
      className={cn(
        'space-y-4',
        id !== undefined &&
          'focus-visible:ring-ring focus-visible:ring-offset-background scroll-mt-6 rounded-lg focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
      )}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <Heading className="text-lg font-semibold tracking-tight wrap-anywhere">{title}</Heading>
          {description === undefined ? null : (
            <p className="text-muted-foreground max-w-prose text-sm">{description}</p>
          )}
        </div>
        {backToTopHref === undefined ? null : (
          <a href={backToTopHref} className={textLinkVariants({ size: 'sm' })}>
            Back to top
          </a>
        )}
      </header>
      <HeadingLevelContext.Provider value={deeper(level)}>
        <div className="space-y-6">{children}</div>
      </HeadingLevelContext.Provider>
    </section>
  );
}
