import { formatLinkGap, linkGapSpan } from './link-gap';
import { formatLag } from './link-marks';
import { plateGlyphBoxes, plateRoom } from './plate-room';
import {
  axisDayOf,
  LABEL_MIN_PX_PER_DAY,
  LABEL_PAD_PX,
  lodTier,
  screenXOfDay,
  type RectCache,
  type RenderActivity,
  type RenderEdge,
  type Viewport,
} from './render-model';
import type { PlateScoring, RouteFrameScene } from './route-frame';
import { allItems, type RowTextLayout, type TextMeasure } from './row-text-layout';
import type { TsldViewToggles } from './view-toggles';

/** The gap a non-driving link waits: its label, and the screen span it waits over. */
export interface LinkGap {
  text: string;
  x0: number;
  x1: number;
}

/**
 * **A link's facts that do not depend on its route** (links-and-labels M2, spec D-5): the gap it
 * waits and its lag plate's text and width. Derived here once, so the router can score whether a
 * lagged link's plate has room **before** it chooses the line, and the painter draws the same
 * plate on the chosen one. The attachment probe builds the same object, so its router copy and the
 * painter's cannot disagree about a plate.
 */
export interface LinkFacts {
  /** Gap labels are on: the working tier or finer, and the `Link gaps` switch (M3-T3). */
  readonly gapsOn: boolean;
  /** Lag plates are on: the detail tier, with labels (spec §4.2 G11). */
  readonly platesOn: boolean;
  readonly gapOf: (edge: RenderEdge, pred: RenderActivity, succ: RenderActivity) => LinkGap | null;
  /** The plate's text, or null where the link draws none. */
  readonly plateTextOf: (edge: RenderEdge, gap: LinkGap | null) => string | null;
  /** A plate's width: its text plus the padding either side. */
  readonly plateWidth: (text: string) => number;
}

export function linkFactsOf(
  scene: Pick<RouteFrameScene, 'dataDate' | 'isWorkingDay'>,
  view: Viewport,
  toggles: TsldViewToggles,
  /** The painter's measure, through its memo; `null` where the context cannot draw text. */
  measure: TextMeasure | null,
): LinkFacts {
  // An activity's axis days, parsed once per frame however many links it ends (the per-frame
  // rect-cache budget gate, `paint.rect-cache-budget.test.ts`, pins that date parsing does not
  // scale with edge count). Called only where both dates are present.
  const axisDays = new Map<string, { start: number; finish: number }>();
  const axisDaysOf = (a: RenderActivity): { start: number; finish: number } => {
    let d = axisDays.get(a.id);
    if (!d) {
      d = {
        start: axisDayOf(a.type, scene.dataDate, a.earlyStart!),
        finish: axisDayOf(a.type, scene.dataDate, a.earlyFinish!),
      };
      axisDays.set(a.id, d);
    }
    return d;
  };
  const gapsOn = toggles.linkSlack !== false && lodTier(view.pxPerDay) !== 'overview' && !!measure;
  // Lag plates at the detail tier only (spec §4.2 G11; `m0-lod.md`: Unit 300 withheld 52 % at 4 px
  // a day and 42 % at 6).
  const platesOn =
    lodTier(view.pxPerDay) === 'detail' &&
    (toggles.labels ?? true) &&
    view.pxPerDay >= LABEL_MIN_PX_PER_DAY &&
    !!measure;
  return {
    gapsOn,
    platesOn,
    // The gap a non-driving link waits, and where (M3-T3). One computation for both, from the
    // relationship's lag anchor to the successor's constrained edge (`linkGapSpan`).
    gapOf: (edge, pred, succ) => {
      if (
        !gapsOn ||
        edge.isDriving ||
        !pred.earlyStart ||
        !pred.earlyFinish ||
        !succ.earlyStart ||
        !succ.earlyFinish
      ) {
        return null;
      }
      const p = axisDaysOf(pred);
      const q = axisDaysOf(succ);
      const span = linkGapSpan(
        {
          type: edge.type,
          predStartDay: p.start,
          predFinishDay: p.finish,
          succStartDay: q.start,
          succFinishDay: q.finish,
          lagDays: edge.lagDays ?? 0,
        },
        scene.isWorkingDay ?? null,
      );
      return span.days > 0
        ? {
            text: formatLinkGap(span),
            x0: screenXOfDay(span.fromDay, view),
            x1: screenXOfDay(span.toDay, view),
          }
        : null;
    },
    // One plate carries both figures where a link has a lag and a gap (spec §4.13 U2).
    plateTextOf: (edge, gap) => {
      const lag = edge.lagDays ?? 0;
      if (!platesOn || lag === 0) return null;
      return gap ? `${formatLag(lag)} · ${gap.text}` : formatLag(lag);
    },
    plateWidth: (text) => measure!(text) + LABEL_PAD_PX * 2,
  };
}

/**
 * The router's plate sub-term input (spec D-5), or null where plates are not drawn: the refreshed
 * path at the detail tier. The room is the row text's LINE boxes, which the plate layer keeps off,
 * and the glyph boxes.
 */
export function plateScoringOf(
  facts: LinkFacts,
  scene: Pick<RouteFrameScene, 'activities' | 'dataDate' | 'visualRefresh'>,
  view: Viewport,
  visibleIds: ReadonlySet<string>,
  byId: ReadonlyMap<string, RenderActivity>,
  rectCache: RectCache,
  textLayout: RowTextLayout,
): PlateScoring | null {
  if (scene.visualRefresh !== true || !facts.platesOn) return null;
  return {
    room: plateRoom(
      allItems(textLayout).map((item) => item.line),
      plateGlyphBoxes(scene.activities, visibleIds, view, scene.dataDate, rectCache),
    ),
    widthOf: (edge) => {
      const pred = byId.get(edge.predecessorId);
      const succ = byId.get(edge.successorId);
      if (!pred || !succ) return null;
      const text = facts.plateTextOf(edge, facts.gapOf(edge, pred, succ));
      return text === null ? null : facts.plateWidth(text);
    },
  };
}
