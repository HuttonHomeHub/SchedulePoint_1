import { LANE_HEIGHT, screenYOfLane, type Size, type Viewport } from './geometry';
import type { SwimlaneExtent, SwimlaneProjection } from './project-swimlanes';

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

/**
 * The collapsed strip: a bordered block holding the swimlane's number. 44 px wide so each label is a
 * full touch target under `pointer: coarse` (ADR-0118 D2), and so the 40 px icon button that expands
 * it fits; it is also well over the 24 px minimum of WCAG 2.5.8 for a fine pointer.
 */
export const SWIMLANE_GUTTER_COLLAPSED_PX = 44;

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
export const GUTTER_NO_ROOM_REASON =
  'Not enough room to expand the swimlane names. Widen the window.';

/** Whether a gutter width is the collapsed strip's: the one place that says so, for every caller. */
export function isCollapsedGutterWidth(widthPx: number): boolean {
  return widthPx < SWIMLANE_GUTTER_WIDTH_PX;
}

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
  return gutterWidthForRoom({
    collapsed: options.collapsed,
    room: gutterHasRoom(options.containerWidth),
  });
}

/**
 * {@link gutterWidthFor} for a caller that already holds the room fact rather than a width: the host
 * learns it from the canvas (`onGutterRoomChange`), which measured the container.
 */
export function gutterWidthForRoom(options: { collapsed: boolean; room: boolean }): {
  widthPx: number;
  collapsed: boolean;
  forcedByRoom: boolean;
} {
  const forcedByRoom = !options.room;
  const collapsed = options.collapsed || forcedByRoom;
  return {
    widthPx: collapsed ? SWIMLANE_GUTTER_COLLAPSED_PX : SWIMLANE_GUTTER_WIDTH_PX,
    collapsed,
    forcedByRoom,
  };
}

/**
 * What the gutter's controls do, supplied by the host so this module — and `features/tsld` — imports
 * no other feature (ADR-0026 §8). Every callback is stable for equal inputs: the canvas rewrites the
 * labels whenever the gutter model's identity changes.
 */
export interface GutterActions {
  /** May the caller change swimlanes; when not, why. A shaded control says so rather than vanishing. */
  write: { writable: boolean; reason: string | null };
  /** The corner cell's command: "Set up swimlanes…" or "Swimlanes…". */
  manage: { label: string; onOpen: () => void };
  /** The expand/collapse control. `forcedByRoom` shades it with {@link GUTTER_NO_ROOM_REASON}. */
  collapse: { collapsed: boolean; forcedByRoom: boolean; onToggle: () => void };
  onRename: (swimlaneId: string) => void;
  /** Resolves whether the swimlane actually moved, so the gutter re-arms focus only for a move that landed. */
  onMove: (swimlaneId: string, delta: -1 | 1) => Promise<boolean>;
  onDelete: (swimlaneId: string) => void;
}

/** One swimlane as the gutter needs it: its stack extent plus how many activities it holds. */
export interface GutterSwimlane extends SwimlaneExtent {
  activityCount: number;
}

/**
 * The gutter's swimlanes: the projection's extents, each with how many of the scene's activities it
 * holds. A member whose swimlane is not in `known` is under "No swimlane", the same rule the
 * projection applies, so the count and the stack cannot disagree.
 */
