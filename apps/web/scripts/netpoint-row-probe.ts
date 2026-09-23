/**
 * **NetPoint-layout M0-T5 — text collisions and glyph contacts on today's row (FC-N6).**
 *
 * FC-N6 is judged at M1, when the row gains dates under the nodes and a duration · float item under
 * each bar. This reads the same two quantities on the row as it ships, so M1's reading has a
 * denominator rather than an absolute to defend.
 *
 * - **Text collisions (FC-N6a):** every `fillText` the real painter makes, boxed with the recorder's
 *   own `measureText` (the metric the painter placed it against) and the font's px size, aligned by
 *   the `textAlign`/`textBaseline` in force. Two runs collide when their boxes overlap by more than
 *   half a pixel on both axes. Read with the `dates` toggle **off** (today's default) and **on**
 *   (M1's default, spec §4.6), since the dates layer is where the risk is.
 * - **Glyph contacts (FC-N6c):** for each pair of horizontally adjacent bars in one row, do their
 *   terminal glyphs touch? A task bar's glyph is its two node discs (`nodeCentres`, `NODE_RADIUS`),
 *   which reach past its ends; a milestone's is its diamond; an LOE or summary span draws no node
 *   (`paint.ts`: "a span that has one of its own keeps it"), so its glyph is its own rect.
 *
 * {@link collisionControl} is the red control the plan asks for: two labels painted on top of each
 * other must count as one collision, or the counter cannot fail.
 */
import { activityRect, LANE_HEIGHT } from '../src/features/tsld/render/geometry';
import { paintScene, type TsldScene } from '../src/features/tsld/render/paint';
import { barGlyphKind, NODE_RADIUS, type Viewport } from '../src/features/tsld/render/render-model';
import { DEFAULT_VIEW_TOGGLES } from '../src/features/tsld/render/view-toggles';

import { type Layout, PALETTE, type RecordedText, recordingCtx, sceneFor } from './crossing-probe';
import type { unit300Asap } from './lane-travel-probe';

type Asap = ReturnType<typeof unit300Asap>;
const EPS = 0.5;

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export function textBox(t: RecordedText): Box {
  const x0 =
    t.align === 'center'
      ? t.x - t.width / 2
      : t.align === 'right' || t.align === 'end'
        ? t.x - t.width
        : t.x;
  const h = t.fontPx;
  const y0 =
    t.baseline === 'middle'
      ? t.y - h / 2
      : t.baseline === 'top' || t.baseline === 'hanging'
        ? t.y
        : t.y - h;
  return { x0, x1: x0 + t.width, y0, y1: y0 + h };
}

export function countTextCollisions(texts: readonly RecordedText[]): {
  runs: number;
  collisions: number;
  sample: string[];
} {
  const boxes = texts.map((t) => ({ t, b: textBox(t) })).sort((a, b) => a.b.x0 - b.b.x0);
  let collisions = 0;
  const sample: string[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    const a = boxes[i]!.b;
    for (let j = i + 1; j < boxes.length && boxes[j]!.b.x0 < a.x1 - EPS; j += 1) {
      const b = boxes[j]!.b;
      const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (w > EPS && h > EPS) {
        collisions += 1;
        if (sample.length < 5) sample.push(`"${boxes[i]!.t.text}" × "${boxes[j]!.t.text}"`);
      }
    }
  }
  return { runs: texts.length, collisions, sample };
}

function paintTexts(
  scene: TsldScene,
  pxPerDay: number,
  lanes: number,
  maxDay: number,
): RecordedText[] {
  const view: Viewport = { pxPerDay, originX: 40, originY: 32 };
  const size = {
    width: (maxDay + 4) * pxPerDay + 400,
    height: Math.max(lanes, 145) * LANE_HEIGHT + 200 + view.originY,
  };
  const { ctx, texts } = recordingCtx();
  paintScene(ctx as Parameters<typeof paintScene>[0], scene, view, size, PALETTE, 1);
  return texts;
}

