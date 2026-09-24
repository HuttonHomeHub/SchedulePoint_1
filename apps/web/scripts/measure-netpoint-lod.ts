/**
 * NetPoint grammar M0-T4: where each level-of-detail tier starts, measured.
 *
 * Run: `pnpm exec tsx scripts/measure-netpoint-lod.ts` from `apps/web`.
 *
 * Spec G11 keys three tiers to `view.pxPerDay` and says the thresholds are measured, not written. For
 * each layer that joins a tier, this script sweeps the zoom and records the fraction of the layer's
 * items that the layer's own collision rule would suppress. A layer's tier starts at the first zoom
 * where that fraction falls below one half.
 *
 * **Dates come from the real painter.** Since NetPoint-layout M1 the painter reserves a text row
 * under the bar and bypasses its zoom gate there (`reservesTextRows`). Its date ladder is richer
 * than any pure proxy: dates inside the bar when both fit, one date per shared node (#379), and
 * flanking dates otherwise. So the painter is recorded (`crossing-probe.ts`'s recording context)
 * and its date strings are counted. The denominator is the most dates drawn at any zoom. A first
 * draft judged dates with `dateLabelSlot` alone, and it counted a shared node twice, reporting the
 * reference plan at 50 % withheld at every zoom.
 *
 * **Gap labels and lag plates are judged by their rule**, because gap labels do not exist yet and
 * the painter gates plates at `LABEL_MIN_PX_PER_DAY`:
 * - **Gap labels:** spec G6's rule. A label is drawn on a waiting run wider than the label plus 4 px.
 * - **Lag plates:** the run a lag plate sits on. That is a proxy, stated here, not the routed segment
 *   `lagPlateAt` reads. On an FS link the horizontal run is the gap, so the proxy is exact for the
 *   links that carry most plates.
 *
 * **Text widths are estimated** at 6.2 px per character for the 11 px face. That is coarse, and a
 * tier threshold is coarse too: the sweep's zoom steps are further apart than any width error moves a
 * crossing point.
 */
import { netpointReferencePlan } from '../../seed-cli/src/references/netpoint-power-plant';
import { edgeGapDays, LABEL_GAP_PX, LANE_HEIGHT } from '../src/features/tsld/render/geometry';
import { paintScene, type TsldScene } from '../src/features/tsld/render/paint';
import { DEFAULT_VIEW_TOGGLES } from '../src/features/tsld/render/view-toggles';

import { PALETTE, recordingCtx, sceneFor, unit300Layouts } from './crossing-probe';

const out = (line = ''): void => {
  process.stdout.write(`${line}\n`);
};

interface Bar {
  id: string;
  lane: number;
  start: number;
  finish: number;
  milestone: boolean;
}
interface Link {
  from: string;
  to: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lagDays: number;
}
interface Plan {
  name: string;
  bars: Bar[];
  links: Link[];
  scene: TsldScene;
  lanes: number;
  days: number;
}

const CHAR_PX = 6.2;
const width = (text: string): number => text.length * CHAR_PX;
const EPOCH = Date.parse('2026-01-01T00:00:00Z');
const isoOf = (day: number): string =>
  new Date(EPOCH + day * 86_400_000).toISOString().slice(0, 10);

function unit300(): Plan {
  const { asap, shipped } = unit300Layouts(
    '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer',
  );
  const acts = asap.activities as { key: string; type: string }[];
  const bars = acts.map((a) => ({
    id: a.key,
    lane: shipped.laneOf.get(a.key) ?? 0,
    start: asap.start.get(a.key) ?? 0,
    finish: asap.finish.get(a.key) ?? 0,
    milestone: a.type.endsWith('MILESTONE'),
  }));
  const deps = asap.dependencies as {
    predecessorKey: string;
    successorKey: string;
    type: Link['type'];
    lagMinutes?: number | null;
  }[];
  const links = deps.map((d) => ({
    from: d.predecessorKey,
    to: d.successorKey,
    type: d.type,
    lagDays: Math.round((d.lagMinutes ?? 0) / (8 * 60)),
  }));
  const { scene } = sceneFor(asap, shipped);
  return {
    name: 'Unit 300',
    bars,
    links,
    scene: withDates(scene),
    lanes: shipped.lanes,
    days: Math.max(...bars.map((b) => b.finish)) + 1,
  };
}

function reference(): Plan {
  const spec = netpointReferencePlan();
  const DAY = 1440;
  const starts = spec.activities.map((a) => Date.parse(`${a.visualStart}T00:00:00Z`));
  const origin = Math.min(...starts);
  const bars = spec.activities.map((a) => {
    const start = (Date.parse(`${a.visualStart}T00:00:00Z`) - origin) / 86_400_000;
    const days = Math.round(a.durationMinutes / DAY);
    return {
      id: a.key,
      lane: a.laneIndex ?? 0,
      start,
      finish: days === 0 ? start : start + days - 1,
      milestone: a.type.endsWith('MILESTONE'),
    };
  });
  const links = spec.dependencies.map((d) => ({
    from: d.predecessorKey,
    to: d.successorKey,
    type: d.type,
    lagDays: Math.round((d.lagMinutes ?? 0) / DAY),
  }));
  const scene: TsldScene = withDates({
    activities: spec.activities.map((a, i) => ({
      id: a.key,
      type: a.type as never,
      laneIndex: a.laneIndex ?? 0,
      label: a.name,
      earlyStart: isoOf(bars[i]!.start),
      earlyFinish: isoOf(bars[i]!.finish),
      durationDays: Math.round(a.durationMinutes / DAY),
      isCritical: false,
      isNearCritical: false,
    })),
    edges: spec.dependencies.map((d) => ({
      predecessorId: d.predecessorKey,
      successorId: d.successorKey,
      type: d.type as never,
      isDriving: true,
    })),
    dataDate: isoOf(0),
    visualRefresh: true,
    timeTrueLinks: true,
    linkRouting: true,
  });
  return {
    name: 'NetPoint reference',
    bars,
    links,
    scene,
    lanes: Math.max(...bars.map((b) => b.lane)) + 1,
    days: Math.max(...bars.map((b) => b.finish)) + 1,
  };
}

