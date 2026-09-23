/**
 * **#381 M0-T2 — the catalogue harness for the finish-milestone date rule (FC-5, and the NetPoint
 * control).**
 *
 *   FM_MODE=baseline FM_OUT=/tmp/fm-before.json pnpm exec vitest run -c scripts/vitest.measure.config.mts scripts/measure-finish-milestone.mts
 *   FM_MODE=diff     FM_OUT=/tmp/fm-before.json pnpm exec vitest run -c scripts/vitest.measure.config.mts scripts/measure-finish-milestone.mts
 *
 * Run `baseline` on the unchanged engine, change the engine, run `diff`. It computes every catalogue
 * plan — the fixture, every capability plan, the NetPoint reference and `scale-500` — from its
 * `SeedSpec` (ADR-0066: never from persisted rows) and compares every engine output field.
 *
 * **The mapper's approximations cancel, and that is why they are acceptable here.**
 * `test/pairwise/spec-to-engine.ts` is known to schedule differently from the product on the fixture
 * (`scripts/m0-engine-input.mts` records a four-month gap). This harness never compares the mapper with
 * the product; it compares the engine with ITSELF, before and after one change, through the same
 * mapper. Anything the mapper approximates is approximated identically on both sides.
 *
 * **Two refusals, so a green run cannot mean "compared nothing".**
 * 1. The NetPoint reference plan's Guaranteed Commercial Operation must move 2031-03-01 → 2031-02-28
 *    (spec §5 prediction). If it does not, the diff was taken against an unchanged engine, and the
 *    harness says so instead of reporting FC-5 as held.
 * 2. Every plan must compute at least one row.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { fixtureSpec, scaleSpec, type SeedSpec } from '@repo/seed';
import { it } from 'vitest';

import { computeSchedule } from '../src/modules/schedule/engine/index.js';
import { specToEngineInput } from '../test/pairwise/spec-to-engine.js';
import { capabilitySpecs } from '../../seed-cli/src/capabilities/index.js';
import { referenceSpecs } from '../../seed-cli/src/references/index.js';

/**
 * The finish milestones whose OWN dates the rule reinterprets (placement, constraint or external
 * date), and every activity downstream of one. Under the approved decision Q2 A (conditions.md) these
 * are the rows allowed to move; FC-5's first wording ("no non-milestone row moves") forgot that a
 * reinterpreted milestone pushes its successors, and this is the invariant it meant.
 */
function allowedToMove(spec: SeedSpec): Set<string> {
  const dated = spec.activities.filter(
    (a) =>
      a.type === 'FINISH_MILESTONE' &&
      (a.visualStart !== null ||
        a.constraintDate !== null ||
        a.secondaryConstraintDate !== null ||
        a.externalEarlyStart !== null ||
        a.externalLateFinish !== null),
  );
  const successors = new Map<string, string[]>();
  for (const d of spec.dependencies) {
    const list = successors.get(d.predecessorKey) ?? [];
    list.push(d.successorKey);
    successors.set(d.predecessorKey, list);
  }
  // Two DERIVED spans follow what they are made of, not their logic: a Level-of-Effort activity spans
  // from its predecessors to its successors (ADR-0035 §21), so it moves when either end does, and a
  // WBS summary rolls up its children (ADR-0038). Everything else moves only by being downstream.
  const predecessors = new Map<string, string[]>();
  for (const d of spec.dependencies) {
    const list = predecessors.get(d.successorKey) ?? [];
    list.push(d.predecessorKey);
    predecessors.set(d.successorKey, list);
  }
  const byKey = new Map(spec.activities.map((a) => [a.key, a]));
  const seen = new Set<string>();
  const stack = dated.map((a) => a.key);
  for (;;) {
    while (stack.length > 0) {
      const key = stack.pop()!;
      if (seen.has(key)) continue;
      seen.add(key);
      stack.push(...(successors.get(key) ?? []));
      const parent = byKey.get(key)?.parentKey;
      if (parent) stack.push(parent);
    }
    const loes = spec.activities.filter(
      (a) =>
        a.type === 'LEVEL_OF_EFFORT' &&
        !seen.has(a.key) &&
        (predecessors.get(a.key) ?? []).some((k) => seen.has(k)),
    );
    const loesViaSuccessor = spec.activities.filter(
      (a) =>
        a.type === 'LEVEL_OF_EFFORT' &&
        !seen.has(a.key) &&
        (successors.get(a.key) ?? []).some((k) => seen.has(k)),
    );
    const more = [...loes, ...loesViaSuccessor].map((a) => a.key);
    if (more.length === 0) return seen;
    stack.push(...more);
  }
}

