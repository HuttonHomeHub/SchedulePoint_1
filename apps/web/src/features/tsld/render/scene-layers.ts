import {
  CANVAS_DATA_DATE_ENABLED,
  CANVAS_DIRECT_MANIPULATION_ENABLED,
  CANVAS_LINK_ROUTING_ENABLED,
  CANVAS_TIME_AXIS_ENABLED,
  CANVAS_VISUAL_LANGUAGE_ENABLED,
} from '@/config/env';
import type { TsldViewToggles } from '@/features/tsld/render/paint';

/**
 * **The flag-derived scene layers, derived once for both the screen and the deliverable.**
 *
 * `docs/TECH_DEBT.md` #164. `TsldCanvas` and the export each hand-composed a scene object, and over
 * nine features the two drifted until the canvas built 25 keys and the export six — so the exported
 * PNG, PDF and printed diagram rendered a picture available nowhere else. The sharpest instance:
 * ADR-0065 exists because a link drawn through an unrelated bar makes the reader disprove a
 * relationship the picture appears to assert, and that was live in the artefact a planner sends to
 * someone who was not in the room.
 *
 * Two hand-written compositions is the cause, so one derivation is the fix. Every flag read here is
 * default-on and, per ADR-0088 D1, unreachable in any published image — which is exactly why the
 * divergence was invisible: nothing could switch a layer off to reveal that one surface had it and
 * the other did not.
 *
 * **Returns a fresh object, so a React caller must memoise it.** `TsldCanvas` keys the scene effect
 * on these values (`:979-998`); an unmemoised object there is a new reference every render, which
 * marks the scene dirty and repaints every render. That would be invisible — ADR-0026 D3's
 * render-count invariant has never been asserted (ADR-0078) — so the frame budget would simply
 * double with nothing failing.
 */
export interface SceneLayers {
  monthBands: boolean;
  gridTiers: boolean;
  timeTrueLinks: boolean;
  visualRefresh: boolean;
  linkRouting: boolean;
  dataDateLine: boolean;
}

export function sceneLayers(view: TsldViewToggles | undefined): SceneLayers {
  return {
    // The flag decides whether the layer exists at all; the reader's `View ▾` preference only
    // narrows the flag-on case. The painter stays flag-free, as every other layer does.
    monthBands: CANVAS_VISUAL_LANGUAGE_ENABLED && (view?.monthBands ?? false),
    gridTiers: CANVAS_TIME_AXIS_ENABLED,
    timeTrueLinks: CANVAS_DIRECT_MANIPULATION_ENABLED,
    visualRefresh: CANVAS_DIRECT_MANIPULATION_ENABLED,
    linkRouting: CANVAS_LINK_ROUTING_ENABLED,
    dataDateLine: CANVAS_DATA_DATE_ENABLED && (view?.dataDate ?? true),
  };
}
