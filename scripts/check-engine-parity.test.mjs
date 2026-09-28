// @ts-check
/**
 * Fixtures for `check-engine-parity.mjs` — **every case names the mutation that made it red.**
 *
 * ADR-0110 D5: a gate is finished when it has been made to fail by the defect it was written for.
 * Each case builds a throwaway git repository — a `main` commit, then a branch commit carrying the
 * change under test — and runs the REAL `runGate` against it with `main` as the base, `report()`
 * included. A suite that asserted against a private mirror of the three limbs would stay green
 * through the regression it is named for (the `check-ci-roster.test.mjs` precedent).
 *
 * The six numbered cases are the plan's mutation list (`docs/specs/zero-duration-task/
 * implementation-plan.md` M0-T7); the rest pin the gate's edges and the stripper's two recorded
 * blind-spot forms.
 *
 * Run standalone: `node scripts/check-engine-parity.test.mjs`
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { ENGINE_DIR, runGate } from './check-engine-parity.mjs';

const ENGINE = ENGINE_DIR;

/** #384 exactly as `docs/TECH_DEBT.md:11712` writes it: `###`, column 0, inside Detailed items. */
const registerWith = (status) => `# Technical debt register

## Principles for managing debt

Rows are \`### <number>. <title>\`.

## Detailed items

### 383. A neighbouring row

**Status:** open · **Verified:** 2026-09-23

Body.

### 384. A zero-duration task and a finish milestone at the same instant print different dates

**Status:** ${status} · **Verified:** 2026-09-23 · **Raised:** 2026-09-23 (ADR-0155) ·
**Size:** S · **Owner:** product

ADR-0155 dates a finish milestone by the day that closes at its instant.

## Closed numbers

| # | Title | Closed |
| --- | --- | --- |
| 1 | Old | 2026-01-01 |
`;

const REGISTER_WITHOUT_384 = registerWith('open').replace(
  /### 384\.[\s\S]*?(?=## Closed numbers)/,
  '',
);

const DECLARATION = JSON.stringify({ active: true, epic: 'fixture-epic', debtRow: 384 });

const SPEC = `import { computeSchedule } from './compute';

/**
 * A docblock that says something.
 */
describe('zero task', () => {
  it('reads Monday', () => {
    expect(computeSchedule().finish).toBe('2026-01-12');
  });
});
`;

const BASE_FILES = {
  [`${ENGINE}compute.ts`]: 'export function computeSchedule() {\n  return { finish: 1 };\n}\n',
  [`${ENGINE}compute.zero-task.spec.ts`]: SPEC,
  'docs/TECH_DEBT.md': registerWith('open'),
  'scripts/engine-parity.json': DECLARATION,
};

const git = (root, ...args) =>
  execFileSync(
    'git',
    [
      '-c',
      'user.email=fixture@example.test',
      '-c',
      'user.name=Fixture',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );

function write(root, files) {
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    if (body === null) {
      unlinkSync(full);
      continue;
    }
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
}

/**
 * A repository whose `main` holds `base`, with a branch commit applying `change` on top.
 * `null` as a value deletes that path in the branch commit.
 */
function repo(change, base = BASE_FILES) {
  const root = mkdtempSync(join(tmpdir(), 'engine-parity-'));
  git(root, 'init', '-q', '-b', 'main');
  write(root, base);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  git(root, 'checkout', '-q', '-b', 'feature');
  write(root, change);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '--allow-empty', '-m', 'change');
  return root;
}

/** Run the gate with its output captured, so a case can assert on what it says as well as its code. */
function run(root, base = 'main') {
  const lines = [];
  const write_ = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => (lines.push(String(s)), true);
  try {
    return { code: runGate({ root, base }), out: lines.join('') };
  } finally {
    process.stdout.write = write_;
  }
}

let failures = 0;
const cases = [];
const it = (name, fn) => cases.push([name, fn]);

// ── The plan's six mutations ─────────────────────────────────────────────────────────────────────

