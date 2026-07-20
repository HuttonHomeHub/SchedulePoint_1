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
import {
  projectBucketDays,
  seriesMax,
  type ResourceStripSnapshot,
} from '@/features/tsld/render/resource-strip';

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
  const resourcePickerId = useId();

  const nameById = useMemo(
    () => new Map((resources.data ?? []).map((r) => [r.id, r.name])),
    [resources.data],
  );
  const resourceName = (id: string): string => nameById.get(id) ?? 'Unknown resource';

  const series = histogram.data?.series ?? [];
  const buckets = histogram.data?.buckets ?? [];

  // Default the picker to the **most-loaded** series (highest total), so the strip opens on the resource
  // that matters most; fall back to the first. Recomputed only when the series set changes.
  const defaultResourceId = useMemo(() => {
    if (series.length === 0) return null;
    return [...series].sort((a, b) => b.total - a.total)[0]!.resourceId;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `series` derives from histogram.data
  }, [histogram.data]);
  const [picked, setPicked] = useState<string | null>(null);
  // The effective selection: the user's pick if it's still in the current series, else the default.
  const selectedId =
    picked && series.some((s) => s.resourceId === picked) ? picked : defaultResourceId;
  const selectedSeries = series.find((s) => s.resourceId === selectedId) ?? null;

  // Build + publish the immutable snapshot (ADR-0049 §4): the selected series, its bucket axis
  // pre-projected to day offsets (the same `daysBetween` the scene uses), the data date, and the
  // whole-series (viewport-independent) max. `null` when there's nothing to draw (loading / empty).
  const snapshot = useMemo<ResourceStripSnapshot | null>(() => {
    if (!selectedSeries || buckets.length === 0) return null;
    const name = nameById.get(selectedSeries.resourceId);
    return {
      series: selectedSeries,
      dayOffsets: projectBucketDays(buckets, dataDate),
      dataDate,
      max: seriesMax(selectedSeries),
      ...(name ? { resourceName: name } : {}),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `buckets` derives from histogram.data
  }, [selectedSeries, histogram.data, dataDate, nameById]);

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
      className="bg-card/95 border-border pointer-events-auto absolute inset-x-2 bottom-2 z-10 max-h-[60%] overflow-auto rounded-md border p-3 shadow-md backdrop-blur outline-none"
    >
      <div className="flex flex-wrap items-end gap-3">
        {series.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={resourcePickerId}>Resource</Label>
            <Select
              id={resourcePickerId}
              value={selectedId ?? ''}
              onChange={(event) => setPicked(event.target.value)}
              className="w-48"
            >
              {series.map((s) => (
                <option key={s.resourceId} value={s.resourceId}>
                  {resourceName(s.resourceId)}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
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
            <summary className="text-muted-foreground cursor-pointer text-sm select-none">
              Show data table for {resourceName(selectedId ?? '')}
            </summary>
            <div className="mt-2">
              {selectedSeries ? (
                <ResourceLoadingTable
                  buckets={buckets}
                  series={[selectedSeries]}
                  granularity={granularity}
                  resourceName={resourceName}
                />
              ) : null}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}
