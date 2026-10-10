import { rectsIntersect, type Rect } from '../render/geometry';

/**
 * **The geometry of the diagram's bottom-right column** (toolbar-redesign M4, feature-spec §4.7):
 * the Minimap above, the "Diagram viewport" cluster below it, one stack in the stage's corner.
 *
 * Pure and DOM-free so the two rules that depend on it — *is there room for the minimap*, and *how
 * far must a keyboard reveal move a bar so the column is not on top of it* — can be pinned without a
 * browser. The heights are numbers because the stage's own sizing is JS (`measure()` in
 * `TsldCanvas`) and no class can reach it; they are the sum of declared parts, not readings, and
 * `e2e-minimap` asserts the column's measured rect against them at 1024 × 600 on both pointers so a
 * drift between this file and the markup fails a journey rather than a reader.
 */

/** The stage's edge inset: the minimap's `right-3` / `bottom: 12` from before the cluster existed. */
export const COLUMN_INSET_PX = 12;

/** `gap-2` between the minimap and the cluster. */
export const COLUMN_GAP_PX = 8;

/** The minimap's `border` (1 px × 2) and `p-px` (1 px × 2) around its picture. */
const MINIMAP_FRAME_PX = 4;

/**
 * The minimap's title row is a `Button size="icon"`: `size-10` for a mouse, `--control-h` (44) for a
 * finger (`button.tsx`). The cluster's buttons are `toolbarControlVariants`, i.e. `--control-h`
 * alone (36 / 44), so the two heights differ by 4 px on a mouse and agree on touch.
 */
const MINIMAP_TITLE_ROW_PX = { fine: 40, coarse: 44 } as const;
const CLUSTER_CONTROL_PX = { fine: 36, coarse: 44 } as const;

/** The cluster card's `p-1` (4 px × 2) and `border` (1 px × 2). */
const CLUSTER_FRAME_PX = 10;

export function minimapOuterHeight(pictureHeight: number, coarse: boolean): number {
  return pictureHeight + MINIMAP_FRAME_PX + MINIMAP_TITLE_ROW_PX[coarse ? 'coarse' : 'fine'];
}

export function clusterOuterHeight(coarse: boolean): number {
  return CLUSTER_CONTROL_PX[coarse ? 'coarse' : 'fine'] + CLUSTER_FRAME_PX;
}

/**
 * Whether the stage can hold the minimap above the cluster. **Two clauses**, because the first alone
 * let a 1024 × 600 touch stage (274 px, of which the ruler takes 40) draw a column that ran under
 * the ruler (`m0-measurement.md` §7: about 2 px spare before the cluster's card padding, and short of
 * it once counted).
 *
 * - **Width:** three minimap widths, so the panel covers at most a third of the diagram it
 *   summarises (ADR-0100 M4 ux gate) — unchanged.
 * - **Height:** the scene canvas (`stageHeight`, already net of the ruler, the WBS band and the
 *   resource strip) holds the whole column and its bottom inset.
 *
 * An unmeasured stage (width ≤ 1) has room, so jsdom and the first frame never suppress the panel.
 */
export function minimapHasRoom(
  stage: { width: number; height: number },
  box: { width: number; height: number },
  coarse: boolean,
): boolean {
  if (stage.width <= 1) return true;
  if (stage.width < box.width * 3) return false;
  const column =
    minimapOuterHeight(box.height, coarse) + COLUMN_GAP_PX + clusterOuterHeight(coarse);
  return stage.height - COLUMN_INSET_PX >= column;
}

/**
 * The extra pan (on top of the ordinary reveal) that takes a bar clear of the column, or `{0, 0}`.
 *
 * WCAG 2.4.11: a focused bar must not be hidden by author-created content. The ordinary reveal keeps
 * a bar `margin` off the stage's edges, but the column sits inside that rectangle, so a bar revealed
 * into the bottom-right corner lands under it. The column is an obstacle with a `margin` of its own
 * (the same one the edges get, so "clear" means the same distance everywhere), and the bar moves the
 * **shorter** way out of it — left or up — because those are the two directions the corner opens
 * onto. A degenerate obstacle (an unmeasured column) asks for nothing.
 */
export function clearOfObstacle(
  bar: Rect,
  obstacle: Rect,
  margin: number,
): { dx: number; dy: number } {
  if (obstacle.w <= 0 || obstacle.h <= 0) return { dx: 0, dy: 0 };
  // The obstacle plus the reveal margin on every side; the overlap arithmetic is the one shared
  // predicate (`one-intersection-predicate.structural.test.ts`).
  const keepOut: Rect = {
    x: obstacle.x - margin,
    y: obstacle.y - margin,
    w: obstacle.w + 2 * margin,
    h: obstacle.h + 2 * margin,
  };
  if (!rectsIntersect(bar, keepOut)) return { dx: 0, dy: 0 };
  const left = bar.x + bar.w - (obstacle.x - margin);
  const up = bar.y + bar.h - (obstacle.y - margin);
  return left < up ? { dx: -left, dy: 0 } : { dx: 0, dy: -up };
}