export function rowReading(
  asap: Asap,
  layout: Layout,
  pxPerDay: number,
): {
  dates: 'off' | 'on';
  runs: number;
  collisions: number;
  sample: string[];
  adjacentPairs: number;
  glyphContacts: number;
  /** Contacts between two bars joined by a link — the NetPoint chain look, touching on purpose. */
  linkedContacts: number;
}[] {
  const { scene } = sceneFor(asap, layout);
  const maxDay = Math.max(
    ...(asap.activities as { key: string }[]).map((a) => asap.finish.get(a.key) ?? 0),
  );
  const view: Viewport = { pxPerDay, originX: 40, originY: 32 };

  // Glyph contacts: a property of the layout and the zoom, not of the text toggles.
  const linked = new Set(
    scene.edges.flatMap((e) => [
      `${e.predecessorId}|${e.successorId}`,
      `${e.successorId}|${e.predecessorId}`,
    ]),
  );
  const byLane = new Map<number, { id: string; x0: number; x1: number }[]>();
  for (const a of scene.activities) {
    const rect = activityRect(a, view, scene.dataDate);
    if (rect === null) continue;
    const kind = barGlyphKind(a.type);
    const reach = kind === 'bar' ? NODE_RADIUS : 0;
    const extent = { id: a.id, x0: rect.x - reach, x1: rect.x + rect.w + reach };
    const list = byLane.get(a.laneIndex);
    if (list) list.push(extent);
    else byLane.set(a.laneIndex, [extent]);
  }
  let adjacentPairs = 0;
  let glyphContacts = 0;
  let linkedContacts = 0;
  for (const list of byLane.values()) {
    list.sort((a, b) => a.x0 - b.x0);
    for (let i = 0; i + 1 < list.length; i += 1) {
      adjacentPairs += 1;
      if (list[i + 1]!.x0 - list[i]!.x1 < EPS) {
        glyphContacts += 1;
        if (linked.has(`${list[i]!.id}|${list[i + 1]!.id}`)) linkedContacts += 1;
      }
    }
  }

  return (['off', 'on'] as const).map((dates) => {
    const texts = paintTexts(
      { ...scene, view: { ...DEFAULT_VIEW_TOGGLES, dates: dates === 'on' } },
      pxPerDay,
      layout.lanes,
      maxDay,
    );
    return { dates, ...countTextCollisions(texts), adjacentPairs, glyphContacts, linkedContacts };
  });
}

/** Two identical labels at one point must count as exactly one collision; one label as none. */
export function collisionControl(): { one: number; two: number } {
  const t: RecordedText = {
    text: 'A1000',
    x: 100,
    y: 100,
    width: 30,
    fontPx: 11,
    align: 'left',
    baseline: 'middle',
  };
  return {
    one: countTextCollisions([t]).collisions,
    two: countTextCollisions([t, { ...t, x: 110 }]).collisions,
  };
}

export {
  chainPlacedLayouts,
  packedOnDrawn,
  scalePlan,
  smallPlanLayouts,
  unit300Layouts,
} from './crossing-probe';

/**
 * Same-row pairs whose DRAWN rects overlap in x although their day spans do not. The label ladder's
 * halved-gap rule is provable only when a row's rects are disjoint, and a milestone's diamond is
 * `2 × MILESTONE_RADIUS` wide around a single day, so at coarse zoom it reaches over a neighbour.
 */
export function rectOverlaps(
  asap: Asap,
  layout: Layout,
  pxPerDay: number,
): { count: number; milestone: number; sample: string[] } {
  const { scene } = sceneFor(asap, layout);
  const view: Viewport = { pxPerDay, originX: 40, originY: 32 };
  const byLane = new Map<number, { id: string; kind: string; x0: number; x1: number }[]>();
  for (const a of scene.activities) {
    const rect = activityRect(a, view, scene.dataDate);
    if (rect === null) continue;
    const list = byLane.get(a.laneIndex) ?? [];
    list.push({ id: a.id, kind: barGlyphKind(a.type), x0: rect.x, x1: rect.x + rect.w });
    byLane.set(a.laneIndex, list);
  }
  let count = 0;
  let milestone = 0;
  const sample: string[] = [];
  for (const list of byLane.values()) {
    list.sort((a, b) => a.x0 - b.x0);
    for (let i = 0; i + 1 < list.length; i += 1) {
      const a = list[i]!;
      const b = list[i + 1]!;
      if (b.x0 < a.x1 - EPS) {
        count += 1;
        if (a.kind === 'milestone' || b.kind === 'milestone') milestone += 1;
        if (sample.length < 4) sample.push(`${a.id}(${a.kind})/${b.id}(${b.kind})`);
      }
    }
  }
  return { count, milestone, sample };
}
