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
          resource. Each resource’s row sums to its total budgeted units.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="border-border border-b p-2 font-semibold">
              Bucket start
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
