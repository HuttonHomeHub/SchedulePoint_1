import { cn } from '@/lib/utils';

export interface PageGridProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export interface PageGridItemProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * How much of the grid this section needs.
   *
   * `wide` spans both columns; `narrow` takes one and pairs with its neighbour. **It is a statement
   * about the CONTENT, not about importance** — a section is `wide` because its body is a table
   * that cannot be read at half width, never because it matters more. Importance is expressed by
   * position, which is also DOM order, which is also the order a screen reader walks.
   */
  span: 'wide' | 'narrow';
  children: React.ReactNode;
}

/**
 * A two-column page grid whose spans are assigned by **content width demand**.
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
 * With span-by-demand and `PageContainer width="wide"`, a table-bodied section gets **1,438 px** —
 * **+80 % against today** — while a stat grid or a row of tool buttons pairs at 732 px, which is
 * ample for four facts or three controls. Both wins instead of one win and one regression.
 *
 * **What it deliberately does NOT do is re-order anything.** There is no `order`, no
 * `grid-auto-flow: dense`, and no explicit placement: a `wide` child spans both columns where it
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
 * Single column below `md`, which is not a breakpoint chosen for this screen: two 366 px columns on
 * a tablet would reproduce the defect this component exists to avoid.
 */
export function PageGrid({ className, children, ...props }: PageGridProps): React.ReactElement {
  return (
    <div className={cn('grid grid-cols-1 gap-6 md:grid-cols-2', className)} {...props}>
      {children}
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
    <div className={cn(span === 'wide' && 'md:col-span-2', 'min-w-0', className)} {...props}>
      {children}
    </div>
  );
}
