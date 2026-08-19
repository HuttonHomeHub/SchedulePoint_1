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
