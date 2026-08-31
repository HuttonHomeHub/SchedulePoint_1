import type { HistogramGranularity } from '@repo/types';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  BucketSizeSelect,
  ResourceLoadingTable,
  useResourceHistogram,
  useResources,
} from '@/features/resources';
import { StackByControl } from '@/features/resources/components/StackByControl';
import { type StackBy, groupSeries, stackSeries } from '@/features/resources/model/stack-series';
import { RESOURCE_STRIP_HEIGHT } from '@/features/tsld/components/TsldCanvas';
import { resolveResourceStripPalette } from '@/features/tsld/render/palette';
import {
  projectBucketDays,
  seriesMax,
  type ResourceStripSnapshot,
} from '@/features/tsld/render/resource-strip';

/**
 * The picker's stacked-default value. Deliberately not a resourceId and deliberately not `''` — an
 * empty string is what a native `<select>` shows for "no match", so it would be indistinguishable
 * from a broken binding.
 */
const ALL_RESOURCES = '__all__';

/** Gap (px) between the DOM chrome panel's bottom edge and the reserved canvas strip band, so the
 * always-visible controls sit clear ABOVE the demand-bar band rather than covering it (UX review B4). */
const STRIP_PANEL_BOTTOM_GAP = 8;

/**
 * The DOM **chrome** host for the Stage-E canvas resource strip (ADR-0049 §4/§5, behind
 * `VITE_CANVAS_RESOURCE_VIEW`). The demand **bars** are painted on the canvas sibling layer inside
 * `TsldCanvas`; this component owns everything DOM: the `useResourceHistogram` / `useResources` queries,
 * a single-select **resource picker**, the reused **bucket-size `Select`**, the reused accessible
 * **`<table>`** (the WCAG 2.2 AA equivalent of the aria-hidden canvas bars), and the loading / empty /
 * error states (the shipped modal's exact copy). It **publishes** an immutable `stripRef` snapshot —
 * the selected series + its bucket axis pre-projected to day offsets + the whole-series max — into the
 * canvas via {@link onSnapshot}; a picker/bucket change re-publishes (which sets the canvas's
 * `stripDirtyRef`, repainting ONLY the strip, never the main scene).
 *
 * It is a distinctly-labelled `<section aria-label="Resource loading">` — a landmark name distinct from
 * the "Activities panel" — and moves focus into itself on reveal (mirroring `ActivityBottomPanel`).
 */
