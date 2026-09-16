import { Skeleton } from '@/components/ui/page/skeleton';
import { cn } from '@/lib/utils';

/**
 * The class a row's **primary link** wears — the plan name, the item's own name, the thing the row
 * is about.
 *
 * A class constant rather than a component, following `buttonVariants`: the link itself is a
 * router `<Link>`, and `components/ui/` deliberately does not import the router. It exists because
 * the same four declarations (`font-medium`, the hover colour, the underline and its offset) were
 * repeated at every row call site — `docs/COMPONENT_LIBRARY.md`'s stated extraction threshold — and
 * because the weight ratchet in `token-architecture.test.ts` counts a screen placing its own weight
 * as drift, correctly: what a row's name weighs is one decision, not one per list.
 */
export const rowLinkClass =
  'hover:text-primary font-medium wrap-anywhere underline-offset-4 hover:underline';

export interface RowSubjectProps {
  /**
   * The thing the row is about, already built by the caller — normally a router `<Link>` wearing
   * {@link rowLinkClass}. It is a node rather than a string because `components/ui/` deliberately
   * does not import the router (see {@link rowLinkClass}).
   */
  name: React.ReactNode;
  /** Where it lives — `project · client`. Muted, and the first thing to be truncated away. */
  context?: React.ReactNode;
  /** A status marker sitting between the two, e.g. a `Draft` badge. Never shrinks. */
  badge?: React.ReactNode;
}

/**
 * A row's subject and its context, on ONE line.
 *
 * **This exists because the second line was the largest single term in the landing's height.**
 * Every row on the organisation overview rendered the name, then `project · client` beneath it in
 * muted small text — measured at 20 px a row across all four boxes, on a screen whose whole
 * problem was that it did not fit the window (`m8-density-measurement.md`). Merging them is worth
 * more than every other tightening on that screen put together.
 *
 * **It is a component rather than four copies of a flex row**, which is the ADR-0143 lesson at row
 * scale: four call sites each free-handing the same layout is how two tables in that epic ended up
 * 371 px and 660 px wide while both looked right alone. The truncation rule in particular is one
 * decision — a row's name must survive and its context may not — and it is not one a call site
 * should be able to answer differently.
 *
 * **The context shrinks three times faster than the name**, so a long plan name eats its project
 * and client rather than being clipped itself. `min-w-0` on both is what lets either truncate at
 * all inside a flex line; without it a flex item's minimum is its content and neither gives.
 */
export function RowSubject({ name, context, badge }: RowSubjectProps): React.ReactElement {
  return (
    <p className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 shrink truncate">{name}</span>
      {badge}
      {context ? (
        <span className="text-muted-foreground min-w-0 shrink-[3] truncate text-sm">{context}</span>
      ) : null}
    </p>
  );
}

export interface ListRowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The row's leading content — a name, usually with a secondary line beneath. */
  primary: React.ReactNode;
  /** Trailing content: a timestamp, a status pill, a row action. */
  trailing?: React.ReactNode;
}

/**
 * One row of a list: a primary block, an optional trailing block, one rhythm.
 *
 * Its height comes from `--row-h` (ADR-0097 CQ-B), the same token the Gantt's virtualizer
 * duplicates as a number — so a list row, a table row and a Gantt bar share one rhythm instead of
 * three that drift.
 */
export function ListRow({
  primary,
  trailing,
  className,
  ...props
}: ListRowProps): React.ReactElement {
  return (
    <div
      className={cn(
        'border-border flex items-center justify-between gap-4 border-b py-2 last:border-b-0',
        className,
      )}
      {...props}
    >
      <div className="min-w-0">{primary}</div>
      {trailing ? <div className="flex shrink-0 items-center gap-3">{trailing}</div> : null}
    </div>
  );
}

/**
 * The row's OWN loading render, and the reason `Skeleton` is not enough on its own.
 *
 * `docs/UX_STANDARDS.md` requires a skeleton and its settled layout to be identical, so content
 * arriving does not reflow the page under the reader's cursor. A generic `Skeleton` rectangle
 * cannot satisfy that — it becomes whatever shape the real row turns out to be. So the shape lives
 * with the component that knows it, and `Skeleton` supplies only the material.
 *
 * The wrapper carries `aria-busy` and the skeletons are `aria-hidden`, so an assistive reader gets
 * one fact — this list is loading — rather than a dozen announced grey rectangles.
 */
export function ListRowSkeleton({ rows = 3 }: { rows?: number }): React.ReactElement {
  return (
    <div aria-busy="true">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="border-border flex items-center justify-between gap-4 border-b py-2 last:border-b-0"
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-3 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}
