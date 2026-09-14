import { cn } from '@/lib/utils';

export interface StatItem {
  label: string;
  value: React.ReactNode;
  /**
   * A quieter second line beneath the figure — a unit, a comparison, a caveat.
   *
   * It exists because `EarnedValuePanel`'s tiles have one, and an API designed against the
   * narrowest caller is one the widest can never adopt (spec §8.9). Rendered as a **second `<dd>`**
   * rather than a `<p>`: a definition list allows many `<dd>` per `<dt>`, and a `<div>` inside a
   * `<dl>` may contain only `<dt>`/`<dd>`, so a paragraph here would make the list invalid (axe
   * `definition-list`, WCAG 1.3.1).
   */
  sub?: React.ReactNode;
}

export interface StatGridProps {
  /** The metrics, in reading order. */
  items: StatItem[];
  /**
   * Columns at the grid's own container width. Two below the breakpoint, always.
   *
   * A **container** query, not a viewport one (ADR-0061, spec §8.19): a section can now sit in a
   * 732 px column or span 1,488 px, so a `sm:`-prefixed rule would be right in one and wrong in the
   * other. The container is the thing whose width decides how many figures fit.
   */
  columns?: 3 | 4;
  className?: string;
}

/**
 * A grid of headline metrics: a label, a figure, optionally a quieter line beneath.
 *
 * **The discriminator against `ContextStrip`** (`components/ui/form-layout.tsx`), which is also a
 * promoted `<dl>` of label/value pairs and would otherwise be a coin toss:
 *
 * - **`StatGrid` is a grid of headline metrics in a page section** — figures a reader came to the
 *   screen to read, laid out to be scanned. It is the subject.
 * - **`ContextStrip` is the facts an edit is about, beside the edit** — read-only context that
 *   makes a form intelligible, deliberately quieter than the controls next to it. It is the
 *   background, and its own docblock forbids interactive children for that reason.
 *
 * The figure's size is the visible difference and the honest one: a `StatGrid` value is large
 * because it is what the reader came for; a `ContextStrip` value is `text-sm` because it is not.
 *
 * **It is promoted as the FIRST step of a convergence, not as a sixth answer.** Five hand-rolled
 * metric tiles exist today, each with its own type ramp — `routes/staff.tsx`,
 * `EarnedValuePanel.tsx`, `InterchangeReportTable.tsx`, `GuestPlanView.tsx` and
 * `ScheduleSummaryStrip.tsx` — and `staff.tsx`'s own docblock claimed "the codebase has no promoted
 * primitive for this shape", which was already untrue when it was written. The remaining four are
 * `docs/TECH_DEBT.md` #325; this API is designed against the widest of them so that they CAN adopt
 * it, which is the part that makes it a convergence rather than a sixth divergence.
 */
export function StatGrid({ items, columns = 4, className }: StatGridProps): React.ReactElement {
  return (
    <dl
      className={cn(
        '@container grid grid-cols-2 gap-4',
        columns === 4 ? '@md:grid-cols-4' : '@md:grid-cols-3',
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-muted-foreground text-sm">{item.label}</dt>
          <dd className="text-xl font-semibold tabular-nums">{item.value}</dd>
          {item.sub === undefined ? null : (
            <dd className="text-muted-foreground mt-0.5 text-xs">{item.sub}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}
