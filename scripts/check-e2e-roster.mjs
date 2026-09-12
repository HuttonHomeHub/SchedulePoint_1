// @ts-check
/**
 * **`check:e2e-roster` — CI runs the end-to-end suites the repository declares, and no others.**
 *
 * `docs/specs/ci-sharding/` Milestone 1. It closes a hole that exists **today**, before any
 * sharding: nothing in this repository asserts that `.github/workflows/ci.yml`'s 44 web steps match
 * `apps/web/package.json`'s 44 scripts. They agree, by hand, as of 2026-09-11 — and a suite added
 * without a CI step is invisible in exactly the way that matters, because the thing it was written
 * to catch simply never runs and every check stays green.
 *
 * **Why the existing gates do not cover this.** `check:ci-roster` reads root `check:*` gates and
 * stops there. `check:counts` counts `e2e-*` **directories**, which is a different quantity: two
 * suites share `./e2e-account`, so that count can be right while a suite is unwired. Neither can
 * see this, in either direction.
 *
 * **This ships before the shards, deliberately** — the roster gate lands before the roster gets more
 * complicated (ADR-0136's ordering), because the shard assignment is going to rest on it.
 *
 * Four risks, each a recorded near-miss of a sibling gate rather than a hypothetical:
 *
 *   1. **A suite named only in a comment counts as wired.** Comments are stripped before matching,
 *      exactly as `check-ci-roster.mjs:136` does — that gate's docblock records the naive version
 *      reporting a deliberately-absent gate as covered, by reading the sentence documenting its
 *      absence.
 *   2. **A `#` inside a quoted string makes naive stripping eat real content.** The gate refuses to
 *      judge and says so (the `check-ci-roster.mjs:119-133` R8 precedent). A gate that quietly
 *      starts misreading its subject is the failure this whole file is about.
 *   3. **An empty population passes every set assertion.** Asserted non-empty (ADR-0093).
 *   4. **Matching on step titles rather than the commands they run.** Every match here is on a
 *      `--filter @repo/<workspace> test:e2e[:<suite>]` invocation. A title is prose; it gets
 *      reworded, and it is not what runs.
 *
 * **E4 and E5 — the shard assertions — are deliberately absent until there are shards** (Milestone
 * 3). A gate half of which cannot be exercised on the day it lands is half a gate.
 *
 * **Nothing here asserts a wall-clock time**, and the projection it prints is a projection rather
 * than a bar: `docs/specs/ci-sharding/feature-spec.md` §1.4 forbids a duration assertion anywhere in
 * this epic, because five samples of the same job span 40–47 minutes and the two slowest changed no
 * test at all.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { report } from './lib/doc-register.mjs';

const NAME = 'check:e2e-roster';

/**
 * Suite seconds one web shard may hold before the web side takes the critical path back.
 *
 * Derived, not chosen: the API job measured 690 s end to end (499 s API e2e + 141 s pairwise + 50 s
 * setup) and a web shard pays 97 s of fixed cost (setup + browser install), so `690 − 97 = 593`.
 * **Printed, never asserted** — see the summary below.
 */
const SHARD_BUDGET_SECONDS = 593;

/** The gate's own source, so the CLI guard below matches what the suite imports. */
export const SELF = 'scripts/check-e2e-roster.mjs';

/** The two workspaces that own end-to-end suites, and the scripts each is allowed to declare. */
const WORKSPACES = [
  { filter: '@repo/web', pkg: 'apps/web/package.json' },
  { filter: '@repo/api', pkg: 'apps/api/package.json' },
];

/**
 * Every `test:e2e` / `test:e2e:*` script a `package.json` declares.
 *
 * The base `test:e2e` is included on purpose. It is the suite covering the **shipped default** —
 * the one `scripts/e2e-local.sh` could not run for months because its target mapping assumed every
 * suite had a suffix, which is how the journey covering the default became the one thing the
 * documented pre-push gate could not exercise.
 */
export function declaredSuites(pkgJson) {
  return Object.keys(pkgJson.scripts ?? {})
    .filter((name) => name === 'test:e2e' || name.startsWith('test:e2e:'))
    .sort();
}

