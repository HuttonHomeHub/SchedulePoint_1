/**
 * NetPoint grammar FC-G5 (spec §4.13 A3): text in a bar's row against the node discs, from the real
 * painter.
 *
 * Run: `pnpm exec tsx scripts/netpoint-grammar-text-nodes.ts` from `apps/web`.
 *
 * - **Discs** come from `nodeMarks`, the function the painter's node pass calls, over the painter's
 *   own `activityRect`s. Each disc is charged at `NODE_REACH_PX`, the heaviest rim included.
 * - **Text** is every `fillText` the recorder captures, boxed by `netpoint-row-probe.ts`'s
 *   `textBox`, which uses the metric the painter placed it against.
 * - **The rule counted:** dates, the centre item and lag plates must not meet a disc (A3). A NAME
 *   may cross a disc where its bar is shorter than the name, and paints above it, so names are
 *   reported and never counted. A text is a name when it sits on its lane's name row.
 *
 * **The control runs first.** A text painted on a node centre must count as one intersection, or
 * the counter cannot fail and a zero means nothing.
 */
import { netpointReferencePlan } from '../../seed-cli/src/references/netpoint-power-plant';
import {
  activityRect,
  LANE_HEIGHT,
  rowSlots,
  screenYOfLane,
} from '../src/features/tsld/render/geometry';
import { paintScene, type TsldScene } from '../src/features/tsld/render/paint';
import { NODE_REACH_PX, nodeMarks, type Viewport } from '../src/features/tsld/render/render-model';

import {
  chainPlacedLayouts,
  type Layout,
  PALETTE,
  type RecordedText,
  recordingCtx,
  sceneFor,
  smallPlanLayouts,
  unit300Layouts,
} from './crossing-probe';
import { textBox } from './netpoint-row-probe';

const out = (line = ''): void => {
  process.stdout.write(`${line}\n`);
};
const EPS = 0.5;

type Asap = Parameters<typeof sceneFor>[0];

interface Disc {
  x: number;
  y: number;
}

function discsFor(scene: TsldScene, view: Viewport): Disc[] {
  const lanes = new Map<
    number,
    {
      activity: TsldScene['activities'][number];
      rect: NonNullable<ReturnType<typeof activityRect>>;
    }[]
  >();
  for (const activity of scene.activities) {
    const rect = activityRect(activity, view, scene.dataDate);
    if (rect === null) continue;
    const row = lanes.get(activity.laneIndex);
    if (row) row.push({ activity, rect });
    else lanes.set(activity.laneIndex, [{ activity, rect }]);
  }
  for (const row of lanes.values()) row.sort((a, b) => a.rect.x - b.rect.x);
  return nodeMarks(lanes.values());
}

function meets(t: RecordedText, d: Disc): boolean {
  const b = textBox(t);
  const nx = Math.max(b.x0, Math.min(d.x, b.x1));
  const ny = Math.max(b.y0, Math.min(d.y, b.y1));
  return Math.hypot(nx - d.x, ny - d.y) < NODE_REACH_PX - EPS;
}

function reading(
  scene: TsldScene,
  pxPerDay: number,
  lanes: number,
  maxDay: number,
): { rowTexts: number; hits: number; nameHits: number; sample: string[] } {
  const view: Viewport = { pxPerDay, originX: 40, originY: 32 };
  const size = { width: (maxDay + 4) * pxPerDay + 400, height: lanes * LANE_HEIGHT + 200 };
  const { ctx, texts } = recordingCtx();
  paintScene(ctx as Parameters<typeof paintScene>[0], scene, view, size, PALETTE, 1);
  const discs = discsFor(scene, view);
  const nameYs = new Set<number>();
  for (let lane = 0; lane < lanes; lane += 1) nameYs.add(rowSlots(screenYOfLane(lane, view)).nameY);
  let rowTexts = 0;
  let hits = 0;
  let nameHits = 0;
  const sample: string[] = [];
  for (const t of texts) {
    const isName = nameYs.has(t.y);
    const hit = discs.some((d) => meets(t, d));
    if (isName) {
      if (hit) nameHits += 1;
      continue;
    }
    rowTexts += 1;
    if (hit) {
      hits += 1;
      if (sample.length < 4) sample.push(`"${t.text}"@${t.x.toFixed(1)}`);
    }
  }
  return { rowTexts, hits, nameHits, sample };
}

