import { screenXOfDay, type Size, type Viewport } from './geometry';

/**
 * **The axis-marker model** (`docs/specs/canvas-axis-markers/`, `docs/TECH_DEBT.md` #148) — one
 * pure decision about the TSLD's two persistent date marks: where each rule is, whether the two
 * coincide, whether their labels would collide, and which label survives.
 *
 * No `ctx`, no DOM, no React. The painter strokes {@link AxisMarkerModel.lines}; the ruler's DOM
 * marker layer renders {@link AxisMarkerModel.marks}.
 *
 * **Why this module exists, and it is not tidiness.** Before it, `todayMerged` was computed inside
 * the Today **line** branch (`paint.ts:1355`) and read by the Data date **pill** block (`:1395`) —
 * one closure variable holding one decision. The moment the labels leave the painter and the rules
 * stay, that decision has two homes, and two implementations of "do these coincide?" drift
 * **invisibly**: each looks right alone, and only a reader who counted the rules and then read the
 * label text would ever see one is a version behind. That is the ADR-0065 `routeOrthogonal`
 * argument verbatim, which is why there is one function here and not a second one for the DOM.
 *
 * **The order is load-bearing and both other orderings are traps.**
 *
 * 1. **cull** — an off-screen rule has no mark at all. Clamping first would leave a marker at the
 *    edge pointing at a day that is not on screen.
 * 2. **clamp** — a mark whose centre is near an edge is pushed inside the surface. Two rules 400 px
 *    apart both land on the same edge at a narrow viewport, so overlap must be tested on the
 *    **clamped** positions.
 * 3. **coincidence** — the two rules round to the same pixel, so drawing both would overdraw one
 *    line with the other. Exactly one line draws, in the data-date treatment, and its label merges.
 * 4. **overlap** — the two are distinct but their labels would collide.
 *
 * **The calm-band invariant, enforced by this signature.** {@link axisMarkers} takes **no pointer
 * argument**. The persistent row is a function of `(viewport, scene)` only; the transient cursor row
 * is a function of the pointer only. The input sets are disjoint, so "a persistent label jumped when
 * I moved the mouse" is impossible by construction rather than by care — and a future edit cannot
 * make one depend on the other without changing a signature a reviewer will see
 * (ADR-0089 D1's "the compiler is the enforcement"; `axis-markers.structural.test.ts` is the weaker
 * instrument on top, and its blind spot is stated there).
 */

/** Which of the two persistent marks a line or a mark is. */
export type AxisMarkerKind = 'dataDate' | 'today';

/** A vertical rule the painter strokes across the whole scene. */
export interface AxisMarkerLine {
  kind: AxisMarkerKind;
  /** Screen x, already `Math.round(...) + 0.5` for a crisp stroke. */
  x: number;
}

/** A label the ruler's marker layer renders, adjacent to the rule it names. */
export interface AxisMarkerMark {
  kind: AxisMarkerKind;
  /** Screen x of the rule this mark names — the anchor the label is centred on before clamping. */
  x: number;
  /** The sentence the mark states. */
  label: string;
  /**
   * The mark's measured width, and its clamped left edge — present only when a `measure` function
   * was supplied. Absent means the caller asked for the model without measuring, and is responsible
   * for placing the mark itself with {@link clampMarkLeft}.
   */
  width?: number;
  left?: number;
}

export interface AxisMarkerModel {
  lines: AxisMarkerLine[];
  marks: AxisMarkerMark[];
  /**
   * True when the two rules rounded onto the same pixel this frame. Exposed so the painter and the
   * marker layer read ONE answer rather than each computing their own — the whole reason this
   * module exists.
   */
  merged: boolean;
}

/** The scene facts the two persistent marks are derived from. Deliberately a narrow shape. */
export interface AxisMarkerScene {
  /** `true` when the data-date rule is on (`TsldScene.dataDateLine`). */
  dataDateLine?: boolean | undefined;
  /** Today's day offset from the data date, or absent when today is not resolvable. */
  todayOffset?: number | null | undefined;
  /** The viewer-local time-of-day fraction added to `todayOffset` (ADR-0056 F6a). */
  todayFraction?: number | null | undefined;
  /** The `View ▾ ▸ Today` toggle. */
  todayToggle: boolean;
}

/**
 * How close two marks' **centres** may be before their labels collide, in pixels — the fallback
 * rule used when no `measure` function is supplied.
 *
 * Measured, not estimated: `Today` renders 37.8 px and `Data date` 60.6 px at the painter's font
 * and 41.1 / 62.6 in the ruler, so half their combined width is 48–52 px
 * (`docs/specs/canvas-axis-markers/m0-measurements.md` M0-T1, cross-checked against the painted
 * pixels in M0-T2 to within a pixel). The larger of the two is used, because a mark withheld one
 * pixel too eagerly is invisible while a mark that overlaps is a defect somebody can see.
 */
export const MARK_MIN_CENTRE_SEPARATION_PX = 52;

