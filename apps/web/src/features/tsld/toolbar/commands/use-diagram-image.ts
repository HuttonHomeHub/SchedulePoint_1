import type { ActivitySummary, DependencySummary } from '@repo/types';
import { useCallback } from 'react';

import { buildExportViewport, EXPORT_TOP_BAND, type ExportExtent } from '../../export/export-image';
import { renderExportImage } from '../../export/render-export-image';
import { useCanvasSurface } from '../../render/canvas-surface';
import type { TsldViewToggles } from '../../render/paint';
import { resolvePrintPalette, resolvePrintWbsBandPalette } from '../../render/palette';
import { daysBetween } from '../../render/render-model';
import { sceneLayers } from '../../render/scene-layers';
import { makeWorkingDayPredicate } from '../../render/time-scale';
import type { WorkingDayCalendar } from '../../render/time-scale';
import { barDateSourceFor, toRenderActivities, toRenderEdges } from '../../render/to-render-model';
import { wbsBandBars } from '../../render/wbs-band';

import type { LoadedPlan } from '@/components/layout/workspace/use-plan-workspace-model';
import { WBS_IMPROVEMENTS_ENABLED } from '@/config/env';
import type { TsldCanvasHandle } from '@/features/tsld/components/TsldCanvas';
import { deriveWbsBandSource } from '@/features/wbs';

/**
 * The shared off-screen Diagram-image build (ADR-0078 S11, `VITE_EXPORT_PRINT`).
 *
 * Extracted from `use-tsld-toolbar-context.tsx` verbatim — the body below is the code that used to
 * sit at the top of that file's ~500-line memo, comments and all. This was the **second and last**
 * of the two `canvasControlRef` readers `docs/TECH_DEBT.md` #85 named, and lifting it out is what
 * lets the register's second `eslint-disable-next-line react-hooks/refs` be deleted: #85's own
 * instruction was _"the fix is to split this memo, not to move the ref reads"_, and the absence of
 * the suppression here is the binary test that the split is what happened.
 *
 * The ref is still read inside a **callback** — it runs when an export command is invoked, never
 * during render — which is what the rule was protecting all along. What changed is the compiler's
 * ability to see that, not the code's behaviour.
 */
