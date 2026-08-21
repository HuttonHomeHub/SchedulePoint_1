import { X } from 'lucide-react';
import { useMemo } from 'react';

import { screenXOfDay, worldExtent, type RenderActivity } from '../render/geometry';
import { minimapViewport, type MinimapBox, type MinimapMapping } from '../render/minimap';
import { useNow } from '../render/use-now';
import { daysBetween } from '../render/working-time';

import { Button } from '@/components/ui/button';

/**
 * **The minimap panel** (ADR-0100, minimap M2-T2): a fixed 200×120 picture of the whole
 * programme in the canvas container's bottom-right, with the live viewport as a DOM
 * rectangle on top.
 *
 * The split of responsibilities is the design (ADR-0100 decisions 1–2):
 *
 * - The **picture** is an `aria-hidden` canvas the HOST blits into from its existing rAF
 *   loop — rebuilt on scene change only (`minimapDirtyRef`), never per frame, never on
 *   selection, never at midnight. This component never draws it.
 * - The **rectangle** is a DOM node the host moves by one `style.transform` write per
 *   moved frame (no React render — ADR-0026 D3). Read-only in M2; M3 makes it draggable.
 * - The **selection marker** and the **Today vertical** are the two marks whose subjects
 *   move *without* the scene changing, so they are ordinary React-rendered DOM overlays
 *   here: the marker re-renders on the selection change that already re-renders the host,
 *   and Today re-renders on the existing `useNow(60_000)` tick — the ADR-0056 F6a
 *   instrument, so minimap-Today and canvas-Today go stale or stay fresh together.
 *
 * `role="group"` with a name — deliberately NOT `scrollbar`/`slider` (single-axis,
 * single-value contracts; this viewport is 2-D plus zoom) and NOT `application` (appears
 * nowhere in this codebase). The picture canvas is `aria-hidden` like every canvas layer;
 * the panel's operable content in M2 is the close button alone.
 */
export const MINIMAP_BOX: MinimapBox = { width: 200, height: 120 };

export interface TsldMinimapProps {
  activities: readonly RenderActivity[];
  dataDate: string;
  selectedId: string | null;
  /** Offset the panel above the resource strip when it is active — the minimap does NOT
   * inherit the Legend's over-the-strip liberty (M0-T3's recorded policy). */
  bottomOffsetPx: number;
  onClose: () => void;
  /** The host's refs: the picture canvas it blits into, and the rectangle it transforms. */
  bitmapCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  rectRef: React.RefObject<HTMLDivElement | null>;
}

export function TsldMinimap({
  activities,
  dataDate,
  selectedId,
  bottomOffsetPx,
  onClose,
  bitmapCanvasRef,
  rectRef,
}: TsldMinimapProps): React.ReactElement {
  // The mapping for the two React-rendered overlays. Deliberately derived here from the same
  // pure functions the host's bitmap build uses (one derivation each), on the renders those
  // overlays already need — an O(n) fold on an activities/selection change, never per frame.
  const mapping = useMemo<MinimapMapping | null>(() => {
    const extent = worldExtent(activities, dataDate);
    return extent === null ? null : minimapViewport(extent, MINIMAP_BOX);
  }, [activities, dataDate]);

  const selected =
    selectedId === null ? null : (activities.find((a) => a.id === selectedId) ?? null);

  // Today, on the minute tick the canvas's own Today marker uses (ADR-0056 F6b).
  const nowMs = useNow(60_000);
  const todayX = useMemo(() => {
    if (mapping === null) return null;
    const dayFloat = (nowMs - Date.parse(dataDate)) / 86_400_000;
    const x = screenXOfDay(dayFloat, mapping.view);
    return x >= 0 && x <= MINIMAP_BOX.width ? x : null;
  }, [mapping, nowMs, dataDate]);

  const marker = useMemo(() => {
    if (mapping === null || selected === null || selected.earlyStart === null) return null;
    const x0 = screenXOfDay(daysBetween(dataDate, selected.earlyStart), mapping.view);
    const x1 =
      selected.earlyFinish === null
        ? x0
        : screenXOfDay(daysBetween(dataDate, selected.earlyFinish) + 1, mapping.view);
    // ≥3×3px (spec AC-2.3): a 1px echo of the bar is invisible at exactly the moment the
    // marker exists to answer "where is my selection in the whole plan?".
    return {
      x: x0,
      y: selected.laneIndex * mapping.pxPerLane,
      w: Math.max(3, x1 - x0),
      h: Math.max(3, mapping.pxPerLane),
    };
  }, [mapping, selected, dataDate]);

  return (
    <div
      role="group"
      aria-label="Diagram overview"
      data-testid="tsld-minimap"
      className="border-border bg-canvas absolute right-3 z-10 rounded-md border shadow-md"
      style={{ bottom: 12 + bottomOffsetPx }}
    >
      <div className="flex items-center justify-between pl-2">
        <span className="text-muted-foreground text-xs font-medium">Overview</span>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Hide overview"
          className="text-muted-foreground"
          onClick={onClose}
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
      {mapping === null ? (
        // AC-1.4: no computed dates ⇒ say so; never an empty box that reads as breakage.
        <p className="text-muted-foreground px-3 pb-3 text-xs" style={{ width: MINIMAP_BOX.width }}>
          Nothing to show yet — no activity has calculated dates.
        </p>
      ) : (
        <div
          className="relative overflow-hidden"
          style={{ width: MINIMAP_BOX.width, height: MINIMAP_BOX.height }}
        >
          <canvas
            ref={bitmapCanvasRef}
            aria-hidden="true"
            data-testid="tsld-minimap-picture"
            className="block"
            style={{ width: MINIMAP_BOX.width, height: MINIMAP_BOX.height }}
          />
          {/* Selection marker — decoration beside the rectangle, like the picture beneath it. */}
          {marker !== null ? (
            <div
              aria-hidden="true"
              data-testid="tsld-minimap-selection"
              className="pointer-events-none absolute"
              style={{
                left: marker.x,
                top: marker.y,
                width: marker.w,
                height: marker.h,
                background: 'var(--color-canvas-minimap-frame)',
                outline: '1px solid var(--color-canvas-minimap-frame-halo)',
              }}
            />
          ) : null}
          {/* Today vertical — positioned on the same minute tick as the canvas Today marker. */}
          {todayX !== null ? (
            <div
              aria-hidden="true"
              data-testid="tsld-minimap-today"
              className="pointer-events-none absolute inset-y-0"
              style={{ left: todayX, width: 1, background: 'var(--color-destructive)' }}
            />
          ) : null}
          {/* The viewport rectangle: moved by the HOST's frame loop via style.transform. The
              two-tone frame pair is the WCAG 1.4.11 answer measured at M2-T1 — no single
              colour clears the ground and both bar inks, so the stroke holds the dark ground
              and the halo holds the bars. */}
          <div
            ref={rectRef}
            data-testid="tsld-minimap-rect"
            className="pointer-events-none absolute top-0 left-0 will-change-transform"
            style={{
              border: '1px solid var(--color-canvas-minimap-frame)',
              outline: '1px solid var(--color-canvas-minimap-frame-halo)',
              outlineOffset: '-2px',
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}
    </div>
  );
}
