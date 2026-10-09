import { cn } from '@/lib/utils';

export interface PageGridProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * How the rows share the height once the grid is two columns.
   *
   * `'auto'` leaves the rows to their content. `'fit-then-fill'` gives the top row what it needs and
   * the bottom row the rest, which is what a screen needs when it caps its boxes to the window and
   * lets the long lists scroll inside them. It is emitted HERE, beside the column rule, because it
   * is keyed to the same split: a one-column grid with a two-row template squeezes the second box
   * and leaves the others to implicit rows. One file, one threshold.
   */
  rows?: 'auto' | 'fit-then-fill';
  children: React.ReactNode;
}

export interface PageGridItemProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * How much of the grid this section needs.
   *
   * `wide` spans every column (`col-span-full`, so it needs no breakpoint); `narrow` takes one and pairs with its neighbour. **It is a statement
   * about the CONTENT, not about importance** — a section is `wide` because its body is a table
   * that cannot be read at half width, never because it matters more. Importance is expressed by
   * position, which is also DOM order, which is also the order a screen reader walks.
   */
  span: 'wide' | 'narrow';
  children: React.ReactNode;
}

/**
 * A page grid whose spans are assigned by **content width demand**, and which is two columns only
 * when it has the room.
 *
 * **It exists because "two columns" and "two EQUAL columns" are different decisions, and only one
 * of them is an improvement.** The staff console's redesign was approved as "two columns
 * throughout", and the arithmetic nobody had done says that at 1646 two equal columns are
 * `(1646 − 48 padding − 24 gap) / 2 = 787 px` against a single column's 848 — so every table on the
 * page would have got NARROWER while the page got wider. Measured, the tables are 798 px today and
 * would have been 737. The console's tables carry four and five columns, two of them `break-all`
 * URI and address fields, and "the tables look cramped" was the diagnosis the whole epic was opened
 * on. See `docs/specs/staff-console-design/feature-spec.md` §8.1.
 *
 * With span-by-demand at the product measure, a table-bodied section gets **1,438 px** —
 * **+80 % against today** — while a stat grid or a row of tool buttons pairs at 732 px, which is
 * ample for four facts or three controls. Both wins instead of one win and one regression.
 *
 * **What it deliberately does NOT do is re-order anything.** There is no `order`, no
 * `grid-auto-flow: dense`, and no explicit placement: a `wide` child spans every column where it
 * already is. A two-column layout satisfies WCAG 1.3.2 (Meaningful Sequence) only if the DOM
 * sequence IS the reading sequence, and the natural implementation of "two columns" — a flat list
 * re-ordered with CSS — breaks that silently, because nothing looks wrong. `dense` is the same trap
 * wearing a different name: it back-fills gaps by pulling later items forward, so the visual order
 * would stop matching the DOM the moment a `wide` item left a hole.
 *
 * The consequence is honest and worth stating: a `wide` item between two `narrow` ones leaves the
 * second `narrow` to start a fresh row, so a run of mixed spans can leave a gap. That is the price
 * of the reading order being true, and it is paid by ORDERING the sections so the pairs fall
 * together — a content decision, made where the sections are listed, not smuggled into the layout.
 *
 * **One column until THIS GRID's own width reaches 72rem (ADR-0182), so a column is never narrower
 * than 564 px whatever the window, the docked Explorer (34–420 px) or the reader's font size.** `md`
 * was a viewport proxy for that rule, chosen before the shell had an Explorer, and at the 1024
 * floor it produced 338 px columns — under the 366 px this paragraph used to call the defect.
 * Because the grid's width is what the rule reads, the split is a container query: the frame
 * declares the container and the grid inside queries it (an element is never its own query
 * container — see `StatGrid`). The frame is a plain `div`, no landmark and no role.
 *
 * **The frame carries the caller's `className`** (the `StatGrid` convention) and is always
 * `flex min-h-0 flex-1 flex-col`, so a parent that gives it a height — the landing's capped
 * workspace — gets a grid that fills it, and a block parent (Members, the staff console) makes
 * those three classes inert. `container-type: inline-size` also applies layout containment: the
 * frame becomes the containing block for any non-portalled `fixed`/`absolute` descendant, so
 * nothing inside a grid section may render one (`Menu` and `Tooltip` portal to `body`).
 */
export function PageGrid({
  className,
  rows = 'auto',
  children,
  ...props
}: PageGridProps): React.ReactElement {
  return (
    <div className={cn('@container flex min-h-0 flex-1 flex-col', className)} {...props}>
      <div
        className={cn(
          'grid min-h-0 flex-1 grid-cols-1 gap-6 @6xl:grid-cols-2',
          rows === 'fit-then-fill' && '@6xl:grid-rows-[minmax(0,auto)_minmax(0,1fr)]',
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * One cell of a {@link PageGrid}.
 *
 * A plain wrapper rather than a class applied to the section itself, because the sections are
 * `SectionCard`s and `SectionCardProps` is a closed interface — and widening every section archetype
 * in the product so that one screen can lay itself out would be the wrong place to spend the change.
 */
export function PageGridItem({
  span,
  className,
  children,
  ...props
}: PageGridItemProps): React.ReactElement {
  return (
    <div className={cn(span === 'wide' && 'col-span-full', 'min-w-0', className)} {...props}>
      {children}
    </div>
  );
}