it('(1) an expect value changed in the SAME commit as a docblock edit FAILS, naming the file', () => {
  // The reviewer's case: a comment edit is the cover a behaviour change hides behind. Verified red
  // against a limb 2 that compares only whether comments changed (normaliseSpec returning '').
  const root = repo({
    [`${ENGINE}compute.zero-task.spec.ts`]: SPEC.replace(
      'A docblock that says something.',
      'A docblock that now says something else.',
    ).replace("'2026-01-12'", "'2026-01-09'"),
  });
  const { code, out } = run(root);
  assert.equal(code, 1, out);
  assert.match(
    out,
    /limb 2: apps\/api\/src\/modules\/schedule\/engine\/compute\.zero-task\.spec\.ts/,
  );
  rmSync(root, { recursive: true, force: true });
});

it('(2) a docblock-only edit to an existing spec PASSES', () => {
  // Verified red against a limb 2 that compares raw text (stripComments bypassed): the docblock
  // edit is then a difference. It also grows the docblock by a line, which is why blank lines are
  // dropped before comparing.
  const root = repo({
    [`${ENGINE}compute.zero-task.spec.ts`]: SPEC.replace(
      ' * A docblock that says something.\n',
      ' * A docblock that is corrected,\n * over two lines now.\n',
    ).replace("describe('zero task'", "// a new line comment\ndescribe('zero task'"),
  });
  const { code, out } = run(root);
  assert.equal(code, 0, out);
  assert.match(out, /1 existing spec\(s\) compared/);
  rmSync(root, { recursive: true, force: true });
});

it('(3) a one-character change to a non-test engine file FAILS', () => {
  // Verified red against a gate that routes every changed path through limb 2 (limb 1 removed):
  // `compute.ts` is not a spec, so it would be skipped as "not existing-spec" and pass.
  const root = repo({
    [`${ENGINE}compute.ts`]: 'export function computeSchedule() {\n  return { finish: 2 };\n}\n',
  });
  const { code, out } = run(root);
  assert.equal(code, 1, out);
  assert.match(out, /limb 1: apps\/api\/src\/modules\/schedule\/engine\/compute\.ts differs/);
  rmSync(root, { recursive: true, force: true });
});

it('(4) the declared row ABSENT from the register FAILS with the stale-declaration message', () => {
  // Verified red against a gate without limb 3. Note the diff holds no engine change at all: limb 3
  // is unconditional on the diff, which is the property that makes a stale declaration loud.
  const root = repo({ 'docs/TECH_DEBT.md': REGISTER_WITHOUT_384 });
  const { code, out } = run(root);
  assert.equal(code, 1, out);
  assert.match(
    out,
    /limb 3: .*#384 is not an open detailed row\. The declaration has outlived its epic/,
  );
  rmSync(root, { recursive: true, force: true });
});

it('(5) a NEW engine spec file PASSES — new cases belong in a new file', () => {
  // Verified red against a gate that compares a spec absent at the merge base as if it were
  // present (the exemption removed): `git show main:<new file>` then fails and the gate reports it.
  const root = repo({
    [`${ENGINE}compute.zero-task-date.spec.ts`]: SPEC.replace('reads Monday', 'new'),
  });
  const { code, out } = run(root);
  assert.equal(code, 0, out);
  assert.match(out, /1 changed since main, 0 existing spec\(s\) compared/);
  rmSync(root, { recursive: true, force: true });
});

it('(6) #384 in its REAL form (`###`, inside Detailed items) PASSES limb 3', () => {
  // Verified red against a `sections(md, 2)`-only lookup (registerSections narrowed to level 2):
  // the `###` row is then invisible and the gate calls its own declaration stale — on the commit
  // that introduced it, which is what devops-reviewer O1 predicted.
  const root = repo({});
  const { code, out } = run(root);
  assert.equal(code, 0, out);
  rmSync(root, { recursive: true, force: true });
});

it('(6b) the same row with status `deferred` FAILS limb 3 — open means `open`', () => {
  // Verified red against an `openDetailedRow` that returns the row whatever its status.
  const root = repo({ 'docs/TECH_DEBT.md': registerWith('deferred') });
  const { code, out } = run(root);
  assert.equal(code, 1, out);
  assert.match(out, /limb 3:/);
  rmSync(root, { recursive: true, force: true });
});

// ── The pinned positive case, and the edges ──────────────────────────────────────────────────────

it('an ACTIVE declaration over a diff with no engine change reports "checked N files", never "skipped"', () => {
  // A gate that cannot fail. Verified red against a gate that returns early with "skipped" when the
  // engine diff is empty.
  const root = repo({ 'README.md': 'unrelated\n' });
  const { code, out } = run(root);
  assert.equal(code, 0, out);
  assert.match(out, /check:engine-parity: OK\. checked 2 engine files for "fixture-epic"/);
  assert.doesNotMatch(out, /skipped/);
  rmSync(root, { recursive: true, force: true });
});

