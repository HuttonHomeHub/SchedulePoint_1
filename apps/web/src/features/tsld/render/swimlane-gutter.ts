import { LANE_HEIGHT, screenYOfLane, type Size, type Viewport } from './geometry';
import type { SwimlaneExtent } from './project-swimlanes';

/**
 * **The swimlane gutter: what its labels say and where they sit** (swimlanes epic M2-T3;
 * `docs/specs/swimlanes/ui-architecture.md` C3, C4, C12).
 *
 * The labels are DOM text, because they are chrome a reader reads (WCAG 1.4.5) — the same split as
 * ADR-0106 D1: the boundary is a scene mark, its name is chrome. This module is the one derivation
 * of *which* names appear, in what order, in which boxes and with which counts. The DOM gutter and
 * the export's painted mirror both call {@link swimlaneGutterModel}; they may break a long name at
 * different words (CSS against `measureText`), and that is the only freedom either has.
 *
 * Pure, and it imports no feature: the host maps the swimlanes feature's rows onto
 * {@link GutterSwimlane} (ADR-0026 §8).
 *
 * **Dark until the lens exists:** `gutterWidthPx` is 0 everywhere, so nothing here is reached.
 */

/** The expanded gutter's width. Fixed: it has no drag divider (C12), so nothing needs a third. */
export const SWIMLANE_GUTTER_WIDTH_PX = 176;

/** The collapsed strip: a bordered block holding the swimlane's number, and a 24 px target (WCAG 2.5.8). */
export const SWIMLANE_GUTTER_COLLAPSED_PX = 40;

/** A label line, and the gutter's horizontal padding — read by the model and by the DOM, once. */
export const GUTTER_LINE_PX = 16;
export const GUTTER_PAD_PX = 8;

/**
 * The stage the diagram keeps beside an expanded gutter: three minimap widths
 * (`minimapHasRoom`, `viewport-column.ts`), so opening the gutter never withdraws the minimap on a
 * stage that would otherwise have held it. A test pins this to `MINIMAP_BOX.width * 3`.
 */
export const GUTTER_MIN_STAGE_PX = 600;

/** The container width below which the expanded gutter does not fit beside a usable stage. */
export const GUTTER_MIN_CONTAINER_PX = SWIMLANE_GUTTER_WIDTH_PX + GUTTER_MIN_STAGE_PX;

/** Why the gutter's expand control is shaded when {@link gutterHasRoom} is false. */
export const GUTTER_NO_ROOM_REASON = 'Not enough room to widen the swimlane names';

/**
 * Whether the container can hold the EXPANDED gutter beside a usable stage. Measured on the
 * **container**, not the stage, deliberately: the stage is what the gutter's own width changes, so
 * a stage-based test would flip the gutter shut and open on its own width (ADR-0182 — a layout
 * switch decides on the width it has, not on one it creates). An unmeasured container (width ≤ 1)
 * has room, so jsdom and the first frame never withdraw the gutter, as `minimapHasRoom` does.
 */
export function gutterHasRoom(containerWidth: number): boolean {
  return containerWidth <= 1 || containerWidth >= GUTTER_MIN_CONTAINER_PX;
}

/**
 * The width the host reserves: the collapsed strip when the planner collapsed it **or** there is no
 * room for the expanded one. `forcedByRoom` is what shades the expand control with
 * {@link GUTTER_NO_ROOM_REASON}.
 */
export function gutterWidthFor(options: { collapsed: boolean; containerWidth: number }): {
  widthPx: number;
  collapsed: boolean;
  forcedByRoom: boolean;
} {
  const forcedByRoom = !gutterHasRoom(options.containerWidth);
  const collapsed = options.collapsed || forcedByRoom;
  return {
    widthPx: collapsed ? SWIMLANE_GUTTER_COLLAPSED_PX : SWIMLANE_GUTTER_WIDTH_PX,
    collapsed,
    forcedByRoom,
  };
}