export function useDiagramImage(args: {
  plan: LoadedPlan;
  activities: readonly ActivitySummary[];
  dependencies: readonly DependencySummary[];
  viewToggles: TsldViewToggles;
  /**
   * The plan's working-day calendar. Taken as an argument rather than resolved here so it is the
   * SAME object the live canvas shades from — and the predicate is built below from it and from
   * this scene's own `dataDate`, so the two can never be a mismatched pair. `makeWorkingDayPredicate`
   * is day-OFFSET based: hand it a different data date from the one the scene is framed on and the
   * shading slides by that many days, silently and only in the deliverable.
   */
  tsldCalendar: WorkingDayCalendar | null;
  todayIso: string;
  /**
   * The viewer-local time-of-day fraction for the Today marker, **from the workspace model** —
   * never re-derived here, for two reasons the first draft of this file got wrong both of.
   *
   * The model derives it from the SAME `new Date()` as `todayIso` (`use-plan-workspace-model.ts`),
   * so the integer offset and the fraction cannot disagree; deriving it from a fresh `Date.now()`
   * against a `useNow`-ticked `todayIso` puts the line a full day out across local midnight. And
   * the model gates it on `CANVAS_TIME_AXIS_ENABLED`, so a hand-rolled call draws a fractional
   * line and a Today pill in the deliverable while the screen draws a plain integer marker —
   * which is this milestone's own defect, inverted.
   */
  todayFraction: number | undefined;
  lateOverlayActive: boolean;
  canvasControlRef: React.RefObject<TsldCanvasHandle | null>;
}): (extent: ExportExtent) => {
  promise: Promise<{ blob: Blob; scaledToFit: boolean }>;
  imageWidth: number;
  imageHeight: number;
} | null {
  const {
    plan,
    activities,
    dependencies,
    viewToggles,
    tsldCalendar,
    todayIso,
    todayFraction,
    lateOverlayActive,
    canvasControlRef,
  } = args;

  // Shared off-screen Diagram-image build (M2/M3): frame an OFF-SCREEN canvas to the requested extent
  // (whole / current view), paint it with the shipped `paintScene` + the light print palette, and
  // resolve the PNG blob. Both PNG (download) and PDF (embed via lazy jsPDF) reuse this exact path, so
  // the render logic isn't duplicated (DRY) and the live canvas is never touched (we only READ its
  // viewport). Returns `null` when there's nothing to frame yet (no data date / no live viewport);
  // `hasDiagram` gates the menu, so that's a defensive guard. `imageWidth`/`imageHeight` are the raster
  // pixel dims (aspect ratio) the PDF page-fit needs.
  //
  // **The export path reads the diagram's scope too** (ADR-0097 Landing E), and it is the site the
  // migration named as the one that gets forgotten: it is off the render path, so no screen shows
  // it wrong. A miss here paints page colours into a delivered PDF, where nobody is watching a
  // screen to notice — and `resolvePrintPalette`'s own docblock promises a printed diagram "cannot
  // drift from the one on screen".
  const canvasSurface = useCanvasSurface();
  return useCallback(
    (extent: ExportExtent) => {
      const dataDate = plan.plannedStart;
      const live = canvasControlRef.current?.getViewport();
      if (dataDate === null || !live) return null;
      const source = barDateSourceFor(plan.schedulingMode, lateOverlayActive);
      // The band comes from the SAME derivation the live canvas uses (ADR-0063 §M5), so the export
      // cannot disagree with the screen about the band's height or about which activities the
      // scene still paints. With the band on, summaries live in the band and not in the diagram —
      // exactly as they do on screen.
      const band = deriveWbsBandSource(activities, {
        enabled: WBS_IMPROVEMENTS_ENABLED,
        toggleOn: viewToggles.wbsBand ?? false,
        source,
      });
      const renderActivities = toRenderActivities(band.sceneActivities, source);
      const layers = sceneLayers(viewToggles);
      const scene = {
        activities: renderActivities,
        edges: toRenderEdges(dependencies),
        dataDate,
        view: viewToggles,
        todayOffset: daysBetween(dataDate, todayIso),
        // **The fractional Today marker and its pill** (ADR-0056 M4, default-on since
        // 2026-07-27). The export drew a whole-day line and no pill at all, because `paint.ts`
        // gates the pill on this key being non-null — so the deliverable disagreed with the
        // screen about the one mark that says "you are here", unreported. `todayIso` is the
        // generation instant the title band already prints, so the picture and its caption
        // cannot name two different moments.
        todayFraction,
        // **Weekend and non-working shading** (ADR-0056 F7a). Absent, the deliverable showed a
        // programme with no weekends — established by sampling the exported PNG, where every
        // pixel outside a gridline or a bar came out pure white.
        isWorkingDay: tsldCalendar ? makeWorkingDayPredicate(dataDate, tsldCalendar) : undefined,
        // **The flag-derived layers, from the one derivation `TsldCanvas` uses.** Two
        // hand-written compositions is how six of these went missing; `scene-parity.structural`
        // asserts the two rosters against each other so a seventh cannot.
        //
        // Written as explicit keys rather than a spread of `layers`, and not for style: the parity
        // gate reads these files as text, so a spread would contribute keys it cannot see and the
        // gate would go quietly blind on exactly the composition it exists to watch. It refuses on
        // an unresolvable spread for that reason, and this shape keeps it honest.
        monthBands: layers.monthBands,
        gridTiers: layers.gridTiers,
        timeTrueLinks: layers.timeTrueLinks,
        visualRefresh: layers.visualRefresh,
        linkRouting: layers.linkRouting,
        dataDateLine: layers.dataDateLine,
      };
      const { viewport, size, dpr, scaledToFit } = buildExportViewport(renderActivities, dataDate, {
        extent,
        liveViewport: live,
        dpr: globalThis.devicePixelRatio || 1,
        topBand: EXPORT_TOP_BAND,
        wbsBandHeight: band.height,
      });
      const promise = renderExportImage({
        scene,
        viewport,
        size,
        dpr,
        topBand: EXPORT_TOP_BAND,
        palette: resolvePrintPalette(canvasSurface),
        scaledToFit,
        meta: { planName: plan.name, dataDate, generatedAtIso: todayIso },
        // Placed against the EXPORT viewport, by the same `wbsBandBars` the live canvas calls with
        // the live one — so the band's columns line up with the diagram's in the picture for the
        // same reason they do on screen, not by a second calculation that agrees.
        ...(band.groups && band.height > 0
          ? {
              wbsBand: {
                height: band.height,
                bars: wbsBandBars(band.groups, dataDate, viewport, {
                  width: size.width,
                  height: band.height,
                }),
                palette: resolvePrintWbsBandPalette(canvasSurface),
              },
            }
          : {}),
      }).then((blob) => ({ blob, scaledToFit }));
      return {
        promise,
        imageWidth: Math.max(1, Math.round(size.width * dpr)),
        imageHeight: Math.max(1, Math.round(size.height * dpr)),
      };
    },
    [
      plan.plannedStart,
      plan.schedulingMode,
      plan.name,
      // The calendar the shading is built from. Omitting it would close over a stale one, so a
      // planner who changed the plan's calendar and exported without a remount would get a
      // picture shaded to the previous week — silently, and only in the deliverable.
      tsldCalendar,
      todayFraction,
      activities,
      dependencies,
      viewToggles,
      todayIso,
      lateOverlayActive,
      canvasControlRef,
      // **Not optional, and the lint warning that asked for it was right** (ADR-0097 Landing E).
      // Omitted, this callback closes over the element from the render that created it — which is
      // the FIRST render, before the diagram's `<Surface>` has mounted and therefore
      // `document.documentElement`. The export would then paint page colours forever while every
      // screen looked correct, which is precisely the failure this landing exists to remove,
      // reintroduced by a dependency array.
      canvasSurface,
    ],
  );
}