/**
 * Where a mark of `width` naming a rule at `x` sits, so it never leaves the surface. The painter's
 * pills have always used exactly this expression; it is named here so the canvas and the DOM cannot
 * clamp differently.
 */
export function clampMarkLeft(x: number, width: number, surfaceWidth: number): number {
  return Math.max(0, Math.min(x - width / 2, surfaceWidth - width));
}

/**
 * The persistent marks for one frame.
 *
 * `measure` turns a label into its rendered width — `ctx.measureText` on the canvas,
 * `getBoundingClientRect` in the DOM. **Supply it and the overlap test runs on the CLAMPED
 * positions**, which is trap T2 and is not hypothetical: at a narrow surface two rules 90 px apart
 * both get pushed inward and their 60 px labels overlap, while their anchors are comfortably
 * separated. Omit it and the model returns lines, `merged` and unplaced marks — which is all the
 * painter needs, since it draws no labels.
 *
 * When the two are distinct but too close for both labels, **`Data date` keeps its label and
 * `Today`'s is withheld** — never the reverse. Measured (M0-T2): they collide only within 0.5 days
 * at the Day preset and 1.1 at Week, i.e. effectively only when they are the same day, which the
 * coincidence step already merges; the window widens to 13.5 days at Quarter and 40.5 at Year,
 * where the two marks are visually one position anyway. Today keeps its **dashed rule**, a
 * documented unmistakable channel in its own right (`docs/DESIGN_SYSTEM.md`) named in both legends —
 * whereas the data date is the schedule's own pivot and has no second channel.
 */
/**
 * Do the two marks' labels collide? On the **placed boxes** when both were measured, and otherwise
 * on the anchors against {@link MARK_MIN_CENTRE_SEPARATION_PX} — which is the same answer at every
 * width where the clamp is inert, i.e. everywhere but the narrow edge case the measured branch
 * exists for.
 */
function collides(
  dataMark: AxisMarkerMark | null,
  todayMark: AxisMarkerMark,
  dataDateX: number | null,
  todayX: number,
): boolean {
  if (dataMark === null || dataDateX === null) return false;
  const a = dataMark.left;
  const aw = dataMark.width;
  const b = todayMark.left;
  const bw = todayMark.width;
  if (a !== undefined && aw !== undefined && b !== undefined && bw !== undefined) {
    return a < b + bw && b < a + aw;
  }
  return Math.abs(todayX - dataDateX) < MARK_MIN_CENTRE_SEPARATION_PX;
}

export function axisMarkers(
  view: Viewport,
  size: Size,
  scene: AxisMarkerScene,
  measure?: (label: string) => number,
): AxisMarkerModel {
  // 1. cull — day 0 IS the data date (`screenXOfDay(0, view) === view.originX`), so the rule needs
  //    no new geometry, and it is culled by the same on-screen test Today uses.
  const dataDateX = ((): number | null => {
    if (scene.dataDateLine !== true) return null;
    const x = Math.round(screenXOfDay(0, view)) + 0.5;
    return x >= 0 && x <= size.width ? x : null;
  })();

  const todayX = ((): number | null => {
    if (!scene.todayToggle || scene.todayOffset == null) return null;
    const x = Math.round(screenXOfDay(scene.todayOffset + (scene.todayFraction ?? 0), view)) + 0.5;
    return x >= 0 && x <= size.width ? x : null;
  })();

  // 2. coincidence, on the culled positions. Rounding both is what the painter has always done.
  const merged =
    dataDateX !== null && todayX !== null && Math.round(todayX) === Math.round(dataDateX);

  const lines: AxisMarkerLine[] = [];
  if (dataDateX !== null) lines.push({ kind: 'dataDate', x: dataDateX });
  // The merged case draws exactly ONE line, in the data-date treatment: two lines at one pixel are
  // a rendering artefact rather than two facts.
  if (todayX !== null && !merged) lines.push({ kind: 'today', x: todayX });

  const place = (kind: AxisMarkerKind, x: number, label: string): AxisMarkerMark => {
    if (!measure) return { kind, x, label };
    const width = measure(label);
    return { kind, x, label, width, left: clampMarkLeft(x, width, size.width) };
  };

  const marks: AxisMarkerMark[] = [];
  const dataMark =
    dataDateX === null
      ? null
      : place('dataDate', dataDateX, merged ? 'Data date · today' : 'Data date');
  if (dataMark) marks.push(dataMark);

  if (todayX !== null && !merged) {
    const todayMark = place('today', todayX, 'Today');
    // 3. clamp, then 4. overlap — in that order. With `measure` the test is on the placed boxes;
    //    without it, on the anchors against the measured separation constant, which is the same
    //    answer at every width where clamping is inert (i.e. everywhere but the narrow edge case).
    if (!collides(dataMark, todayMark, dataDateX, todayX)) marks.push(todayMark);
  }

  return { lines, marks, merged };
}
