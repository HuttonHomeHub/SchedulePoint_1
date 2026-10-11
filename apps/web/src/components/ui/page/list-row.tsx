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
  /**
   * Where it lives — `project · client`. Muted. It never truncates: when it does not fit beside the
   * name it moves whole to the line beneath, and wraps at words if it is longer than that line.
   */
  context?: React.ReactNode;
  /**
   * A status marker belonging to the name, e.g. a `Draft` badge. It follows the name's last word, and
   * may start a line alone when the name fills its line to the last character.
   */
  badge?: React.ReactNode;
}

/**
 * A row's subject and its context: one line when they fit, as many as they need when they do not,
 * and **never clipped** (ADR-0184, extending ADR-0146 D3/D4 from table columns to list rows).
 *
 * **This exists because the second line was the largest single term in the landing's height**, and
 * it is a component rather than four copies of a flex row for the ADR-0143 reason: the wrap rule is
 * one decision, not one a call site should answer differently. Merging name and context onto one
 * line (M9 D1) saved 20 px a row where everything fits, and it is kept for exactly those rows.
 *
 * **What it replaced was a claim that was never true.** The old docblock said "a row's name must
 * survive and its context may not" and gave the context `shrink-[3]` to make it so. Flexbox shares an
 * overflow in proportion to shrink × base size, so the name still lost `W_name / (W_name + 3·W_context)`
 * of every overflow: measured 2026-10-09, 16 of 17 names clipped at 1024 × 600 and 11 at 1912 × 948,
 * one losing its final digit. The unit test that guarded the claim asserted a class string, and the
 * instrument that counted truncation read only the direct parent's `text-overflow`, so it never
 * saw a name (`docs/specs/row-subject-truncation/m0-measurement.md`).
 *
 * **How it wraps.** The name and its badge are one flex child, the context another, so the break
 * falls between them first and only then at words inside either. `gap-y-0` is deliberate: a vertical
 * gap would break the whole-line steps a row's height takes. The context carries an `sr-only` ", "
 * so a screen reader pauses between the name and the project rather than reading one run-on phrase.
 * Visual order is DOM order; nothing here may reorder.
 */
export function RowSubject({ name, context, badge }: RowSubjectProps): React.ReactElement {
  return (
    <p data-row-subject className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0">
      <span className="min-w-0">
        {name}
        {badge ? <> {badge}</> : null}
      </span>
      {context ? (
        <span className="text-muted-foreground min-w-0 text-sm">
          <span className="sr-only">, </span>
          {context}
        </span>
      ) : null}
    </p>
  );
}

export interface ListRowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The row's leading content — a name, usually with a secondary line beneath. */
  primary: React.ReactNode;
  /** Trailing content: a timestamp, a status pill, a row action. */
  trailing?: React.ReactNode;
  /**
   * Which edge the trailing block lines up with when the primary wraps: `'center'` (the default)
   * centres it on the whole primary block, `'baseline'` puts it on the primary's first line, so a
   * date sits beside the name rather than beside the middle of a tall row.
   */
  align?: 'center' | 'baseline';
}

/**
 * One row of a list: a primary block, an optional trailing block, one rhythm.
 *
 * **The trailing block drops beneath the primary when the primary would be left under 7rem**
 * (`min-w-28` on a primary that otherwise grows to fill). At 320 px the old `shrink-0` trailing text
 * left a plan name 6 characters (`docs/specs/row-subject-truncation/m0-measurement.md` §4); 7rem is
 * about 12 characters, and being rem it scales with text size. At or above the 1024 px floor the
 * narrowest track is 564 px, so it never fires there. This is behaviour, not a prop: every row gets
 * it, because a call site could only get it wrong (ADR-0184 D4).
 *
 * **Its height is its content plus `py-2`, and it is deliberately not a fixed rhythm.** This
 * docblock claimed the height came from `--row-h` (ADR-0097 CQ-B) until 2026-09-16, and the class
 * string four lines below it is `border-b py-2` — no height, no `min-h`, no token. A row here holds
 * a name with an optional secondary line beneath, so a fixed 28 px would clip the two-line case
 * that is the archetype's main reason to exist.
 *
 * Retired rather than made true (page-consistency M6): the token governs the Gantt and nothing
 * else, and making this component obey it would be a layout change made to satisfy a sentence.
 */
export function ListRow({
  primary,
  trailing,
  align = 'center',
  className,
  ...props
}: ListRowProps): React.ReactElement {
  return (
    <div
      className={cn(
        'border-border flex flex-wrap justify-between gap-x-4 gap-y-0 border-b py-2 last:border-b-0',
        align === 'baseline' ? 'items-baseline' : 'items-center',
        className,
      )}
      {...props}
    >
      <div className="min-w-28 flex-1">{primary}</div>
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