export function ResourceStripPanel({
  orgSlug,
  planId,
  dataDate,
  onSnapshot,
  focusOnMount = false,
}: {
  orgSlug: string;
  planId: string;
  /** The plan's data date (`plannedStart`) — day 0 for the strip's shared time axis. Non-null (the
   * workspace mounts this only once the plan has a computed diagram). */
  dataDate: string;
  /** Publish the strip snapshot (or `null` when there's nothing to draw) into `TsldCanvas`. Stable. */
  onSnapshot: (snapshot: ResourceStripSnapshot | null) => void;
  /** After a user *reveal*, move focus into the panel so a keyboard/AT user isn't dropped to `<body>`
   * (mirrors `ActivityBottomPanel`'s focus-on-expand). */
  focusOnMount?: boolean;
}): React.ReactElement {
  const [granularity, setGranularity] = useState<HistogramGranularity>('WEEK');
  const histogram = useResourceHistogram(orgSlug, planId, granularity);
  const resources = useResources(orgSlug);
  const bucketSizeId = useId();
  const stackById = useId();
  const [stackBy, setStackBy] = useState<StackBy>('resource');
  const resourcePickerId = useId();

  const nameById = useMemo(
    () => new Map((resources.data ?? []).map((r) => [r.id, r.name])),
    [resources.data],
  );
  const resourceName = (id: string): string => nameById.get(id) ?? 'Unknown resource';
  const parentById = useMemo(
    () => new Map((resources.data ?? []).map((r) => [r.id, r.parentId])),
    [resources.data],
  );
  const parentOf = (id: string): string | null => parentById.get(id) ?? null;
  /** Grouping is offered only when a group exists — otherwise the control would do nothing. */
  const groupsExist = (resources.data ?? []).some((r) => r.parentId !== null);

  const series = histogram.data?.series ?? [];
  // Canvas 2D `fillStyle` cannot take a `var()`, so the strip's fills are resolved here — off the
  // canvas surface element, which is what ADR-0102 established the painter must read from.
  const stripPalette = useMemo(
    () => resolveResourceStripPalette(document.documentElement),
    // Re-resolved on the shared theme bump, exactly as `TsldCanvas` does for the scene.
    [],
  );
  const buckets = histogram.data?.buckets ?? [];

  // **The most-loaded-resource default is gone, deliberately.** The picker now opens on the stacked
  // view, which shows every resource including the most-loaded one — so a default that silently
  // isolated the biggest trade was answering a question the stack answers better. Isolation is still
  // one click, and is now a choice rather than a starting position.
  const [picked, setPicked] = useState<string | null>(null);
  /**
   * **The stacked default is a sentinel, not a resourceId — and everything below must know that.**
   *
   * `selectedSeries` resolves BY resourceId, so a sentinel yields `null`. Every consumer that used
   * to assume "there is always exactly one selected series" has to branch, and the accessible table
   * is the one that matters: it rendered inside `{selectedSeries ? … : null}`, so the sentinel would
   * have deleted the strip's text equivalent entirely, beside a disclosure announcing the
   * `resourceName` fallback — "Show data table for Unknown resource".
   */
  const stackedAll = picked === null || picked === ALL_RESOURCES;
  const selectedId = !stackedAll && series.some((s) => s.resourceId === picked) ? picked : null;
  const selectedSeries = series.find((s) => s.resourceId === selectedId) ?? null;
  /** Every series when stacked; the one picked resource when isolated. Never empty-by-accident. */
  const tableSeries = stackedAll ? series : selectedSeries ? [selectedSeries] : series;

  // Build + publish the immutable snapshot (ADR-0049 §4): the selected series, its bucket axis
  // pre-projected to day offsets (the same `daysBetween` the scene uses), the data date, and the
  // whole-series (viewport-independent) max. `null` when there's nothing to draw (loading / empty).
  /**
   * The stack the canvas paints, and the scale it is measured against.
   *
   * **Isolation publishes a ONE-SEGMENT stack rather than a different shape.** One band painted
   * with `palette.bar` is exactly what the single-series path drew, so isolating a resource is
   * byte-for-byte what it always was — the promise is kept by construction rather than by a branch
   * in the painter.
   *
   * The scale is the peak STACKED total, not the tallest single series (ADR-0049 §6's whole-series
   * max, amended for a stack): otherwise the tallest bucket would overflow the band.
   */
  const stacked = useMemo(() => {
    const neutral = { fill: stripPalette.tick, ink: stripPalette.ground };
    if (stackBy !== 'group') {
      return stackSeries(series, buckets.length, { resourceName, neutral });
    }
    const partitioned = groupSeries(series, buckets.length, parentOf, resourceName);
    return stackSeries(partitioned.series, buckets.length, {
      resourceName: partitioned.nameOf,
      neutral,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `resourceName` closes over a per-render map
  }, [series, buckets.length, stripPalette, stackBy, resources.data]);

  const snapshot = useMemo<ResourceStripSnapshot | null>(() => {
    if (buckets.length === 0) return null;
    const dayOffsets = projectBucketDays(buckets, dataDate);

    if (!stackedAll) {
      if (!selectedSeries) return null;
      const name = nameById.get(selectedSeries.resourceId);
      return {
        segments: [{ values: selectedSeries.values, fill: stripPalette.bar }],
        dayOffsets,
        dataDate,
        max: seriesMax(selectedSeries),
        ...(name ? { resourceName: name } : {}),
      };
    }

    if (stacked.segments.length === 0 || stacked.peak <= 0) return null;
    return {
      segments: stacked.segments.map((seg) => ({ values: seg.values, fill: seg.fill })),
      dayOffsets,
      dataDate,
      max: stacked.peak,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `buckets` derives from histogram.data
  }, [stackedAll, selectedSeries, stacked, histogram.data, dataDate, nameById, stripPalette]);

  useEffect(() => {
    onSnapshot(snapshot);
  }, [snapshot, onSnapshot]);
  // Clear the strip when the panel unmounts (the lens was dismissed), so the canvas holds no stale bars.
  useEffect(() => () => onSnapshot(null), [onSnapshot]);

  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focusOnMount) sectionRef.current?.focus();
  }, [focusOnMount]);

  return (
    <section
      ref={sectionRef}
      // A landmark name distinct from "Activities panel" (ADR-0049 §5). `tabIndex={-1}` makes it a
      // focus target for the reveal without adding a Tab stop.
      aria-label="Resource loading"
      tabIndex={-1}
      // Pinned above the reserved strip band (not to the same bottom edge), so the always-visible chrome
      // never occludes the canvas demand bars + max-tick the band exists to show (UX review B4). The
      // accessible data `<table>` lives inside a COLLAPSED-by-default `<details>` below, so the default
      // chrome is a compact control row; only a user-initiated expand overlays the diagram (like the
      // other floating panels). Focus is moved here programmatically on reveal, so a plain `focus:ring`
      // (not `focus-visible:`) gives a reliably-visible ring (WCAG 2.4.7, a11y review B6).
      style={{ bottom: RESOURCE_STRIP_HEIGHT + STRIP_PANEL_BOTTOM_GAP }}
      className="bg-card/95 border-border focus:ring-ring pointer-events-auto absolute inset-x-2 z-10 max-h-[50%] overflow-auto rounded-md border p-3 shadow-md backdrop-blur outline-none focus:ring-2 focus:ring-offset-2"
    >
      <div className="flex flex-wrap items-end gap-3">
        {series.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={resourcePickerId}>Resource</Label>
            <Select
              id={resourcePickerId}
              value={stackedAll ? ALL_RESOURCES : (selectedId ?? ALL_RESOURCES)}
              onChange={(event) => setPicked(event.target.value)}
              className="w-48"
            >
              <option value={ALL_RESOURCES}>All resources (stacked)</option>
              {series.map((s) => (
                <option key={s.resourceId} value={s.resourceId}>
                  {resourceName(s.resourceId)}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <StackByControl
          id={stackById}
          value={stackBy}
          onChange={setStackBy}
          disabled={!groupsExist}
        />
        <BucketSizeSelect id={bucketSizeId} value={granularity} onChange={setGranularity} />
      </div>

      <div className="mt-3">
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
            No resource loading to show yet — assign resources with budgeted units and recalculate
            the schedule.
          </div>
        ) : (
          // The parallel accessible table is one disclosure away (ADR-0049 §5) — the strip band is thin,
          // so the bars are the glance and the table is the exact-numbers equivalent for AT / keyboard.
          <details>
            {/* The label branches WITH the table. Naming a resource here when the view is stacked
                would announce a name the reader is not looking at — and `resourceName` of a
                sentinel is "Unknown resource", which is worse than saying nothing. */}
            <summary className="text-muted-foreground cursor-pointer text-sm select-none">
              {stackedAll
                ? 'Show data table'
                : `Show data table for ${resourceName(selectedId ?? '')}`}
            </summary>
            <div className="mt-2">
              <ResourceLoadingTable
                buckets={buckets}
                series={tableSeries}
                granularity={granularity}
                resourceName={resourceName}
              />
            </div>
          </details>
        )}
      </div>
    </section>
  );
}
