import type { HistogramGranularity } from '@repo/types';
import { useId, useState } from 'react';

import { useResourceHistogram, useResources } from '../api/use-resources';

import { BucketSizeSelect, ResourceLoadingTable, formatUnits } from './ResourceLoadingTable';

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
  // A single scale across every bar so heights are comparable between resources.
  const maxValue = Math.max(1, ...series.flatMap((s) => s.values));

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

          {/* Bar chart — a decorative visual; aria-hidden because the data table below is its text
              equivalent (a screen-reader user reads the table, not this graphic). */}
          <div className="flex flex-col gap-4" aria-hidden="true">
            {series.map((s) => (
              <div key={s.resourceId} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{resourceName(s.resourceId)}</span>
                  <span className="text-muted-foreground">{formatUnits(s.total)} units total</span>
                </div>
                <div className="border-border flex h-16 items-end gap-px border-b">
                  {s.values.map((value, i) => (
                    <div
                      key={buckets[i]?.start ?? i}
                      className="bg-primary/70 min-h-px flex-1 rounded-t-sm"
                      style={{ height: `${(value / maxValue) * 100}%` }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

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