/**
 * Split a workflow into `{ name, body }` per job, so a rule can be scoped to the job it is about.
 *
 * Needed because E4 asks a question about **the matrix job** rather than about the file: a step in
 * `e2e-api` must NOT carry a shard condition, and a step in `e2e-web` must. Without the split the
 * gate would have to assume which workspace is sharded, which is exactly the restatement E5's own
 * risk note warns against.
 */
export function jobsIn(stripped) {
  const jobsAt = stripped.indexOf('\njobs:\n');
  if (jobsAt < 0) return [];
  const body = stripped.slice(jobsAt);
  const starts = [...body.matchAll(/\n {2}([a-z][a-z0-9-]*):\n/g)];
  return starts.map((m, i) => ({
    name: m[1],
    body: body.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : undefined),
  }));
}

/**
 * The shard values a job's matrix declares, or `null` when it declares none.
 *
 * **Read from the workflow, never restated in this file.** Hard-coding `[1, 2, 3, 4]` would mean
 * that changing the shard count makes this gate quietly WRONG rather than red — the same failure
 * `check-ci-roster.mjs` avoids by reading the advisory set out of `prepush.sh` rather than keeping
 * its own copy.
 */
export function shardsOf(jobBody) {
  const m = /matrix:\s*\n\s+shard:\s*\[([^\]]*)\]/.exec(jobBody);
  if (m === null) return null;
  return m[1]
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/**
 * Every end-to-end invocation `ci.yml` actually makes, as `{ workspace, script }`.
 *
 * Matched on the command, never on the step's `name:`.
 *
 * **The `(?![:\w-])` guard is load-bearing, and its first docblock said why incorrectly.** It does
 * NOT protect against `test:e2e` matching inside `test:e2e:minimap` — the optional group is greedy,
 * so that case is already handled and removing the guard changes nothing about it. The claim was
 * asserted rather than run, and the mutation sweep caught it: with the guard deleted, every case in
 * the suite still passed.
 *
 * What it actually protects is a **neighbouring script whose name merely begins the same way**:
 * `pnpm --filter @repo/web test:e2e-smoke` (a hyphen, not a colon) and `test:e2extra` both yield a
 * bare `test:e2e` without it. The base suite would then read as wired by a step that runs something
 * else entirely — and the base suite is precisely the one whose absence goes unnoticed, because it
 * has no flag in its name to miss.
 */
export function invocationsIn(stripped) {
  return [
    ...stripped.matchAll(
      /--filter\s+(@repo\/\w+)\s+(?:run\s+)?(test:e2e(?::[a-z0-9-]+)?)(?![:\w-])/g,
    ),
  ].map((m) => ({ workspace: m[1], script: m[2] }));
}

/**
 * Each end-to-end step in a job body, paired with the shard its `if:` names (or `null`).
 *
 * The `if:` is read from the SAME step — anchored between this step's `- name:` and its `run:` —
 * rather than by searching backwards from the command, because a backwards search finds the
 * PREVIOUS step's condition when this one has none, which turns E4 from an assertion into a coin
 * toss that happens to be right most of the time.
 *
 * **The lookahead sits before the indent, and that took two attempts.** The middle group must not
 * run past the end of its own step; if it does, a conditioned step followed by an unconditioned one
 * returns a SINGLE result carrying the first step's shard and the second step's script, and E4 then
 * reports nothing wrong about a suite that runs on every shard.
 *
 * The first fix was `[ \t]+(?!run:|- )`, which does not work and looks like it does: `[ \t]+` is
 * greedy but backtracks, so it gives back one space, the lookahead then sits on a space rather than
 * on `-`, and the line is consumed anyway. Written as `(?![ \t]*(?:run:|- ))` the test is made at
 * the line's start and there is nothing to backtrack into.
 *
 * Both versions were caught by the E4 fixture failing, never by reading the expression — and the
 * gate had already printed a correct-looking summary against the real workflow with both bugs
 * present, because the real workflow has a condition on every step and so cannot exhibit either.
 */
export function stepsIn(jobBody) {
  return [
    ...jobBody.matchAll(
      /- name:[^\n]*\n(?<mid>(?:(?![ \t]*(?:run:|- ))[^\n]*\n)*)[ \t]+run:[^\n]*--filter\s+(?<ws>@repo\/\w+)\s+(?:run\s+)?(?<script>test:e2e(?::[a-z0-9-]+)?)(?![:\w-])/g,
    ),
  ].map((m) => ({
    workspace: m.groups?.ws ?? '',
    script: m.groups?.script ?? '',
    shard: /matrix\.shard\s*==\s*(\w+)/.exec(m.groups?.mid ?? '')?.[1] ?? null,
  }));
}

