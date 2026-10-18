import {
  compareObjectives,
  type LayoutObjective,
} from '../src/features/tsld/render/layout-objective';

import type { Measure, PlanResult, Run } from './relayout-bench';

/**
 * **The verdicts of `docs/specs/relayout-quality/conditions.md`, computed rather than argued**
 * (plan M0-T3, ADR-0128). Pure over the benchmark's results, so a reading is judged against bars
 * committed BEFORE it existed and nobody re-reads the table to decide whether it passed.
 *
 * Node-side: bundled by `measure-relayout.mjs`. Nothing here moves a bar; a wrong bar is amended in
 * `conditions.md` in a dated entry that quotes its first commit.
 */

export const REFERENCE_SEED = 'reference-netpoint-power-plant';
export const FIXTURE_SEED = 'fixture-p6-torture-v1';

/** Which variants make up "the candidate": the best of them by the product's own order. */
export interface Candidate {
  budget: 'seed' | 'current';
  starts: number[];
  /** Judge the Re-layout the product's dialog shows (`PlanResult.product`), not a budget:starts pair. */
  product?: boolean;
}

export type Status = 'PASS' | 'FAIL' | 'REPORT' | 'NOT RUN';

export interface Verdict {
  id: string;
  status: Status;
  detail: string[];
}

/** Today's Re-layout is `seed:0` and is always a member, so "never worse than today" is by construction. */
export function candidateRun(plan: PlanResult, candidate: Candidate): { run: Run; members: Run[] } {
  if (candidate.product) return { run: plan.product, members: [plan.product] };
  const members: Run[] = [];
  for (const start of candidate.starts) {
    const run =
      candidate.budget === 'seed' && start === 0
        ? plan.today
        : plan.variants.find((v) => v.start === start && v.budget === candidate.budget);
    // A bounded plan has no variants: the pack is the only thing there is, so it is the candidate.
    if (run) members.push(run);
  }
  if (members.length === 0) return { run: plan.today, members: [plan.today] };
  let best = members[0]!;
  for (const m of members) {
    if (compareObjectives(m.measure.objective, best.measure.objective) < 0) best = m;
  }
  return { run: best, members };
}

const head = (o: LayoutObjective): LayoutObjective => ({
  ...o,
  contacts: 0,
  sameRow: 0,
  travel: 0,
  rows: 0,
});

const fmt = (o: LayoutObjective): string =>
  `overlaps ${String(o.overlaps)}, behind ${String(o.occluded)}, crossings ${String(o.crossings)}, ` +
  `contacts ${String(o.contacts)}, same-row ${String(o.sameRow)}, travel ${String(o.travel)}, rows ${String(o.rows)}`;

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

export interface JudgeInput {
  plans: PlanResult[];
  candidate: Candidate;
  /** Tidy lane digests recorded in the committed baseline; null when none exists yet. */
  baselineTidy: Record<string, string> | null;
  tidyDigests: Record<string, string>;
  /** FC-R0 from the Playwright step: null when it was not taken. */
  agreement: { agree: boolean; lines: string[] } | null;
  /** Files changed against the base under `apps/api/` or `packages/layout/src/`; null if git failed. */
  protectedChanges: string[] | null;
}