/** One swimlane as the gutter needs it: its stack extent plus how many activities it holds. */
export interface GutterSwimlane extends SwimlaneExtent {
  activityCount: number;
}

export interface SwimlaneGutterScene {
  /** Top to bottom, as {@link SwimlaneProjection.extents} states them. */
  swimlanes: readonly GutterSwimlane[];
  /** The width the gutter is drawn at ({@link gutterWidthFor}). */
  widthPx: number;
  collapsed: boolean;
}

export interface GutterLabel {
  /** The swimlane id, or `'none'` for "No swimlane". Stable across frames. */
  key: string;
  id: string | null;
  /** Index in the stack, 0-based. */
  index: number;
  /** 1-based; "No swimlane" takes the last number, so the strip has something to show for it. */
  position: number;
  /** The visible text: the name, or the number on the collapsed strip. */
  text: string;
  /** The full name, whatever the strip shows. */
  name: string;
  activityCount: number;
  laneCount: number;
  /** "Mechanical, swimlane 2 of 5, 14 activities, 3 lanes" — begins with the visible text (2.5.3). */
  accessibleName: string;
  /** The name needs more lines than the swimlane is tall, so it ends in an ellipsis. */
  cut: boolean;
  /** Lines the swimlane's height allows; the DOM clamps to this. */
  maxLines: number;
  /** In view at all. A label outside the viewport is hidden, not clamped to an edge. */
  visible: boolean;
  /**
   * The label's box in scene-canvas y: the swimlane's block clipped to the viewport. The text starts
   * at the box's top, which is what makes it **sticky** to the top of the swimlane's visible part.
   */
  top: number;
  height: number;
  /** The unclipped block, for a painter that wants the border. */
  blockTop: number;
  blockHeight: number;
}

const NO_SWIMLANE_NAME = 'No swimlane';

function activities(n: number): string {
  return n === 1 ? '1 activity' : `${String(n)} activities`;
}

function lanes(n: number): string {
  return n === 1 ? '1 lane' : `${String(n)} lanes`;
}

/**
 * Each swimlane's label for one frame. `size.height` is the scene canvas's, so `top` is
 * scene-relative and the host places the label column at the scene's origin ({@link sceneOrigin}).
 *
 * `measure` is the text width in px (ADR-0106 `:125-127`); without it a name is estimated at
 * 7 px a character, which is why `cut` is a judgement about layout and not about glyphs.
 */
export function swimlaneGutterModel(
  scene: SwimlaneGutterScene,
  view: Viewport,
  size: Size,
  measure: (text: string) => number = (t) => t.length * 7,
): GutterLabel[] {
  const named = scene.swimlanes.filter((s) => s.id !== null).length;
  const usable = Math.max(1, scene.widthPx - 2 * GUTTER_PAD_PX);
  return scene.swimlanes.map((s, index) => {
    const key = s.id ?? 'none';
    const position = index + 1;
    const name = s.name ?? NO_SWIMLANE_NAME;
    const blockTop = screenYOfLane(s.firstLane, view);
    const blockHeight = s.laneCount * LANE_HEIGHT;
    const top = Math.max(0, blockTop);
    const bottom = Math.min(size.height, blockTop + blockHeight);
    const visible = bottom > top;
    const maxLines = Math.max(1, Math.floor(blockHeight / GUTTER_LINE_PX));
    const lines = Math.max(1, Math.ceil(measure(name) / usable));
    const where = s.id === null ? '' : `, swimlane ${String(position)} of ${String(named)}`;
    return {
      key,
      id: s.id,
      index,
      position,
      text: scene.collapsed ? (s.id === null ? '–' : String(position)) : name,
      name,
      activityCount: s.activityCount,
      laneCount: s.laneCount,
      accessibleName: `${name}${where}, ${activities(s.activityCount)}, ${lanes(s.laneCount)}`,
      cut: !scene.collapsed && lines > maxLines,
      maxLines,
      visible,
      top,
      height: visible ? bottom - top : 0,
      blockTop,
      blockHeight,
    };
  });
}
