// @ts-check
/**
 * Fixtures for `check-adr-coverage.mjs` — **and every case names the mutation that made it red.**
 *
 * Until 2026-09-19 this was the only register gate with no `.test.mjs` sibling, so none of its
 * three shipped assertions had ever been verified red (`docs/TECH_DEBT.md` #291 §1.4). That is the
 * standard ADR-0110 D5 sets — *a gate is not finished when it passes; it is finished when it has
 * been made to fail by the defect it was written for* — so each `it()` below carries, in its own
 * comment, the edit to `check-adr-coverage.mjs` that turns it red.
 *
 * **The suite drives `runGate(root)`, which is what the CLI calls**, `report()` included — not a
 * private mirror of the rules. `stack-record.structural.test.ts` is the recorded cost of the other
 * choice: it asserted against a copy of the logic it was named for and would have stayed green
 * through the regression its own docblock described.
 *
 * **One honest departure from the plan.** M1-T1 asked for the suite to be written against today's
 * gate and required to pass unedited through the restructure, as the before/after oracle. That was
 * not possible: the gate read a module-scope `root` and called `process.exit` inline, so there was
 * no way to point it at a fixture at all — which is the same fact that had kept it untested. The
 * restructure and the suite therefore land together, and the oracle is replaced by the weaker but
 * real one of verifying every case red against a named mutation of the restructured gate.
 *
 * Run standalone: `node scripts/check-adr-coverage.test.mjs`
 */

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { runGate } from './check-adr-coverage.mjs';

/**
 * Build a throwaway repository root from a `{ 'path/from/root': contents }` map.
 *
 * **Every ADR file written here gets an index row and a roadmap mention by default**, because R1
 * and R3a fire on any ADR lacking either — so a fixture built for R4 would otherwise go red for
 * two unrelated reasons and the case would pass without discriminating. ADR-0131 records a control
 * landing and making twelve unrelated fixtures fail; the defaults are how that is avoided here.
 *
 * `bare` withholds the **roadmap** mention only, and deliberately not the index row: the first
 * version withheld both, so R1's fixture reported `['R1', 'R3a']` and the case would have been
 * satisfied by a gate that had lost R1 entirely, as long as it still had R3a. A helper that makes
 * two assertions fire at once cannot tell you which one is working. R3a has its own fixture, which
 * overwrites the index directly.
 */
function tree({ adrs = [], exempt = {}, roadmapExtra = '', indexExtra = '', bare = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'adr-coverage-'));
  mkdirSync(join(root, 'docs/adr'), { recursive: true });
  mkdirSync(join(root, 'scripts'), { recursive: true });

  for (const id of adrs) writeFileSync(join(root, `docs/adr/${id}-fixture.md`), `# ADR-${id}\n`);

  const cited = adrs.filter((id) => !bare.includes(id));
  writeFileSync(
    join(root, 'docs/ROADMAP.md'),
    `# Roadmap\n\n${cited.map((id) => `- ADR-${id} ships.`).join('\n')}\n${roadmapExtra}\n`,
  );
  writeFileSync(
    join(root, 'docs/adr/README.md'),
    `# Index\n\n${adrs.map((id) => `| [${id}](${id}-fixture.md) | Fixture |`).join('\n')}\n${indexExtra}\n`,
  );
  writeFileSync(join(root, 'scripts/adr-coverage.json'), JSON.stringify({ exempt }, null, 2));
  return root;
}

/** Run the gate silently and return `{ code, problems, summary }`. */
function gate(root) {
  const original = process.stdout.write.bind(process.stdout);
  // @ts-expect-error — deliberately silencing the gate's own output for the duration of one run.
  process.stdout.write = () => true;
  try {
    return runGate(root);
  } finally {
    process.stdout.write = original;
  }
}

const ids = (result) => result.problems.map((p) => p.split(':')[0]);

let run = 0;
const roots = [];
const it = (what, fn) => {
  run += 1;
  try {
    fn();
  } catch (err) {
    process.stdout.write(`  ✗ ${what}\n    ${err.message}\n`);
    process.exitCode = 1;
  }
};
const make = (opts) => {
  const root = tree(opts);
  roots.push(root);
  return root;
};

// ── R1, and its pinned positive case ───────────────────────────────────────────────────────────
it('an ADR absent from the roadmap and unexempt FAILS (R1)', () => {
  // Mutation: delete the `!cited && reason === undefined` branch.
  const r = gate(make({ adrs: ['0001', '0002'], bare: ['0002'] }));
  assert.equal(r.code, 1);
  assert.deepEqual(ids(r), ['R1']);
});

