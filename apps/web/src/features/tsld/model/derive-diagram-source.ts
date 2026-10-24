import type { ActivitySummary } from '@repo/types';

import {
  projectSwimlanes,
  type SwimlaneInput,
  type SwimlaneProjection,
} from '../render/project-swimlanes';
import type { RenderActivity } from '../render/render-model';
import { toRenderActivities, type BarDateSource } from '../render/to-render-model';

import { deriveWbsBandSource, type WbsBandSource } from '@/features/wbs';

/**
 * **The one place the diagram's input is built** — for the screen (`TsldPanel`) and for the image
 * export (`use-diagram-image`) (swimlanes ui-architecture C7).
 *
 * Both used to chain `deriveWbsBandSource` and `toRenderActivities` by hand. Adding the swimlane
 * projection to both would make two sites that each chain three derivations, which is the drift
 * ADR-0063 §9 exists to prevent: a printed programme that disagrees with the screen about which
 * bar sits in which row, in the one file nobody is watching a screen to check.
 *
 * ## Display lanes are swapped in here, and nowhere else (C6)
 *
 * With swimlanes drawn, the scene's activities are **copies whose `laneIndex` is the display
 * lane**. Everything downstream — lane-overlap flags, the render lane, cull, hit-test, the router,
 * the minimap's marker — already reads that field, so none of it learns swimlanes exist and the
 * render layer stays free of them (ADR-0026 §8). The cost is that `renderActivities` must never be
 * written back: an intent that arrives in display lanes is converted by the host's write path, and
 * `sceneActivities` below is the stored-lane list for anything that packs or writes.
 *
 * Without swimlanes the result is what the two call sites computed before: `renderActivities` is
 * `toRenderActivities(wbsBand.sceneActivities, source)` and nothing more (SC-3).
 */
export interface DiagramSource {
  /**
   * What the scene paints, **in stored lanes**: the plan's activities minus the summaries the
   * pinned band draws. The packing input for Tidy and Re-layout.
   */
  sceneActivities: readonly ActivitySummary[];
  /** What the canvas is handed: {@link sceneActivities} in render shape, in display lanes. */
  renderActivities: RenderActivity[];
  /** The band's groups, or `null` when the band is off (never an empty array). */
  bandGroups: WbsBandSource['groups'];
  /** The band's reserved height in CSS px; `0` when it is off or empty. */
  bandHeight: number;
  /** The projection, or `null` when swimlanes are not drawn: the gutter and the rules read it. */
  swimlaneScene: SwimlaneProjection | null;
}

export function deriveDiagramSource(
  activities: readonly ActivitySummary[],
  options: {
    wbsBand: { enabled: boolean; toggleOn: boolean };
    /** The host's neutral input, or `null`/absent to draw the swimlane-free diagram. */
    swimlanes?: SwimlaneInput | null | undefined;
    source: BarDateSource;
    /** The plan's data date; the projection needs it to measure spans. `null` draws nothing. */
    dataDate: string | null;
  },
): DiagramSource {
  const band = deriveWbsBandSource(activities, {
    enabled: options.wbsBand.enabled,
    toggleOn: options.wbsBand.toggleOn,
    source: options.source,
  });

  const swimlaneScene =
    options.swimlanes && options.dataDate !== null
      ? projectSwimlanes(band.sceneActivities, options.swimlanes, {
          source: options.source,
          dataDate: options.dataDate,
        })
      : null;

  // Projected over the scene's own activities, so the band-lifted summaries are already absent and
  // take no lane; `bandLiftedIds` is only needed by a caller that projects the full list.
  const displayed =
    swimlaneScene === null
      ? band.sceneActivities
      : band.sceneActivities.map((a) => {
          const lane = swimlaneScene.displayLanes.get(a.id);
          return lane === undefined ? a : { ...a, laneIndex: lane };
        });

  return {
    sceneActivities: band.sceneActivities,
    renderActivities: toRenderActivities(displayed, options.source),
    bandGroups: band.groups,
    bandHeight: band.height,
    swimlaneScene,
  };
}