/** Turn the dates layer on, with names on, as a planner sees them at the working tier. */
function withDates(scene: TsldScene): TsldScene {
  return { ...scene, view: { ...DEFAULT_VIEW_TOGGLES, labels: true, dates: true } };
}

const DATE_TEXT = /^\d{1,2} [A-Z][a-z]{2}$/;

/** How many date strings the real painter draws for the whole plan at `pxPerDay`. */
function datesDrawn(plan: Plan, pxPerDay: number): number {
  const { ctx, texts } = recordingCtx();
  paintScene(
    ctx as Parameters<typeof paintScene>[0],
    plan.scene,
    { pxPerDay, originX: 40, originY: 32 },
    { width: plan.days * pxPerDay + 400, height: plan.lanes * LANE_HEIGHT + 200 },
    PALETTE,
    1,
  );
  return texts.filter((t) => DATE_TEXT.test(t.text)).length;
}

/** For each link with waiting time, whether its run can hold a `${n}d` label plus 4 px. */
function runSuppressed(plan: Plan, pxPerDay: number, which: 'gap' | 'lag'): number {
  const byId = new Map(plan.bars.map((b) => [b.id, b]));
  let total = 0;
  let withheld = 0;
  for (const l of plan.links) {
    const p = byId.get(l.from);
    const s = byId.get(l.to);
    if (!p || !s) continue;
    const gap = edgeGapDays({
      type: l.type,
      predStartDay: p.start,
      predFinishDay: p.finish,
      succStartDay: s.start,
      succFinishDay: s.finish,
      lagDays: l.lagDays,
    });
    const days = which === 'gap' ? gap : l.lagDays;
    if (days <= 0) continue;
    total += 1;
    const label = which === 'gap' ? `${days}d` : `+${days}d`;
    // The run the label sits on: the waiting run for a gap, the lag run for a plate.
    if (days * pxPerDay < width(label) + LABEL_GAP_PX * 2 + 4) withheld += 1;
  }
  return total === 0 ? Number.NaN : withheld / total;
}

const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 18, 24, 40, 60];
const plans = [reference(), unit300()];
const firstBelowHalf: Record<string, Record<string, number | null>> = {};

for (const plan of plans) {
  out(`## ${plan.name} — ${plan.bars.length} activities, ${plan.links.length} links\n`);
  out('| px/day | dates withheld | gap labels withheld | lag plates withheld |');
  out('| --- | --- | --- | --- |');
  const firsts: Record<string, number | null> = { dates: null, gaps: null, lags: null };
  const drawn = new Map(ZOOMS.map((z) => [z, datesDrawn(plan, z)]));
  const most = Math.max(...drawn.values());
  for (const z of ZOOMS) {
    const d = most === 0 ? Number.NaN : 1 - drawn.get(z)! / most;
    const g = runSuppressed(plan, z, 'gap');
    const l = runSuppressed(plan, z, 'lag');
    const pct = (x: number): string => (Number.isNaN(x) ? 'n/a' : `${(x * 100).toFixed(0)}%`);
    out(`| ${z} | ${pct(d)} | ${pct(g)} | ${pct(l)} |`);
    if (firsts.dates === null && d < 0.5) firsts.dates = z;
    if (firsts.gaps === null && g < 0.5) firsts.gaps = z;
    if (firsts.lags === null && !Number.isNaN(l) && l < 0.5) firsts.lags = z;
  }
  firstBelowHalf[plan.name] = firsts;
  out(
    `\nFirst zoom below one half: dates ${firsts.dates}, gap labels ${firsts.gaps}, ` +
      `lag plates ${firsts.lags}.\n`,
  );
}

// The vacuity control: a sweep that found no item would report every layer at 0 % withheld and pick
// the smallest zoom for every tier. That is the answer a broken instrument gives, so refuse it.
for (const plan of plans) {
  if (datesDrawn(plan, ZOOMS.at(-1)!) === 0 || runSuppressed(plan, ZOOMS[0]!, 'gap') === 0) {
    throw new Error(
      `${plan.name}: no date is drawn at ${ZOOMS.at(-1)} px/day, or no gap label is withheld at ` +
        `${ZOOMS[0]} px/day. The sweep is vacuous.`,
    );
  }
}

out('## Tier thresholds (the larger of the two plans, per layer)\n');
const worst = (layer: string): number =>
  Math.max(...plans.map((p) => firstBelowHalf[p.name]![layer] ?? Infinity));
out(`- working tier (dates and gap labels): ${Math.max(worst('dates'), worst('gaps'))} px/day`);
out(`- detail tier (lag plates): ${worst('lags')} px/day`);