export function gutterSwimlanes(
  extents: readonly SwimlaneExtent[],
  activityIds: readonly string[],
  membership: ReadonlyMap<string, string | null>,
  known: ReadonlySet<string>,
): GutterSwimlane[] {
  const counts = new Map<string | null, number>();
  for (const id of activityIds) {
    const swimlane = membership.get(id) ?? null;
    const key = swimlane !== null && known.has(swimlane) ? swimlane : null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return extents.map((e) => ({ ...e, activityCount: counts.get(e.id) ?? 0 }));
}

export interface SwimlaneGutterScene {
  /** Top to bottom, as {@link SwimlaneProjection.extents} states them. */
  swimlanes: readonly GutterSwimlane[];
  /** The width the gutter is drawn at ({@link gutterWidthFor}). */
  widthPx: number;
  collapsed: boolean;
}

/** What a label says. Changes with the swimlanes or the width, never with a pan. */
export interface GutterLabelText {
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
  /** Lines the swimlane's height allows, net of the label's vertical padding; the DOM clamps to it. */
  maxLines: number;
}

/** Where a label sits this frame. Changes with the lane axis, so it is derived per frame. */
export interface GutterLabelGeometry {
  key: string;
  index: number;
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

export type GutterLabel = GutterLabelText & GutterLabelGeometry;

const NO_SWIMLANE_NAME = 'No swimlane';

function activities(n: number): string {
  return n === 1 ? '1 activity' : `${String(n)} activities`;
}

function lanes(n: number): string {
  return n === 1 ? '1 lane' : `${String(n)} lanes`;
}

/**
 * The static half: text, names, counts and the cut judgement. It reads no viewport, so a host
 * memoises it on the swimlanes and the width and a pan never reaches it.
 *
 * `measure` is the text width in px (ADR-0106 `:125-127`); without it a name is estimated at
 * 7 px a character, which is why `cut` is a judgement about layout and not about glyphs.
 */
export function swimlaneGutterText(
  scene: SwimlaneGutterScene,
  measure: (text: string) => number = (t) => t.length * 7,
): GutterLabelText[] {
  const named = scene.swimlanes.filter((s) => s.id !== null).length;
  const usable = Math.max(1, scene.widthPx - 2 * GUTTER_PAD_PX);
  return scene.swimlanes.map((s, index) => {
    const position = index + 1;
    const name = s.name ?? NO_SWIMLANE_NAME;
    // The label's own padding takes a line's worth off the top of a short block, so a block that is
    // exactly N lines tall holds N - 1 (the clamp would otherwise promise a line it cannot show).
    const maxLines = Math.max(
      1,
      Math.floor((s.laneCount * LANE_HEIGHT - GUTTER_PAD_PX) / GUTTER_LINE_PX),
    );
    const lines = Math.max(1, Math.ceil(measure(name) / usable));
    const where = s.id === null ? '' : `, swimlane ${String(position)} of ${String(named)}`;
    return {
      key: s.id ?? 'none',
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
    };
  });
}

/** The per-frame half: each swimlane's box for this viewport. Nothing here allocates text. */
export function swimlaneGutterGeometry(
  swimlanes: readonly GutterSwimlane[],
  view: Viewport,
  size: Size,
): GutterLabelGeometry[] {
  return swimlanes.map((s, index) => {
    const blockTop = screenYOfLane(s.firstLane, view);
    const blockHeight = s.laneCount * LANE_HEIGHT;
    const top = Math.max(0, blockTop);
    const bottom = Math.min(size.height, blockTop + blockHeight);
    const visible = bottom > top;
    return {
      key: s.id ?? 'none',
      index,
      visible,
      top,
      height: visible ? bottom - top : 0,
      blockTop,
      blockHeight,
    };
  });
}

/**
 * The lane to centre on to bring a swimlane into view, or `null` when any of it already is. A swimlane
 * taller than the viewport is framed by its top, so the label and the first bars it names appear
 * together instead of the middle of a long band. Pure, for the focus-pans-to-swimlane rule (C9).
 */
export function laneToReveal(extent: SwimlaneExtent, view: Viewport, size: Size): number | null {
  const top = screenYOfLane(extent.firstLane, view);
  const bottom = top + extent.laneCount * LANE_HEIGHT;
  if (bottom > 0 && top < size.height) return null;
  const viewLanes = size.height / LANE_HEIGHT;
  // `centerOnWorld` centres lane `n` at `n + 0.5`; this is the centre of the block, or of its top.
  return extent.laneCount <= viewLanes
    ? extent.firstLane + extent.laneCount / 2 - 0.5
    : extent.firstLane + viewLanes / 2 - 0.5;
}

/** Both halves joined, for the export's painted mirror, which wants one frame's whole label. */
export function swimlaneGutterModel(
  scene: SwimlaneGutterScene,
  view: Viewport,
  size: Size,
  measure?: (text: string) => number,
): GutterLabel[] {
  const geometry = swimlaneGutterGeometry(scene.swimlanes, view, size);
  return swimlaneGutterText(scene, measure).map((t, i) => ({ ...t, ...geometry[i]! }));
}

/**
 * The gutter's swimlanes from a projection: each extent plus how many activities sit in it. One pass
 * over the display lanes, so a host and the export count the same way and neither rescans the map
 * per swimlane.
 */
export function gutterSwimlanesFrom(projection: SwimlaneProjection): GutterSwimlane[] {
  const owner: number[] = [];
  projection.extents.forEach((e, index) => {
    for (let lane = e.firstLane; lane < e.firstLane + e.laneCount; lane += 1) owner[lane] = index;
  });
  const counts = projection.extents.map(() => 0);
  for (const lane of projection.displayLanes.values()) {
    const index = owner[lane];
    if (index !== undefined) counts[index] = (counts[index] ?? 0) + 1;
  }
  return projection.extents.map((e, index) => ({ ...e, activityCount: counts[index] ?? 0 }));
}