export function judge(input: JudgeInput): Verdict[] {
  const { plans, candidate } = input;
  const verdicts: Verdict[] = [];
  const reference = plans.find((p) => p.seedName === REFERENCE_SEED);

  verdicts.push(
    input.agreement === null
      ? { id: 'FC-R0', status: 'NOT RUN', detail: ['the dialog agreement step was not taken'] }
      : {
          id: 'FC-R0',
          status: input.agreement.agree ? 'PASS' : 'FAIL',
          detail: input.agreement.lines,
        },
  );

  if (!reference) {
    verdicts.push({
      id: 'FC-R1',
      status: 'NOT RUN',
      detail: ['the reference plan is not in the corpus'],
    });
  } else {
    const handHead = head(reference.hand.objective);
    const todayHead = head(reference.today.measure.objective);
    const worse = compareObjectives(todayHead, handHead) > 0;
    verdicts.push({
      id: 'FC-R1',
      status: worse ? 'PASS' : 'FAIL',
      detail: [
        `hand   : ${fmt(reference.hand.objective)}`,
        `today  : ${fmt(reference.today.measure.objective)}`,
        worse
          ? "today's Re-layout is worse than the hand layout on (overlaps, behind, crossings): the problem is real"
          : "today's Re-layout is NOT worse than the hand layout: #382 closes as stale and the epic stops",
      ],
    });
  }

  const violations: string[] = [];
  for (const p of plans) {
    const c = candidateRun(p, candidate).run;
    if (compareObjectives(c.measure.objective, p.today.measure.objective) > 0) {
      violations.push(
        `${p.seedName}: candidate ${fmt(c.measure.objective)} is worse than today ${fmt(p.today.measure.objective)}`,
      );
    }
  }
  verdicts.push({
    id: 'FC-R2',
    status: violations.length === 0 ? 'PASS' : 'FAIL',
    detail:
      violations.length === 0
        ? [`0 violations over ${String(plans.length)} plans`]
        : [`${String(violations.length)} violations`, ...violations],
  });

  if (!reference) {
    verdicts.push({
      id: 'FC-R3',
      status: 'NOT RUN',
      detail: ['the reference plan is not in the corpus'],
    });
  } else {
    const c = candidateRun(reference, candidate).run;
    const meets = compareObjectives(head(c.measure.objective), head(reference.hand.objective)) <= 0;
    verdicts.push({
      id: 'FC-R3',
      status: meets ? 'PASS' : 'FAIL',
      detail: [
        `hand      : ${fmt(reference.hand.objective)}`,
        `candidate : ${fmt(c.measure.objective)}`,
      ],
    });
  }

  const roleOf = (p: PlanResult): string | null =>
    p.seedName === REFERENCE_SEED
      ? 'reference'
      : p.seedName === FIXTURE_SEED
        ? 'fixture'
        : p.seedName.startsWith('scale-')
          ? 'scale'
          : null;
  const better: string[] = [];
  const roles: string[] = [];
  for (const p of plans) {
    const role = roleOf(p);
    if (role === null) continue;
    roles.push(role);
    const c = candidateRun(p, candidate).run;
    if (compareObjectives(c.measure.objective, p.today.measure.objective) < 0) better.push(role);
  }
  verdicts.push({
    id: 'FC-R4',
    status: roles.length < 3 ? 'NOT RUN' : better.length >= 2 ? 'PASS' : 'FAIL',
    detail: [
      `strictly better than today on: ${better.length === 0 ? 'none' : better.join(', ')} (of ${roles.join(', ')})`,
    ],
  });

  const spread: string[] = [];
  const tripped: string[] = [];
  for (const p of plans) {
    if (p.drawn < 40) continue;
    const c = candidateRun(p, candidate).run;
    const row = (m: Measure): string =>
      `rows ${String(m.objective.rows)}, mean |dlane| ${m.travelMean.toFixed(2)}, max ${String(m.travelMax)}`;
    spread.push(
      `${p.seedName}: hand ${row(p.hand)} | today ${row(p.today.measure)} | candidate ${row(c.measure)}`,
    );
    if (c.measure.travelMax > p.today.measure.travelMax * 1.5) tripped.push(p.seedName);
  }
  verdicts.push({
    id: 'FC-R5',
    status: tripped.length > 0 ? 'FAIL' : 'REPORT',
    detail: [
      ...spread,
      tripped.length > 0
        ? `maximum |dlane| rose by more than 50 % on: ${tripped.join(', ')} - to the product owner with pictures before it ships`
        : 'no plan raised the maximum |dlane| by more than 50 %',
      'pictures: not produced by this script (shoot-layouts.mjs, plan M0-T5)',
    ],
  });

  const scale = plans.find((p) => roleOf(p) === 'scale' && !p.bounded);
  if (!scale) {
    verdicts.push({
      id: 'FC-R6',
      status: 'NOT RUN',
      detail: ['no searched scale plan in the corpus'],
    });
  } else {
    const { members } = candidateRun(scale, candidate);
    const pool = candidate.product ? scale.pool : null;
    if (pool !== null) {
      const todayMs = median(pool.todayMs);
      const poolMs = median(pool.poolMs);
      const evaluations = scale.product.evaluations;
      const cap = scale.productStarts.length * 2000;
      const ratio = poolMs / todayMs;
      verdicts.push({
        id: 'FC-R6',
        status: ratio <= 1.5 && evaluations <= cap ? 'PASS' : 'FAIL',
        detail: [
          `${scale.seedName}: ${String(scale.drawn)} drawn activities, real module workers`,
          `today     : ${pool.todayMs.map((m) => m.toFixed(0)).join(' / ')} ms (one search in one worker)`,
          `product   : ${pool.poolMs.map((m) => m.toFixed(0)).join(' / ')} ms (starts ${pool.starts.join(',')} in ${String(pool.concurrency)} workers)`,
          `ratio     : ${ratio.toFixed(2)}x; one worker would wait ${(pool.serialMs / todayMs).toFixed(2)}x (${pool.serialMs.toFixed(0)} ms)`,
          `evaluations ${String(evaluations)} against a cap of ${String(cap)} (starts x 2,000)`,
          ratio > 1.5
            ? 'over 1.5x: lower RELAYOUT_MULTISTART_MAX_ACTIVITIES to the largest size that passes (CQ-2), re-run at that size'
            : 'within 1.5x at this size: the gate may stand at it',
        ],
      });
    } else {
      const todayMs = median(scale.today.ms);
      const serial = members.reduce((n, m) => n + median(m.ms), 0);
      const parallel = Math.max(...members.map((m) => median(m.ms)));
      const evaluations = members.reduce((n, m) => n + m.evaluations, 0);
      const cap = candidate.starts.length * 2000;
      const ratio = parallel / todayMs;
      verdicts.push({
        id: 'FC-R6',
        status: ratio <= 1.5 && evaluations <= cap ? 'PASS' : 'FAIL',
        detail: [
          `${scale.seedName}: ${String(scale.drawn)} drawn activities`,
          `today     : ${scale.today.ms.map((m) => m.toFixed(0)).join(' / ')} ms (${String(scale.today.evaluations)} evaluations)`,
          `candidate : ${members.map((m) => `${m.name}: ${m.ms.map((x) => x.toFixed(0)).join(' / ')} ms`).join('; ')}`,
          `ratio     : ${ratio.toFixed(2)}x if the starts run in parallel (the slowest start), ${(serial / todayMs).toFixed(2)}x if serial`,
          `evaluations ${String(evaluations)} against a cap of ${String(cap)} (starts x 2,000)`,
          'single-thread timings on the page, not a worker pool: a projection. Judge `--candidate=product` for real workers',
        ],
      });
    }
  }

  const unstable: string[] = [];
  for (const p of plans) {
    if (p.pool !== null && !p.pool.identical)
      unstable.push(
        `${p.seedName}: the pick differs between 1 and ${String(p.pool.concurrency)} workers`,
      );
    for (const r of [p.tidy, p.today, p.product, ...p.variants]) {
      if (r === null) continue;
      if (!r.repeatable) unstable.push(`${p.seedName}: ${r.name} differs between two runs`);
      if (r.reversible === false)
        unstable.push(`${p.seedName}: ${r.name} differs with the input reversed`);
    }
  }
  verdicts.push({
    id: 'FC-R7',
    status: unstable.length === 0 ? 'PASS' : 'FAIL',
    detail:
      unstable.length === 0 ? ['byte-identical lanes across repeats and reversed input'] : unstable,
  });

  if (input.baselineTidy === null) {
    verdicts.push({
      id: 'FC-R8',
      status: 'NOT RUN',
      detail: [
        'no committed baseline yet: node scripts/measure-relayout.mjs --skip-capture --write-baseline --product=today, then commit scripts/fixtures/relayout-baseline.json',
      ],
    });
  } else {
    const drift = Object.keys(input.tidyDigests).filter(
      (k) => input.baselineTidy![k] !== input.tidyDigests[k],
    );
    verdicts.push({
      id: 'FC-R8',
      status: drift.length === 0 ? 'PASS' : 'FAIL',
      detail:
        drift.length === 0
          ? [
              `Tidy's lanes match the baseline on ${String(Object.keys(input.tidyDigests).length)} plans`,
            ]
          : drift.map((k) => `${k}: Tidy's lanes differ from the baseline`),
    });
  }

  verdicts.push(
    input.protectedChanges === null
      ? { id: 'FC-R9', status: 'NOT RUN', detail: ['git could not list the changed files'] }
      : {
          id: 'FC-R9',
          status: input.protectedChanges.length === 0 ? 'PASS' : 'FAIL',
          detail:
            input.protectedChanges.length === 0
              ? ['no file under apps/api/ or packages/layout/src/ changed']
              : input.protectedChanges,
        },
  );
  return verdicts;
}