it('the same ADR PASSES once exempt with a reason, and FAILS on an empty one (R1-negative)', () => {
  // **The pinned positive case (ADR-0093).** Without it R1 above passes equally against a gate
  // that fails every ADR it sees — the shape that let ADR-0108's census go green having matched
  // zero files. The empty-reason half is the second limb: ADR-0136 records the licence gate's
  // "a blank exemption reason admits nothing" rule having no test at all.
  const ok = gate(make({ adrs: ['0001', '0002'], bare: ['0002'], exempt: { '0002': 'tooling' } }));
  assert.equal(ok.code, 0, `expected a pass, got: ${ok.problems.join(' | ')}`);

  const blank = gate(make({ adrs: ['0001', '0002'], bare: ['0002'], exempt: { '0002': '' } }));
  assert.equal(blank.code, 1, 'an exemption with no reason must not admit an ADR');
});

// ── R2 ─────────────────────────────────────────────────────────────────────────────────────────
it('an exemption for an ADR that IS cited FAILS (R2)', () => {
  // Mutation: delete the `cited && reason !== undefined` branch.
  const r = gate(make({ adrs: ['0001'], exempt: { '0001': 'tooling' } }));
  assert.equal(r.code, 1);
  assert.deepEqual(ids(r), ['R2']);
});

// ── R3, both directions ────────────────────────────────────────────────────────────────────────
it('an ADR file with no index row FAILS (R3a)', () => {
  // Mutation: delete the `!index.includes(...)` loop.
  const root = make({ adrs: ['0001', '0002'] });
  writeFileSync(
    join(root, 'docs/adr/README.md'),
    '# Index\n\n| [0001](0001-fixture.md) | Fixture |\n',
  );
  const r = gate(root);
  assert.equal(r.code, 1);
  assert.deepEqual(ids(r), ['R3a']);
});

it('an index row with no file FAILS (R3b)', () => {
  // Mutation: delete the `index.matchAll(...)` loop.
  const r = gate(make({ adrs: ['0001'], indexExtra: '| [0999](0999-ghost.md) | Ghost |' }));
  assert.equal(r.code, 1);
  assert.deepEqual(ids(r), ['R3b']);
});

// ── R4 ─────────────────────────────────────────────────────────────────────────────────────────
it('an exemption naming a non-existent ADR FAILS (R4)', () => {
  // Mutation: delete the `for (const id of exempt.keys())` loop.
  const r = gate(make({ adrs: ['0001'], exempt: { '0999': 'gone' } }));
  assert.equal(r.code, 1);
  assert.deepEqual(ids(r), ['R4']);
});

// ── The verdict itself ─────────────────────────────────────────────────────────────────────────
it('a clean tree PASSES, and its summary names the counts', () => {
  const r = gate(make({ adrs: ['0001', '0002', '0003'] }));
  assert.equal(r.code, 0, `expected a pass, got: ${r.problems.join(' | ')}`);
  assert.match(r.summary, /3 of 3 ADRs cited/);
});

it('an empty population FAILS rather than reporting OK over nothing', () => {
  // **The defect this replaces was live.** Every loop in the gate was `for (… of adrs)`, so a
  // roster of zero printed `ADR coverage OK (0 of 0 …)` and exited 0 — a green gate that had
  // checked nothing, which is ADR-0093's shape inside the gate whose five siblings all use
  // `report()`'s refusal. Mutation: pass `population: null` from `runGate`.
  const r = gate(make({ adrs: [] }));
  assert.equal(r.code, 1, 'a gate with nothing to check must not say OK');
});

// ── The control: the real repository ───────────────────────────────────────────────────────────
it('the real estate passes, and the population is a floor rather than a window', () => {
  // A one-sided bound. `check-spec-status.test.mjs` records the cost of the other kind: a
  // decade-wide window that fails on ordinary correct growth for a reason unrelated to any defect
  // the gate exists to catch — ADR-0076 Class 1 written into a test. M0 measured 146 ADR files on
  // 2026-09-19; this fails only if the gate ever stops seeing most of the estate.
  const r = gate(resolve(import.meta.dirname, '..'));
  assert.equal(r.code, 0, `the real estate is not clean: ${r.problems.join(' | ')}`);
  const total = Number(/of (\d+) ADRs cited/.exec(r.summary)?.[1]);
  assert.ok(Number.isFinite(total), `unparseable summary: ${r.summary}`);
  assert.ok(total >= 146, `the gate reads ${total} ADRs; M0 measured 146`);
});

for (const root of roots) rmSync(root, { recursive: true, force: true });

process.stdout.write(
  process.exitCode === 1
    ? `check-adr-coverage: FAILED (${run} cases)\n`
    : `check-adr-coverage: ${run} cases OK\n`,
);
