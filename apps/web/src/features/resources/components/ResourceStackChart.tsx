import type { ResourceHistogramBucket } from '@repo/types';

import { formatUnits } from './ResourceLoadingTable';

import { type StackedSeries, stackOffsets } from '@/features/resources/model/stack-series';

/**
 * **The stacked bar chart, and its legend.**
 *
 * The chart is `aria-hidden`: `ResourceLoadingTable` is its text equivalent and carries every
 * number, including the ones this chart aggregates into "Other" (which the table never does — the
 * chart summarises to stay readable, the record does not summarise at all).
 *
 * **The legend is NOT `aria-hidden`.** It is the only place a resource's colour is named, so it is
 * real text in reading order; only the swatches are decorative. That follows `TsldLegend`'s
 * `<ul aria-label="Legend"><li>` shape rather than inventing a second one.
 *
 * **Colours arrive as `var(--chart-N)` inline styles, never Tailwind classes.** A
 * `` `fill-chart-${n}` `` compiles to no CSS at all — Tailwind v4 scans for *literal* class strings
 * — so the chart would paint unstyled in a real browser while a jsdom test asserting the className
 * passed. ADR-0100 M4 shipped exactly that defect in this same token family, and
 * `categorical-cycle.structural.test.ts` now refuses it. A `var()` also re-resolves on a theme
 * change with no JS, so this never goes theme-stale.
 */

/** Plot height in px. Fixed rather than measured: the dialog is a known size and a scroll-free chart
 * beats a responsive one that reflows while a reader is comparing two buckets. */
const PLOT_HEIGHT = 176;

/**
 * **The legend column's width, stated rather than discovered.**
 *
 * `Dialog size="lg"` is `max-w-2xl` — 672 px, about 624 px of content. A legend row is a swatch, a
 * resource NAME and a total, and this product's resources are construction trades: "Structural
 * Steel Erection Crew" is 27 characters, not "Crew A". Left to `auto`, one long name would take
 * half the dialog and squeeze the plot it exists to explain.
 *
 * So the column is fixed and names truncate with the full name kept in `title`. 168 px is ~40 % of
 * the content width at the narrowest realistic dialog, leaving the plot the majority — chosen
 * against a real name rather than a placeholder, because this repository has now been wrong about a
 * width eight consecutive times by reasoning from a short example.
 */
const LEGEND_WIDTH_PX = 168;

export function ResourceStackChart({
  stacked,
  buckets,
}: {
  stacked: StackedSeries;
  buckets: readonly ResourceHistogramBucket[];
}): React.ReactElement {
  const { segments, bucketTotals, peak } = stacked;
  const offsets = stackOffsets(stacked, buckets.length);
  // A zero peak would divide by zero; an empty plan is handled by the caller, but a plan whose every
  // value is 0 is a real state (assignments with no budgeted units) and must not produce NaN heights.
  const scale = peak > 0 ? PLOT_HEIGHT / peak : 0;

  return (
    <div className="flex items-start gap-4">
      <ul
        aria-label="Legend"
        className="flex shrink-0 flex-col gap-1 text-sm"
        style={{ width: `${String(LEGEND_WIDTH_PX)}px` }}
      >
        {segments.map((seg) => (
          <li key={seg.resourceId ?? '__other'} className="flex items-baseline gap-2">
            <span
              aria-hidden="true"
              className="mt-1 inline-block size-3 shrink-0 rounded-xs"
              style={{ background: seg.fill }}
            />
            <span className="min-w-0 flex-1 truncate" title={seg.label}>
              {seg.label}
            </span>
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {formatUnits(seg.total)}
            </span>
          </li>
        ))}
      </ul>

      {/* The plot. `aria-hidden` — the table below carries every number this draws. */}
      <div
        aria-hidden="true"
        className="border-border flex min-w-0 flex-1 items-end gap-px border-b"
        style={{ height: `${String(PLOT_HEIGHT)}px` }}
      >
        {buckets.map((bucket, b) => (
          <div
            key={bucket.start}
            className="relative flex-1"
            style={{ height: `${String((bucketTotals[b] ?? 0) * scale)}px` }}
          >
            {segments.map((seg, s) => {
              const value = seg.values[b] ?? 0;
              if (value <= 0) return null;
              return (
                <span
                  key={seg.resourceId ?? '__other'}
                  className="absolute inset-x-0"
                  style={{
                    background: seg.fill,
                    height: `${String(value * scale)}px`,
                    bottom: `${String((offsets[b]?.[s] ?? 0) * scale)}px`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
