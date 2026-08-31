import { HISTOGRAM_GRANULARITIES, type HistogramGranularity } from '@repo/types';
import type { ResourceHistogramBucket, ResourceHistogramSeries } from '@repo/types';

import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/** Human labels for the histogram granularities (shared by the modal histogram + the canvas strip). */
export const GRANULARITY_LABELS: Record<HistogramGranularity, string> = {
  DAY: 'Day',
  WEEK: 'Week',
  MONTH: 'Month',
};

/** Trim a `number` to at most 4 dp for display (units are `DECIMAL(18,4)`), dropping trailing zeros. */
export function formatUnits(value: number): string {
  return Number(value.toFixed(4)).toString();
}

/**
 * The reused **bucket-size `Select`** (Day / Week / Month) — the granularity control shared by the
 * shipped modal `ResourceHistogram` and the Stage-E canvas resource strip. A labelled native `<select>`
 * over the shipped `HISTOGRAM_GRANULARITIES` enum, so both surfaces stay in lock-step (and validated
 * server-side by the same enum). Behaviour-neutral extraction — no new behaviour.
 */
export function BucketSizeSelect({
  id,
  value,
  onChange,
  className = 'w-32',
}: {
  id: string;
  value: HistogramGranularity;
  onChange: (value: HistogramGranularity) => void;
  className?: string;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Bucket size</Label>
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as HistogramGranularity)}
        className={className}
      >
        {HISTOGRAM_GRANULARITIES.map((g) => (
          <option key={g} value={g}>
            {GRANULARITY_LABELS[g]}
          </option>
        ))}
      </Select>
    </div>
  );
}

/**
 * The reused **accessible data table** — the keyboard-navigable, `scope`-ed `<table>` that is the WCAG
 * 2.2 AA text equivalent of the resource-loading bar visual (the bars are `aria-hidden`, whether the
 * shipped modal chart or the Stage-E canvas strip). Renders the given per-resource series' curve-shaped
 * units per bucket, one column per resource, with a total footer — the same markup the shipped
 * `ResourceHistogram` renders, factored out so the canvas strip reuses it verbatim rather than
 * re-implementing the a11y equivalent (ADR-0049 §5).
 */
/**
 * **The per-bucket total, derived from THIS table's own columns — never passed in.**
 *
 * The spec left this as "a new required/optional `bucketTotals` prop (or derived internally;
 * decided at build)", and that is a shared component's public contract, which is exactly the
 * category the process says must be settled before code rather than during it.
 *
 * Deriving it here is the load-bearing half. Passing it in would give one number two sources — the
 * chart's capped-plus-aggregated derivation, and the raw column set this table renders — and they
 * would be summed over different sets in different orders. The table is the RECORD; a record whose
 * footer can disagree with the cells above it is worse than no footer. Derived, the Total column
 * cannot disagree with the numbers beside it, because it is made of them.
 */
function bucketTotal(series: readonly ResourceHistogramSeries[], index: number): number {
  let sum = 0;
  for (const s of series) sum += s.values[index] ?? 0;
  return sum;
}

export function ResourceLoadingTable({
  buckets,
  series,
  granularity,
  resourceName,
  captionId,
}: {
  buckets: readonly ResourceHistogramBucket[];
  series: readonly ResourceHistogramSeries[];
  granularity: HistogramGranularity;
  /** Resolve a resource's display name for the column headers. */
  resourceName: (id: string) => string;
  /** Optional id to associate an external heading as the table caption (else a plain caption). */
  captionId?: string;
}): React.ReactElement {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <caption
          {...(captionId ? { id: captionId } : {})}
          className="text-muted-foreground mb-2 text-left text-sm"
        >
          Curve-shaped units per {GRANULARITY_LABELS[granularity].toLowerCase()} bucket, by
          resource. Each resource is a column, ordered by total budgeted units, largest first; each
          column sums to the resource’s total, and the Total column sums each bucket across every
          resource. Resources are never grouped here, even where the chart aggregates the smallest
          into “Other”.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="border-border border-b p-2 font-semibold">
              Bucket start
            </th>
            {/* The stack's new fact. Derived below from THIS table's own columns — see the note on
                `bucketTotal`. */}
            <th scope="col" className="border-border border-b p-2 text-right font-semibold">
              Total
            </th>
            {series.map((s) => (
              <th
                key={s.resourceId}
                scope="col"
                className="border-border border-b p-2 text-right font-semibold"
              >
                {resourceName(s.resourceId)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket, i) => (
            <tr key={bucket.start}>
              <th scope="row" className="border-border border-b p-2 font-normal">
                {bucket.start}
              </th>
              {/* Deliberately NOT bold. Its column header names it and `tabular-nums` aligns it,
                  so a per-row weight buys nothing a reader needs — and `token-architecture`'s
                  weight ratchet counts every screen that places its own, which is how this was
                  caught rather than shipped. The footer's grand total keeps the emphasis. */}
              <td className="border-border border-b p-2 text-right tabular-nums">
                {formatUnits(bucketTotal(series, i))}
              </td>
              {series.map((s) => (
                <td
                  key={s.resourceId}
                  className="border-border border-b p-2 text-right tabular-nums"
                >
                  {formatUnits(s.values[i] ?? 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="p-2 font-semibold">
              Total
            </th>
            <td className="p-2 text-right font-semibold tabular-nums">
              {formatUnits(series.reduce((acc, s) => acc + s.total, 0))}
            </td>
            {series.map((s) => (
              <td key={s.resourceId} className="p-2 text-right font-semibold tabular-nums">
                {formatUnits(s.total)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