it('an INACTIVE declaration is skipped, even over an engine change and a stale row', () => {
  const root = repo({
    'scripts/engine-parity.json': JSON.stringify({ active: false, epic: null, debtRow: 384 }),
    [`${ENGINE}compute.ts`]: 'changed\n',
    'docs/TECH_DEBT.md': REGISTER_WITHOUT_384,
  });
  const { code, out } = run(root);
  assert.equal(code, 0, out);
  assert.match(out, /skipped/);
  rmSync(root, { recursive: true, force: true });
});

it('a deleted existing spec FAILS, and an added non-test file FAILS', () => {
  const root = repo({
    [`${ENGINE}compute.zero-task.spec.ts`]: null,
    [`${ENGINE}__snapshots__/compute.spec.ts.snap`]: 'exports[`x`] = 1;\n',
  });
  const { code, out } = run(root);
  assert.equal(code, 1, out);
  assert.match(
    out,
    /limb 2: .*compute\.zero-task\.spec\.ts existed at the merge base and is deleted/,
  );
  assert.match(out, /limb 1: .*__snapshots__\/compute\.spec\.ts\.snap is added/);
  rmSync(root, { recursive: true, force: true });
});

it('a base that cannot be diffed FAILS loudly rather than passing', () => {
  const root = repo({});
  const { code, out } = run(root, 'no-such-ref');
  assert.equal(code, 1, out);
  assert.match(out, /could not diff against no-such-ref/);
  rmSync(root, { recursive: true, force: true });
});

it('an unreadable declaration FAILS rather than skipping', () => {
  const root = repo({ 'scripts/engine-parity.json': '{ not json' });
  const { code, out } = run(root);
  assert.equal(code, 1, out);
  assert.match(out, /not valid JSON/);
  rmSync(root, { recursive: true, force: true });
});

// ── The stripper's two recorded blind-spot forms: known pass-throughs, pinned ────────────────────
//
// These assert that the gate does NOT see an edit, which is the documented behaviour of
// `stripComments` (scripts/lib/strip-comments.mjs). Each was verified red against a gate that does
// not strip at all — so the day someone makes the stripper string-aware, these two go red and say so.

const STRINGY = `describe('urls', () => {
  it('points somewhere', () => {
    expect(link()).toBe('https://example.test/a');
    expect(text()).toBe('/* start of text');
    expect(1).toBe(1); // */ end
  });
});
`;

it('blind spot 1: an edit after `//` inside a string is invisible to limb 2', () => {
  const base = { ...BASE_FILES, [`${ENGINE}compute.urls.spec.ts`]: STRINGY };
  const root = repo(
    { [`${ENGINE}compute.urls.spec.ts`]: STRINGY.replace('example.test/a', 'example.test/b') },
    base,
  );
  const { code, out } = run(root);
  assert.equal(
    code,
    0,
    `a string-aware stripper would now catch this — update the docblocks. ${out}`,
  );
  rmSync(root, { recursive: true, force: true });
});

it('blind spot 2: an edit between `/*` and `*/` inside a string is invisible to limb 2', () => {
  const base = { ...BASE_FILES, [`${ENGINE}compute.urls.spec.ts`]: STRINGY };
  const root = repo(
    { [`${ENGINE}compute.urls.spec.ts`]: STRINGY.replace('start of text', 'start of TEXT') },
    base,
  );
  const { code, out } = run(root);
  assert.equal(
    code,
    0,
    `a string-aware stripper would now catch this — update the docblocks. ${out}`,
  );
  rmSync(root, { recursive: true, force: true });
});

for (const [name, fn] of cases) {
  try {
    fn();
  } catch (err) {
    failures += 1;
    process.stdout.write(`  ✗ ${name}\n    ${/** @type {Error} */ (err).message}\n`);
  }
}
process.stdout.write(
  failures > 0
    ? `check-engine-parity: FAILED (${failures} of ${cases.length} cases)\n`
    : `check-engine-parity: ${cases.length} cases OK\n`,
);
process.exit(failures > 0 ? 1 : 0);
