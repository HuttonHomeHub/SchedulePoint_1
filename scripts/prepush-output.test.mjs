// @ts-check
/**
 * Tests for what `prepush.sh` prints when a gate does not pass (`docs/TECH_DEBT.md` #276).
 *
 * Each case copies the real `prepush.sh` into a throwaway tree with a stub `package.json` (no-op
 * `lint`/`typecheck`/`test`, plus one `check:*` gate that prints a prepared log and exits with a
 * prepared code). Without `--push` the script calls no git, so no repository is needed. No locale
 * is set, so the marker match runs under whatever CI's default is.
 *
 * **Verified red** against two wrong implementations, by pointing `PREPUSH_SCRIPT` at them: today's
 * `tail -12` fails the row's case, E6's case and the WARN case (the finding is outside the tail);
 * printing the whole log fails the two cases that assert a bound.
 *
 * Run standalone: `node scripts/prepush-output.test.mjs`
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT =
  process.env.PREPUSH_SCRIPT ?? join(dirname(fileURLToPath(import.meta.url)), 'prepush.sh');
const NOOP = 'node -e 0';
const BOUND = 120;

/**
 * Runs the script against one gate that prints `lines` and exits `code`.
 * @param {string} gate @param {string[]} lines @param {number} code
 */
function runGate(gate, lines, code) {
  const root = mkdtempSync(join(tmpdir(), 'prepush-output-'));
  try {
    mkdirSync(join(root, 'scripts'));
    copyFileSync(SCRIPT, join(root, 'scripts/prepush.sh'));
    writeFileSync(join(root, 'log.txt'), `${lines.join('\n')}\n`);
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'stub',
        private: true,
        scripts: { lint: NOOP, typecheck: NOOP, test: NOOP, [gate]: `cat log.txt; exit ${code}` },
      }),
    );
    const r = spawnSync('bash', ['scripts/prepush.sh'], { cwd: root, encoding: 'utf8' });
    const out = `${r.stdout}${r.stderr}`;
    // The gate's own output is the indented block; the verdict lines are not indented.
    const shown = out.split('\n').filter((l) => l.startsWith('        '));
    return { status: r.status, out, shown };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** @param {number} n @param {string} prefix */
const filler = (n, prefix = 'line') => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);

const cases = [];
/** @param {string} name @param {() => void} fn */
const it = (name, fn) => cases.push([name, fn]);

it("shows a chained suite's failing case and its error line, not just the summary", () => {
  const lines = [
    ...filler(4, '  ✓ case'),
    '  ✗ the-failing-case',
    '    expected 1, got 0',
    ...filler(24, '  ✓ case'),
    'FAIL — 29/30 passed',
  ];
  const r = runGate('check:chain', lines, 1);
  assert.match(r.out, /✗ the-failing-case/);
  assert.match(r.out, /expected 1, got 0/);
});

it('shows an early finding in a long log, numbered, with its tail and a reproduce footer', () => {
  const lines = filler(500);
  // pnpm adds its own header lines to the captured log, so the number printed is not 10.
  lines[9] = 'error: counts disagree';
  const r = runGate('check:big', lines, 1);
  assert.match(r.out, /\d+: error: counts disagree/);
  assert.match(r.out, /\d+: line 11\n/);
  assert.match(r.out, /line 500/);
  assert.match(r.out, /run `pnpm check:big` for all of it/);
  assert.match(r.out, / of \d+ lines/);
  assert.ok(r.shown.length <= BOUND, `${r.shown.length} lines shown`);
});

it('bounds the output when every line is a finding', () => {
  const r = runGate(
    'check:flood',
    Array.from({ length: 1000 }, (_, i) => `✗ case ${i}`),
    1,
  );
  assert.ok(r.shown.length <= BOUND, `${r.shown.length} lines shown`);
  assert.match(r.out, /pnpm check:flood/);
});

it('shows an advisory WARN finding that is far from the end, and still exits 0', () => {
  const lines = [...filler(10), 'reconcile pass overdue', ...filler(20)];
  const r = runGate('check:reconcile-due', lines, 2);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /WARN/);
  assert.match(r.out, /reconcile pass overdue/);
});

it('stays silent about a passing gate', () => {
  const r = runGate('check:pass', filler(50), 0);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /ok.*check:pass/);
  assert.doesNotMatch(r.out, /line 1\b/);
});

it('still exits 1 and names the failed gate', () => {
  const r = runGate('check:chain', ['✗ x'], 1);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /FAILED: check:chain/);
});

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
  } catch (e) {
    failed++;
    console.error(`FAIL  ${name}\n${e instanceof Error ? e.message : e}`);
  }
}
if (failed > 0) process.exit(1);
console.log(`prepush-output: ${cases.length} cases ok`);
