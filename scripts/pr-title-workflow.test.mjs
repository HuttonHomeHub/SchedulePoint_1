// @ts-check
/**
 * **The PR-title workflow's three security properties, asserted rather than commented.**
 *
 * `docs/specs/delivery-gates/` M2, Task 2.2. Each of these is a one-word edit away from being
 * wrong, each would still pass every other gate in this repository, and two of them turn a
 * title-reading workflow into a token-exfiltration path:
 *
 * - **`pull_request`, never `pull_request_target`.** The latter runs with a writable token in the
 *   base repository's context against the fork's head.
 * - **`permissions: {}`.** It reads the event payload it was handed and needs nothing.
 * - **No `${{ }}` inside a `run:` block.** Interpolation happens before bash parses the script, so
 *   a title containing `"; curl …` would execute. The title must arrive through `env:`.
 *
 * And one that is not about security but about whether the check is usable at all:
 *
 * - **`edited` in the trigger types.** Without it a corrected title cannot clear the check except
 *   by pushing a dummy commit, which teaches people to ignore it.
 *
 * Run standalone: `node scripts/pr-title-workflow.test.mjs`
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const WORKFLOW = '.github/workflows/pr-title.yml';
const raw = readFileSync(new URL(`../${WORKFLOW}`, import.meta.url), 'utf8');

/**
 * Comments stripped, for the reason `check-ci-roster.mjs` strips them: this workflow's own header
 * names every shape it forbids, so a scan that reads comments finds all of them. Four gates in this
 * repository have matched their own prose.
 *
 * **Only WHOLE-LINE comments, and that is a correction rather than a preference.** The first
 * version stripped `#` to end of line anywhere, and silently ate the assertion's own subject: the
 * workflow's shell line contains `(#${PR_NUMBER})`, so everything from that `#` onwards vanished
 * and the suffix assertion went red against a correct file.
 *
 * That is precisely the hazard `check-ci-roster.mjs`'s R8 refuses to guess about — a `#` inside a
 * quoted string — arriving one file over, in the same session, on the rule written to avoid it.
 * A `#` mid-line inside a YAML block scalar is not a comment at all; only a line whose first
 * non-space character is `#` is.
 */
const body = raw
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

let failures = 0;
const cases = [];
const it = (name, fn) => cases.push([name, fn]);

it('the workflow exists and has a job', () => {
  // The pinned positive. Every assertion below is satisfied perfectly by an empty file.
  assert.match(body, /\bjobs:/);
  assert.match(body, /runs-on:/);
});

it('triggers on pull_request, never pull_request_target', () => {
  assert.doesNotMatch(body, /pull_request_target/, 'pull_request_target is forbidden here');
  assert.match(body, /on:\s*\n\s*pull_request:/);
});

it('includes `edited`, without which a fixed title cannot clear the check', () => {
  assert.match(body, /types:\s*\[[^\]]*\bedited\b/);
});

it('declares an empty permissions block', () => {
  assert.match(body, /permissions:\s*\{\}/);
});

it('never interpolates into a run: block', () => {
  /**
   * The injection rule, checked structurally. `${{ }}` is legal in `env:` and in `concurrency:`,
   * where the value never reaches a shell as source text; it is not legal inside a `run:` script.
   *
   * Verified red by moving the title into the `run:` line as `${{ github.event.pull_request.title }}`.
   */
  const runBlocks = [...body.matchAll(/^\s*run: \|\n((?:\s{2,}.*\n?)*)/gm)].map((m) => m[1]);
  assert.ok(runBlocks.length > 0, 'no run: block found — the scan would pass over nothing');
  for (const block of runBlocks) {
    assert.doesNotMatch(
      block,
      /\$\{\{/,
      'a run: block interpolates a GitHub expression; pass it through env: instead',
    );
  }
  // Single-line `run:` steps too.
  for (const [, line] of body.matchAll(/^\s*run: (?!\|)(.*)$/gm)) {
    assert.doesNotMatch(line, /\$\{\{/, `a single-line run: interpolates an expression: ${line}`);
  }
});

it('checks the title WITH the squash suffix, not the bare title', () => {
  /**
   * The measured reason this workflow exists in the shape it does: a 94-character title passes
   * commitlint and lands at 101. If this assertion ever goes red because the suffix was dropped,
   * the check is green over commits it does not cover.
   */
  // **Asserted on the SUBJECT assignment, not on the file.** The first version matched the suffix
  // anywhere in the workflow — and the failure message a few lines below echoes
  // `' (#${PR_NUMBER})'` as prose, so deleting the suffix from the actual subject left it green.
  // A scan that matches a file's own explanation of what it does is this repository's
  // most-recorded gate defect, and this is the fifth instance.
  const subject = /^\s*SUBJECT="([^"]*)"/m.exec(body);
  assert.ok(subject, 'no SUBJECT="…" assignment found — the scan would pass over nothing');
  assert.match(
    subject[1],
    /\(#\$\{PR_NUMBER\}\)\s*$/,
    `the checked subject must end with the squash suffix; it is: ${subject[1]}`,
  );
});

for (const [name, fn] of cases) {
  try {
    fn();
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (error) {
    failures += 1;
    process.stdout.write(`  ✗ ${name}\n    ${error instanceof Error ? error.message : error}\n`);
  }
}
process.stdout.write(
  `pr-title workflow: ${failures === 0 ? 'OK' : 'FAIL'} — ${cases.length - failures}/${cases.length} passed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
