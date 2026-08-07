import type { ActivitySummary, DependencySummary } from '@repo/types';
import { useCallback } from 'react';

import { buildExportViewport, EXPORT_TOP_BAND, type ExportExtent } from '../../export/export-image';
import { renderExportImage } from '../../export/render-export-image';
import type { TsldViewToggles } from '../../render/paint';
import { resolvePrintPalette, resolvePrintWbsBandPalette } from '../../render/palette';
import { daysBetween } from '../../render/render-model';
import { barDateSourceFor, toRenderActivities, toRenderEdges } from '../../render/to-render-model';
import { wbsBandBars } from '../../render/wbs-band';

import type { LoadedPlan } from '@/components/layout/workspace/use-plan-workspace-model';
import { CANVAS_DATA_DATE_ENABLED, WBS_IMPROVEMENTS_ENABLED } from '@/config/env';
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
  todayIso: string;
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
    todayIso,
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
      const scene = {
        activities: renderActivities,
        edges: toRenderEdges(dependencies),
        dataDate,
        view: viewToggles,
        todayOffset: daysBetween(dataDate, todayIso),
        // The data-date line (canvas status & feedback M1) — the SAME composition `TsldCanvas`
        // makes, because the export builds its own scene rather than reusing the live one: without
        // this line the exported picture would silently disagree with the screen about the one
        // status mark the epic exists to draw. Flag-off the field is false ⇒ the layer never runs
        // ⇒ the export is byte-for-byte the prior picture.
        dataDateLine: CANVAS_DATA_DATE_ENABLED && (viewToggles.dataDate ?? true),
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
        palette: resolvePrintPalette(),
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
                palette: resolvePrintWbsBandPalette(),
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
      activities,
      dependencies,
      viewToggles,
      todayIso,
      lateOverlayActive,
      canvasControlRef,
    ],
  );
}