type Snapshot = Record<
  string,
  { allowed: string[]; types: Record<string, string>; results: Record<string, unknown>; summary: unknown }
>;

function catalogue(): SeedSpec[] {
  return [fixtureSpec(), ...capabilitySpecs(), ...referenceSpecs(), scaleSpec({ activities: 500 })];
}

function snapshot(): Snapshot {
  const out: Snapshot = {};
  for (const spec of catalogue()) {
    const input = specToEngineInput(spec);
    const output = computeSchedule(input.activities, input.edges, input.options);
    if (output.results.length === 0) throw new Error(`${spec.seedName} computed no rows`);
    out[spec.seedName] = {
      allowed: [...allowedToMove(spec)],
      types: Object.fromEntries(spec.activities.map((a) => [a.key, a.type])),
      results: Object.fromEntries(output.results.map((r) => [r.activityId, r])),
      summary: output.summary,
    };
  }
  return out;
}

it('measures the finish-milestone rule over the catalogue', () => {
  const mode = process.env.FM_MODE;
  const file = process.env.FM_OUT;
  if (!file || (mode !== 'baseline' && mode !== 'diff')) {
    throw new Error('Set FM_MODE=baseline|diff and FM_OUT=<json path>.');
  }
  const now = snapshot();
  if (mode === 'baseline') {
    writeFileSync(file, JSON.stringify(now));
    console.log(`baseline written: ${Object.keys(now).length} plans → ${file}`);
    return;
  }
  const before = JSON.parse(readFileSync(file, 'utf8')) as Snapshot;
  const lines: string[] = [];
  let otherRowsChanged = 0;
  let fmRowsChanged = 0;
  const unexplained: string[] = [];
  for (const [plan, after] of Object.entries(now)) {
    const was = before[plan];
    if (!was) throw new Error(`${plan} missing from the baseline`);
    const planLines: string[] = [];
    for (const [id, result] of Object.entries(after.results)) {
      const prior = was.results[id] as Record<string, unknown> | undefined;
      const current = result as Record<string, unknown>;
      const changed = Object.keys({ ...prior, ...current }).filter(
        (k) => JSON.stringify(prior?.[k]) !== JSON.stringify(current[k]),
      );
      if (changed.length === 0) continue;
      const isFm = after.types[id] === 'FINISH_MILESTONE';
      if (isFm) fmRowsChanged += 1;
      else otherRowsChanged += 1;
      if (!isFm && !after.allowed.includes(id)) unexplained.push(`${plan}/${id}`);
      planLines.push(
        `    ${isFm ? 'FM   ' : 'OTHER'} ${id}: ` +
          changed
            .map((k) => `${k} ${JSON.stringify(prior?.[k])} → ${JSON.stringify(current[k])}`)
            .join('; '),
      );
    }
    const summaryChanged = JSON.stringify(was.summary) !== JSON.stringify(after.summary);
    if (planLines.length > 0 || summaryChanged) {
      lines.push(`  ${plan}:`);
      if (summaryChanged) {
        lines.push(
          `    summary: ${JSON.stringify(was.summary)}\n          → ${JSON.stringify(after.summary)}`,
        );
      }
      lines.push(...planLines);
    }
  }
  const gco = (now['reference-netpoint-power-plant']?.results['M_GCO'] ?? {}) as {
    earlyFinish?: string;
  };
  const gcoBefore = (before['reference-netpoint-power-plant']?.results['M_GCO'] ?? {}) as {
    earlyFinish?: string;
  };
  console.log(lines.join('\n'));
  console.log(
    `\nFM rows changed: ${fmRowsChanged}; OTHER rows changed: ${otherRowsChanged} (FC-5 needs 0)` +
      `\nNon-milestone rows moved that are NOT downstream of a dated finish milestone: ${unexplained.length}` +
      (unexplained.length > 0 ? ` (${unexplained.join(', ')})` : '') +
      `\nNetPoint GCO early finish: ${gcoBefore.earlyFinish} → ${gco.earlyFinish} (control expects 2031-03-01 → 2031-02-28)`,
  );
  if (gcoBefore.earlyFinish === gco.earlyFinish) {
    throw new Error(
      'Control did not fire: the engine rule is unchanged, so this diff proves nothing.',
    );
  }
});