function referenceCase(): { asap: Asap; layout: Layout } {
  const spec = netpointReferencePlan();
  const origin = Math.min(...spec.activities.map((a) => Date.parse(`${a.visualStart}T00:00:00Z`)));
  const start = new Map<string, number>();
  const finish = new Map<string, number>();
  for (const a of spec.activities) {
    const s = (Date.parse(`${a.visualStart}T00:00:00Z`) - origin) / 86_400_000;
    const days = Math.round(a.durationMinutes / 1440);
    start.set(a.key, s);
    finish.set(a.key, days === 0 ? s : s + days - 1);
  }
  const asap = {
    activities: spec.activities.map((a) => ({ key: a.key, type: a.type })),
    dependencies: spec.dependencies.map((d) => ({
      predecessorKey: d.predecessorKey,
      successorKey: d.successorKey,
      type: d.type,
      lagMinutes: d.lagMinutes,
    })),
    start,
    finish,
  } as unknown as Asap;
  const laneOf = new Map(spec.activities.map((a) => [a.key, a.laneIndex ?? 0]));
  return { asap, layout: { name: 'as drawn', laneOf, lanes: Math.max(...laneOf.values()) + 1 } };
}

// ── The control: a date written on a node centre must be counted. ──────────────────────────────
{
  const control: TsldScene = {
    activities: [
      {
        id: 'a',
        type: 'TASK',
        laneIndex: 0,
        label: 'a',
        earlyStart: '2026-01-02',
        earlyFinish: '2026-01-11',
        isCritical: false,
        isNearCritical: false,
      },
    ],
    edges: [],
    dataDate: '2026-01-01',
    visualRefresh: true,
  };
  const view: Viewport = { pxPerDay: 12, originX: 40, originY: 32 };
  const [disc] = discsFor(control, view);
  const fake: RecordedText = {
    text: '2 Jan',
    x: disc!.x,
    y: disc!.y + 4,
    width: 30,
    fontPx: 11,
    align: 'left',
    baseline: 'middle',
  };
  if (!meets(fake, disc!)) throw new Error('control: a date on a node centre was not counted');
}

const small = smallPlanLayouts();
const chain = chainPlacedLayouts();
const unit = unit300Layouts('../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer');
const cases = [
  { name: 'reference-netpoint', ...referenceCase() },
  { name: 'chain-3-placed', asap: chain.asap as unknown as Asap, layout: chain.shipped },
  { name: 'small-17', asap: small.asap as unknown as Asap, layout: small.shipped },
  { name: 'Unit 300', asap: unit.asap, layout: unit.shipped },
];

out('## FC-G5 — row text against node discs (dates, centre item, plates; names reported)\n');
out('| Plan | px/day | row texts | row text on a disc | names crossing a disc | sample |');
out('| --- | --- | --- | --- | --- | --- |');
let total = 0;
for (const c of cases) {
  const { scene } = sceneFor(c.asap, c.layout);
  const maxDay = Math.max(
    ...(
      c.asap as unknown as { activities: { key: string }[]; finish: Map<string, number> }
    ).activities.map(
      (a) => (c.asap as unknown as { finish: Map<string, number> }).finish.get(a.key) ?? 0,
    ),
  );
  for (const z of [1, 4, 12]) {
    const r = reading(scene, z, c.layout.lanes, maxDay);
    total += r.hits;
    out(
      `| ${c.name} | ${z} | ${r.rowTexts} | ${r.hits} | ${r.nameHits} | ${r.sample.join(', ')} |`,
    );
  }
}
out(`\nRow text on a disc, all plans and zooms: **${total}** (FC-G5 requires 0).`);
