import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Which ground the placeholder is drawn on. `bg-muted` rebinds per surface scope (ADR-0055), but a
 * block on a ground that is itself `bg-muted` — a framed `ContextStrip` — would be invisible, so
 * that ground takes the `border` token instead. Both are existing tokens.
 */
const skeletonVariants = cva('animate-pulse rounded-md', {
  variants: {
    surface: {
      default: 'bg-muted',
      muted: 'bg-border',
    },
  },
  defaultVariants: { surface: 'default' },
});

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
 * `aria-hidden`, because a skeleton is not information — `LoadingShape` carries the one sentence
 * that tells an assistive reader something is loading. Announcing a dozen grey rectangles would be
 * noise in place of that one fact.
 *
 * `data-skeleton` is the hook for the one rule `globals.css` keeps for forced colours: that mode
 * replaces backgrounds, so a bare skeleton is invisible in Windows High Contrast and gets a
 * `GrayText` outline instead. It is also what measuring instruments use to know they are looking at
 * a skeleton rather than content.
 */
export function Skeleton({
  className,
  surface,
  ...props
}: React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof skeletonVariants>): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      data-skeleton=""
      className={cn(skeletonVariants({ surface }), className)}
      {...props}
    />
  );
}

/**
 * A placeholder exactly as wide and tall as `sample` would render — content-shaped material
 * (`Skeleton` is shape-agnostic; this is the one that knows a string's size).
 *
 * The sample sits inside the block as `visibility: hidden` text, so the block's intrinsic size IS
 * the sample's size in the current font, weight and text size, with no number to keep in step with
 * the typeface. It is `visibility: hidden` and **not** `color: transparent`: under forced colours a
 * transparent text colour is overridden to `CanvasText`, which would print the sample — fake data —
 * on screen. The sample is caller-supplied and never visible, so no primitive here carries copy.
 *
 * @example
 * <SkeletonText sample="12 Oct 2026" />
 */
export function SkeletonText({
  sample,
  className,
  surface,
}: {
  /** One plausible value for the field — formatted with the formatter the settled cell uses. */
  sample: string;
  className?: string;
} & VariantProps<typeof skeletonVariants>): React.ReactElement {
  return (
    <Skeleton surface={surface} className={cn('inline-block align-middle', className)}>
      <span className="invisible whitespace-nowrap">{sample}</span>
    </Skeleton>
  );
}
