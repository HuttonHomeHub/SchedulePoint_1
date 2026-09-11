// @ts-check
/**
 * **The commit-message vocabulary, pinned against the messages that actually occur.**
 *
 * `docs/specs/delivery-gates/` M2, Task 2.1 step 6. The config is a list of strings; a list of
 * strings narrows by one careless edit, and the failure would land on somebody else's pull request
 * as a red gate with no explanation. Every case below is a form this repository has been observed
 * to produce or will produce, and the ones that must FAIL are here so a widening is as visible as
 * a narrowing.
 *
 * **Measured before anything was changed** (Task 2.1, and the figures are the evidence, not an
 * estimate):
 *
 * - `git log --format=%s origin/main | head -100` through the repository's own commitlint:
 *   **96 pass, 4 fail**, and all four on `header-max-length`.
 * - **88 of those 100 subjects end in ` (#N)`** — the squash suffix GitHub appends, which the spec
 *   could only infer and which decides the design below.
 * - The **one open pull request** at the time (`#482`, Dependabot) passes. A failure there would
 *   have been a blocker.
 * - `chore(deps-dev)` — Dependabot's own output for a development bump — **failed** on
 *   `scope-enum`, which is the whole reason CQ-1 exists. It passes now.
 * - An **empty scope** passes: `scope-enum` constrains the scope when present and does not require
 *   one.
 *
 * ## The finding the spec did not anticipate, and what follows from it
 *
 * A PR title of 94 characters passes, and lands on `main` at **101** — because the squash appends
 * ` (#506)`. One of the four historic failures is exactly that shape: legal as a title, illegal as
 * the commit it becomes. So **a PR-title check that validates the title as typed is green while the
 * thing it exists to protect is invalid**, for titles in the 93–100 band.
 *
 * `.github/workflows/pr-title.yml` therefore validates `"<title> (#<number>)"` — the exact string
 * that will land, with the real PR number rather than an allowance for one. The other three
 * historic failures were already over length as bare titles and are caught either way.
 *
 * Run standalone: `node scripts/commitlint-fixtures.test.mjs`
 */
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;

/** Returns true when commitlint accepts the header. */
function accepts(header) {
  try {
    execFileSync('pnpm', ['exec', 'commitlint'], {
      cwd: root,
      input: header,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

/** Every case, and why it is here. */
const MUST_PASS = [
  ['an ordinary feature', 'feat(web): add a recurring job scheduler'],
  ['an empty scope, which the config permits', 'docs: a thing'],
  ['a breaking change', 'feat(api)!: change the envelope'],
  ["Dependabot's production bump", 'chore(deps): bump zod from 4.1.0 to 4.1.1'],
  [
    "Dependabot's DEVELOPMENT bump — the CQ-1 case, red before 2026-09-11",
    'chore(deps-dev): bump vitest from 4.1.10 to 4.1.11',
  ],
  ["Dependabot's action bump", 'ci(deps): bump actions/checkout from 4 to 5'],
  [
    'the real open PR at the time of measurement (#482)',
    'chore(deps): bump the nestjs group across 1 directory with 6 updates',
  ],
  ["the release PR's constant, which no check ever sees", 'chore(release): version packages'],
  ['exactly at the 100-character limit', `feat(web): ${'x'.repeat(89)}`],
];

const MUST_FAIL = [
  ['a type outside the vocabulary', 'wibble(web): do a thing'],
  ['a scope outside the vocabulary', 'feat(frontend): do a thing'],
  ['an upper-case scope — scope-case is kebab', 'feat(Web): do a thing'],
  ['a trailing full stop', 'feat(web): do a thing.'],
  ['a Start-Case subject', 'feat(web): Do A Thing'],
  ['one character over the limit', `feat(web): ${'x'.repeat(90)}`],
  ['no conventional prefix at all', 'just some words'],
];

let failures = 0;
const say = (s) => process.stdout.write(`${s}\n`);

for (const [why, header] of MUST_PASS) {
  if (accepts(header)) say(`  ✓ accepts ${why}`);
  else {
    failures += 1;
    say(`  ✗ REJECTS a message it must accept — ${why}\n      ${header}`);
  }
}

for (const [why, header] of MUST_FAIL) {
  if (!accepts(header)) say(`  ✓ rejects ${why}`);
  else {
    failures += 1;
    say(`  ✗ ACCEPTS a message it must reject — ${why}\n      ${header}`);
  }
}

/**
 * **The squash suffix, asserted rather than described.** This is the case that decides what
 * `pr-title.yml` validates: a title legal on its own and illegal once merged.
 */
const BARE = `feat(web): ${'x'.repeat(83)}`; // 94 characters
if (BARE.length !== 94) {
  failures += 1;
  say(
    `  ✗ the fixture is not 94 characters (it is ${BARE.length}) — the case below proves nothing`,
  );
} else if (accepts(BARE) && !accepts(`${BARE} (#506)`)) {
  say('  ✓ a 94-character title passes alone and FAILS with the squash suffix — the design reason');
} else {
  failures += 1;
  say(
    '  ✗ the squash-suffix case no longer discriminates; re-derive what pr-title.yml should check',
  );
}

// A pinned positive over the whole corpus: an empty list satisfies both loops perfectly.
if (MUST_PASS.length === 0 || MUST_FAIL.length === 0) {
  failures += 1;
  say('  ✗ a corpus with an empty half checks nothing in that direction');
}

say(
  `commitlint fixtures: ${failures === 0 ? 'OK' : 'FAIL'} — ` +
    `${MUST_PASS.length + MUST_FAIL.length + 1 - failures}/${MUST_PASS.length + MUST_FAIL.length + 1} passed.`,
);
process.exit(failures === 0 ? 0 : 1);