/** A Markdown table of the headline vectors, one row per plan and layout. */
export function table(plans: readonly PlanResult[], candidate: Candidate): string {
  const lines = [
    '| Plan | Drawn | Layout | Rows | Behind | Crossings | Overlaps | Contacts | Same-row | Travel | Bends | Crit rows | Crit off-row | Mean/max dlane | Evals | ms |',
    '| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |',
  ];
  for (const p of plans) {
    const cand = candidateRun(p, candidate).run;
    const rows: [string, Measure, Run | null][] = [
      ['hand', p.hand, null],
      ['Tidy', p.tidy?.measure ?? p.hand, p.tidy],
      ['Re-layout (today)', p.today.measure, p.today],
    ];
    if (cand !== p.today) rows.push([`candidate: ${cand.name}`, cand.measure, cand]);
    for (const [name, m, run] of rows) {
      if (name === 'Tidy' && p.tidy === null) continue;
      const o = m.objective;
      lines.push(
        `| ${p.seedName} | ${String(p.drawn)} | ${name} | ${String(o.rows)} | ${String(o.occluded)} | ${String(o.crossings)} | ${String(o.overlaps)} | ${String(o.contacts)} | ${String(o.sameRow)} | ${String(o.travel)} | ${String(m.bends)} | ${String(m.spine.rows)} | ${String(m.spine.linksOffRow)}/${String(m.spine.links)} | ${m.travelMean.toFixed(2)}/${String(m.travelMax)} | ${run ? String(run.evaluations) : ''} | ${run ? run.ms.map((x) => x.toFixed(0)).join(' / ') : ''} |`,
      );
    }
  }
  return lines.join('\n');
}
