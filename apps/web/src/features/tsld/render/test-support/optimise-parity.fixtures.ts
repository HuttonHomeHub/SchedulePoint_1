import { optimiseLayout } from '../optimise-layout';
import { relayoutSeeds, relayoutStartIds } from '../relayout-starts';
import type { RenderActivity, RenderEdge } from '../render-model';

import { FIXED_WIDTH_TEXT } from './fixed-width-text';

/**
 * **The parity corpus for Tidy and Re-layout's optional swimlane partition** (swimlanes M2-T6,
 * ADR-0203 FC-R8): a fixed, seeded set of plans and a runner that records what `optimiseLayout` and
 * the Re-layout starts answer for them.
 *
 * `optimise-parity.golden.json` is that record taken on the code as it stood BEFORE the partition
 * existed, kept as a digest of each plan's whole answer (lanes, objectives, counts, every start) beside
 * its Tidy evaluation count, so "an absent partition is byte-identical to the old search" is compared
 * with the old search and not with itself (ADR-0110). It was recorded in full on the base commit and
 * digested without being rerun, and the full answer was compared once more against the new code. The generator is a fixed-seed PRNG, so nothing here depends
 * on `Math.random` or the clock.
 */
export const PARITY_DATA_DATE = '2026-01-01';

function day(offset: number): string {
  return new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);
}

/** mulberry32 — the same generator `optimise-layout.test.ts` sweeps with. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ParityPlan {
  name: string;
  activities: RenderActivity[];
  edges: RenderEdge[];
}

/** A plan with forward links, a seed that may overlap, a milestone or two, and one undrawn activity. */
function planOf(seed: number, count: number, lanes: number): ParityPlan {
  const rand = prng(seed);
  const activities: RenderActivity[] = Array.from({ length: count }, (_, i) => {
    const start = Math.floor(rand() * 40);
    const milestone = i % 11 === 5;
    return {
      id: `a${String(i).padStart(2, '0')}`,
      type: milestone ? 'START_MILESTONE' : 'TASK',
      laneIndex: Math.floor(rand() * lanes),
      label: `a${String(i)}`,
      drawnStart: day(start),
      drawnFinish: milestone ? day(start) : day(start + 1 + Math.floor(rand() * 8)),
      isCritical: false,
      isNearCritical: false,
    };
  });
  activities.push({
    id: 'zz-undrawn',
    type: 'TASK',
    laneIndex: 2,
    label: 'undrawn',
    drawnStart: null,
    drawnFinish: null,
    isCritical: false,
    isNearCritical: false,
  });
  const edges: RenderEdge[] = [];
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      if (rand() < (count > 20 ? 0.06 : 0.2)) {
        edges.push({
          id: `${activities[i]!.id}-${activities[j]!.id}`,
          predecessorId: activities[i]!.id,
          successorId: activities[j]!.id,
          type: 'FS',
          isDriving: false,
        });
      }
    }
  }
  return { name: `seed ${String(seed)} (${String(count)})`, activities, edges };
}

export function parityPlans(): ParityPlan[] {
  const plans: ParityPlan[] = [];
  for (let seed = 1; seed <= 40; seed += 1) plans.push(planOf(seed, 6 + (seed % 7), 4));
  for (let seed = 101; seed <= 102; seed += 1) plans.push(planOf(seed, 28 + (seed % 5), 6));
  return plans;
}

const entries = (lanes: ReadonlyMap<string, number>): [string, number][] =>
  [...lanes].sort((a, b) => (a[0] < b[0] ? -1 : 1));

/** FNV-1a over the text, in hex: a record small enough to read in a diff and sensitive to every byte. */
export function digestOf(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/** What a golden file keeps of one plan's answer: its name, a digest of the whole answer, and a figure to read. */
export interface ParityRecord {
  name: string;
  evaluations: number;
  digest: string;
}

/** One plan's answer in full, with the figure its record keeps beside the digest. */
interface Answer {
  name: string;
  evaluations: number;
  answer: unknown;
}

/** Everything the search and the starts answer for each plan, in full. */
export function runOptimiseParityInFull(): Answer[] {
  return parityPlans().map((plan) => {
    const scene = {
      activities: plan.activities,
      edges: plan.edges,
      dataDate: PARITY_DATA_DATE,
      text: FIXED_WIDTH_TEXT,
    };
    const tidy = optimiseLayout(scene, { passes: 3, maxEvaluations: 400 });
    const packed = new Map(plan.activities.map((a, i) => [a.id, i % 3]));
    const seeds = relayoutSeeds(
      { activities: plan.activities, edges: plan.edges, dataDate: PARITY_DATA_DATE, packed },
      relayoutStartIds(plan.activities.length),
    );
    const searched = seeds.map((s) =>
      optimiseLayout(
        {
          ...scene,
          activities: plan.activities.map((a) => ({ ...a, laneIndex: s.lanes.get(a.id)! })),
        },
        { passes: 2, budget: 8, maxEvaluations: 400 },
      ),
    );
    return {
      name: plan.name,
      evaluations: tidy.evaluations,
      answer: {
        name: plan.name,
        tidy: { ...tidy, lanes: entries(tidy.lanes) },
        starts: seeds.map((s) => ({ id: s.id, lanes: entries(s.lanes) })),
        relayout: searched.map((r) => ({ ...r, lanes: entries(r.lanes) })),
      },
    };
  });
}

/** Three swimlanes by position, so every plan has links inside a swimlane and links across them. */
export const PARITY_SWIMLANES = ['x', 'y', 'z'] as const;

/**
 * What the PARTITIONED search answers for the same plans. `optimise-partitioned.golden.json` is that
 * record, taken after the product's search was shown to return the lanes and the evaluation count of
 * the M0-T4 harness's independent copy (`scripts/netpoint-swimlane-run.ts`) on all 42 drawn plans here
 * and on the power-plant and torture corpus plans. It pins the §4.5 restrictions (swaps, candidates,
 * the new row, compaction, repair) as a record, so a change to any of them is a visible diff.
 */
export function runPartitionedParityInFull(): Answer[] {
  return parityPlans().map((plan) => {
    const swimlaneOf = new Map(
      plan.activities.map((a, i) => [a.id, PARITY_SWIMLANES[i % PARITY_SWIMLANES.length]!]),
    );
    const r = optimiseLayout(
      {
        activities: plan.activities,
        edges: plan.edges,
        dataDate: PARITY_DATA_DATE,
        text: FIXED_WIDTH_TEXT,
      },
      { passes: 3, maxEvaluations: 400, partition: { swimlaneOf, order: [...PARITY_SWIMLANES] } },
    );
    return {
      name: plan.name,
      evaluations: r.evaluations,
      answer: { name: plan.name, ...r, lanes: entries(r.lanes) },
    };
  });
}

const recordOf = (answers: Answer[]): ParityRecord[] =>
  answers.map((a) => ({
    name: a.name,
    evaluations: a.evaluations,
    digest: digestOf(JSON.stringify(a.answer)),
  }));

export const runOptimiseParity = (): ParityRecord[] => recordOf(runOptimiseParityInFull());
export const runPartitionedParity = (): ParityRecord[] => recordOf(runPartitionedParityInFull());
