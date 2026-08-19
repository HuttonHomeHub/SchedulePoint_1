import { cn } from '@/lib/utils';

/**
 * The loading SHAPE primitive — a pulsing block standing in for content that has not arrived.
 *
 * **It is deliberately not a loading state on its own**, and that distinction is the whole reason
 * this file is small. `docs/UX_STANDARDS.md` requires a skeleton and its settled layout to be
 * identical, so that content arriving does not reflow the page under a reader's cursor. A generic
 * rectangle cannot satisfy that — it reflows into whatever shape the real content turns out to be.
 *
 * So each archetype that has a shape owns its own loading render and uses this as the material:
 * `ListRow.Loading` knows a row's height and columns, `DataTable` knows its own. Raised by the
 * architect while checking the archetypes against the landing page, which asks for skeletons over
 * three sections of rows.
 *
 * `aria-hidden`, because a skeleton is not information — the region it sits in carries the
 * `aria-busy` or the live-region announcement that tells an assistive reader something is loading.
 * Announcing a dozen grey rectangles would be noise in place of that one fact.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      className={cn('bg-muted animate-pulse rounded-md', className)}
      {...props}
    />
  );
}
