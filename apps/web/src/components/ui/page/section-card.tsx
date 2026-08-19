import { useId } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface SectionCardProps {
  /** The section's heading. Rendered as an `<h2>` — see below for why the archetype decides that. */
  title: React.ReactNode;
  /** One line saying what the section holds, when the title alone is not enough. */
  description?: React.ReactNode;
  /** A section-level action, aligned opposite the title. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Omits the card's own padding, for a section whose content is a full-bleed table. */
  flush?: boolean;
}

/**
 * A titled section of a page.
 *
 * **The archetype owns the heading rank, and that is the point.** `CardTitle` defaults to `<h1>`
 * because eleven existing call sites are a page's only heading (see its docblock). A section inside
 * a page is not that, so this passes `level={2}` once, here — rather than asking sixteen screens to
 * remember. Getting it wrong in either direction is invisible on screen and wrong in the heading
 * tree, which is precisely the kind of decision an archetype exists to make once.
 *
 * It composes `Card` rather than reimplementing it, so a section and a card cannot drift apart —
 * the ADR-0062 extraction argument, applied before the divergence rather than after it.
 *
 * **It renders a NAMED `<section>`, which makes each section a landmark.** A `<section>` with an
 * accessible name is a `region`, so a screen-reader user can jump between "Recently changed" and
 * "Needs your attention" instead of walking the whole page. Unlike `PageContainer`'s refusal to be
 * a `<main>`, this adds no ambiguity: each region is distinctly named by its own heading, which is
 * exactly the condition the APG puts on using `region` at all.
 *
 * It was added when the overview journey hit a strict-mode violation — the same plan legitimately
 * appears in both sections, saying two different things — and the page had no way to say which
 * section a row belonged to. That is a test's problem only until you notice a screen-reader user
 * has the same one.
 */
export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  flush,
}: SectionCardProps): React.ReactElement {
  const titleId = useId();
  return (
    <Card as="section" aria-labelledby={titleId} className={className}>
      <CardHeader className={cn('flex items-start justify-between gap-4', flush && 'pb-4')}>
        <div className="min-w-0">
          <CardTitle id={titleId} level={2} className="text-base">
            {title}
          </CardTitle>
          {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </CardHeader>
      <CardContent className={cn(flush && 'p-0')}>{children}</CardContent>
    </Card>
  );
}
