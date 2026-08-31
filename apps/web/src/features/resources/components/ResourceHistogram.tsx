import type { HistogramGranularity } from '@repo/types';
import { useId, useMemo, useState } from 'react';

import { useResourceHistogram, useResources } from '../api/use-resources';
import { stackSeries } from '../model/stack-series';

import { BucketSizeSelect, ResourceLoadingTable } from './ResourceLoadingTable';
import { ResourceStackChart } from './ResourceStackChart';

import { Button } from '@/components/ui/button';

/**
 * The plan's **resource loading histogram** read view (M7 rung 5, ADR-0044 §3 / ADR-0035 §31) — a
 * `GET …/schedule/resource-histogram` reader shown behind `VITE_RESOURCE_CURVES`. Each resource's
 * curve-shaped units-over-time are rendered BOTH as a compact bar chart (a decorative visual) AND as a
 * **keyboard-navigable data table** that carries the same numbers — so the chart is never the only
 * representation (WCAG 2.2 AA). A granularity control (Day / Week / Month) sets the shared time axis.
 *
 * The bar chart's `<svg>` is `aria-hidden` (the data table is its text equivalent), so a screen-reader
 * user reads the table — a real `<table>` with `scope`-ed headers, natively keyboard-navigable — rather
 * than an opaque graphic.
 */
export function ResourceHistogram({
  orgSlug,
  planId,
}: {
  orgSlug: string;
  planId: string;
}): React.ReactElement {
  const [granularity, setGranularity] = useState<HistogramGranularity>('WEEK');
  const histogram = useResourceHistogram(orgSlug, planId, granularity);
  const resources = useResources(orgSlug);
  const granularityId = useId();
  const tableCaptionId = useId();

  const nameById = new Map((resources.data ?? []).map((r) => [r.id, r.name]));
  const resourceName = (id: string): string => nameById.get(id) ?? 'Unknown resource';

  const buckets = histogram.data?.buckets ?? [];
  const series = histogram.data?.series ?? [];
  // The derivation both surfaces share — capped, ranked, aggregated, with the per-bucket totals the
  // stack's height is measured against. Memoised on the inputs it actually reads, so an unrelated
  // re-render of this dialog (focus, hover, a granularity control's own state) does not re-rank.
  const stacked = useMemo(
    () =>
      stackSeries(series, buckets.length, {
        resourceName,
        // Resolved as `var()` so the swatch re-colours on a theme change with no JS, matching the
        // fills. `--muted-foreground` rather than a ramp member: the aggregate is not a resource,
        // and a categorical colour would say that it is.
        neutral: { fill: 'var(--muted-foreground)', ink: 'var(--background)' },
      }),
    // `resourceName` closes over `nameById`, which is rebuilt per render; depending on it would
    // defeat the memo. The names only change when `resources.data` does, which changes `series`
    // in the same fetch cycle in practice — and a stale NAME is a cosmetic miss, never a wrong
    // number, because every value here comes from `series`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, buckets.length],
  );

  return (
    <section className="flex flex-col gap-4" aria-labelledby={tableCaptionId}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 id={tableCaptionId} className="text-sm font-semibold">
          Resource loading histogram
        </h3>
        <BucketSizeSelect id={granularityId} value={granularity} onChange={setGranularity} />
      </div>

      {histogram.isPending ? (
        <p className="text-muted-foreground text-sm">Loading histogram…</p>
      ) : histogram.isError ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-destructive-text text-sm">
            Couldn’t load the resource histogram.
          </p>
          <Button variant="outline" size="sm" onClick={() => void histogram.refetch()}>
            Try again
          </Button>
        </div>
      ) : series.length === 0 ? (
        <div className="border-border text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          No resource loading to show yet — assign resources with budgeted units and recalculate the
          schedule.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {histogram.data && histogram.data.curveNormalisedCount > 0 ? (
            <p role="status" className="text-muted-foreground text-sm">
              {histogram.data.curveNormalisedCount} assignment
              {histogram.data.curveNormalisedCount === 1 ? '' : 's'} had a loading curve that didn’t
              sum to 100%; it was scaled to keep the budgeted units exact.
            </p>
          ) : null}

          {histogram.data?.hasMore ? (
            <p role="status" className="text-muted-foreground text-sm">
              Showing {series.length} of {histogram.data.total} resources. The rest are not loaded,
              so the totals below are of what is shown rather than of the whole plan.
            </p>
          ) : null}

          <ResourceStackChart stacked={stacked} buckets={buckets} />

          {/* Keyboard-navigable data-table equivalent (WCAG 2.2 AA) — the chart's accessible
              alternative, the SAME shared `<table>` the Stage-E canvas resource strip renders. */}
          <ResourceLoadingTable
            buckets={buckets}
            series={series}
            granularity={granularity}
            resourceName={resourceName}
          />
        </div>
      )}
    </section>
  );
}