/**
 * The projected shard totals, or `null` when there is nothing to project from.
 *
 * **A suite with no recorded duration is charged the LARGEST recorded duration, never zero**, and is
 * counted as estimated. A zero would let a new suite pass by being invisible — ADR-0093's shape one
 * layer down, where a green number cannot be told from an absent one.
 */
export function project(suites, seconds) {
  const known = Object.values(seconds ?? {});
  if (known.length === 0) return null;
  const worst = Math.max(...known);
  let estimated = 0;
  let total = 0;
  for (const suite of suites) {
    const s = seconds[suite];
    if (s === undefined) estimated += 1;
    total += s ?? worst;
  }
  return { total, estimated };
}

/** Run the whole gate against a repository root, and return the exit code. */
export function runGate(root) {
  const read = (p) => readFileSync(join(root, p), 'utf8');
  const problems = [];

  /** What the repository declares: a `Map<script, workspace>` plus a flat set per workspace. */
  const declared = new Map();
  for (const { filter, pkg } of WORKSPACES) {
    let parsed;
    try {
      parsed = JSON.parse(read(pkg));
    } catch {
      problems.push(
        `${pkg} could not be read or parsed, so nothing below is a statement about it.`,
      );
      return report({ name: NAME, problems, population: 0 });
    }
    for (const script of declaredSuites(parsed))
      declared.set(`${filter} ${script}`, { filter, script });
  }

  let workflow;
  try {
    workflow = read('.github/workflows/ci.yml');
  } catch {
    // Fail closed and say so. An unreadable workflow would otherwise make every declared suite look
    // unwired — a true-sounding flood of findings with one real cause.
    problems.push(
      '.github/workflows/ci.yml could not be read, so nothing below is a statement about CI.',
    );
    return report({ name: NAME, problems, population: declared.size });
  }

  // **E7 — refuse rather than misread.** Line-based `#` stripping is correct only while no `#` sits
  // inside a quoted string. That holds today and is not a property anybody maintains.
  const lines = workflow.split('\n');
  const quoted = lines.findIndex((line) => /(['"])[^'"]*#[^'"]*\1/.test(line));
  if (quoted >= 0) {
    problems.push(
      `.github/workflows/ci.yml line ${quoted + 1} has a '#' inside a quoted string, so stripping ` +
        'comments by line would eat real content. This gate refuses to guess: quote it ' +
        'differently, or teach this check to parse YAML properly.',
    );
    return report({ name: NAME, problems, population: declared.size });
  }

  const stripped = workflow.replace(/#[^\n]*/g, '');
  const invocations = invocationsIn(stripped);

  /** How many CI steps run each declared key. */
  const runCount = new Map([...declared.keys()].map((k) => [k, 0]));
  for (const { workspace, script } of invocations) {
    const key = `${workspace} ${script}`;
    if (runCount.has(key)) {
      runCount.set(key, runCount.get(key) + 1);
    } else {
      // **E2 — CI names a suite that does not exist.** Almost always a rename that reached
      // `package.json` and not the workflow, which fails as a red CI step rather than silently; the
      // value of catching it here is that it fails locally, before the 40-minute round trip.
      problems.push(
        `.github/workflows/ci.yml runs '${workspace} ${script}', which that workspace does not ` +
          'declare. Either the script was renamed and the workflow was not, or the step is a typo.',
      );
    }
  }

  for (const [key, count] of runCount) {
    if (count === 0) {
      // **E1 — declared, never run.** Both remedies are named, because the right one depends on
      // what the suite is for and the gate cannot know that.
      problems.push(
        `'${key}' is declared but no CI step runs it, so whatever it proves is proved nowhere ` +
          'that blocks a merge. Either add a step to .github/workflows/ci.yml, or delete the ' +
          'script if the suite is gone.',
      );
    } else if (count > 1) {
      // **E3 — run twice.** Today that is wasted minutes on the critical path; once the shards land
      // it is also a suite whose failures appear under two different check runs.
      problems.push(`'${key}' is run by ${count} CI steps; it should be run by exactly one.`);
    }
  }

  // ---- E4 / E5 — the shard dimension. Deliberately absent while there were no shards to assert
  // about; present now that Milestone 3 has created some.
  for (const job of jobsIn(stripped)) {
    const shards = shardsOf(job.body);
    for (const step of stepsIn(job.body)) {
      if (shards === null) {
        // A job with no matrix must not carry shard conditions: `matrix.shard` is undefined there,
        // so the condition can never be true and the suite silently never runs.
        if (step.shard !== null) {
          problems.push(
            `job '${job.name}' declares no matrix, but its '${step.script}' step is conditioned ` +
              `on shard ${step.shard}. That condition can never be true, so the suite never runs.`,
          );
        }
        continue;
      }
      if (step.shard === null) {
        // **E4 — a suite step in a sharded job with no condition runs on EVERY shard.** Nothing
        // else would notice. The run is green; it is merely four times the work, and the wall
        // clock the shards exist to cut gets paid anyway.
        problems.push(
          `job '${job.name}' is sharded, but its '${step.script}' step declares no shard ` +
            `condition, so it runs on all ${String(shards.length)} shards.`,
        );
      } else if (!shards.includes(step.shard)) {
        // **E5 — a condition naming a shard the matrix does not declare never fires.** The suite
        // stops running and every check stays green, which is the exact silence this gate exists
        // to break.
        problems.push(
          `job '${job.name}' runs '${step.script}' on shard ${step.shard}, which its matrix does ` +
            `not declare (it declares ${shards.join(', ')}), so that suite never runs.`,
        );
      }
    }
  }

  // The projection, printed and never asserted. Absent durations print as "unavailable" rather than
  // as a zero, because a zero reads as a measurement.
  let durations = null;
  try {
    durations = JSON.parse(read('scripts/e2e-durations.json'));
  } catch {
    durations = null;
  }
  const web = [...declared.values()].filter((d) => d.filter === '@repo/web').map((d) => d.script);
  const api = [...declared.values()].filter((d) => d.filter === '@repo/api').map((d) => d.script);
  const projected = project(web, durations?.seconds?.web);
  const provenance = durations
    ? `Durations: run ${durations.run}, ${durations.measured}.`
    : 'Durations unavailable (scripts/e2e-durations.json absent) — no projection.';
  const estimate =
    projected === null
      ? ''
      : ` Web suite time ${projected.total} s` +
        (projected.estimated > 0
          ? ` (${projected.estimated} estimated at the worst measured)`
          : '') +
        '.';

  // **Per-shard totals, printed and never asserted** — the balance is a projection from committed
  // durations, and a projection is only as fresh as its durations, so asserting on it would turn a
  // stale file into a false failure. There is slack to absorb a poor packing anyway: the budget is
  // 593 s per shard before the web side takes the critical path back from `e2e-api`, against a
  // perfect four-way pack of 512 s. The assignment has to be not-terrible, not optimal.
  let balance = '';
  const sharded = jobsIn(stripped).find((j) => shardsOf(j.body) !== null);
  if (sharded !== undefined && durations !== null) {
    const shards = shardsOf(sharded.body) ?? [];
    const known = Object.values(durations.seconds?.web ?? {});
    const worst = known.length > 0 ? Math.max(...known) : 0;
    const totals = shards.map((shard) =>
      stepsIn(sharded.body)
        .filter((step) => step.shard === shard && step.workspace === '@repo/web')
        .reduce((sum, step) => sum + (durations.seconds?.web?.[step.script] ?? worst), 0),
    );
    balance = ` Shards: ${totals.map((t) => `${String(t)} s`).join('/')} (budget ${String(SHARD_BUDGET_SECONDS)} s).`;
  }

  return report({
    name: NAME,
    problems,
    // The population. An empty roster satisfies every loop above perfectly, and a green run could
    // not then tell "every suite is wired" from "the derivation is broken" (ADR-0093, E6).
    population: declared.size,
    summary:
      `${web.length} web + ${api.length} API end-to-end suites, each run by exactly one CI step.` +
      `${estimate}${balance} ${provenance}`,
  });
}

// The CLI. Guarded so importing this module for the suite does not exit the process.
if (
  resolve(process.argv[1] ?? '') === resolve(new URL(SELF, new URL('..', import.meta.url)).pathname)
) {
  process.exit(runGate(new URL('..', import.meta.url).pathname));
}
