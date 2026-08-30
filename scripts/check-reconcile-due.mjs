// @ts-check
/**
 * **Gate B — how many epics have shipped since the last reconciliation pass?**
 *
 * `docs/specs/drift-gates/`, closing `docs/TECH_DEBT.md` #220.
 *
 * `docs/RECONCILE.md` says the pass runs "at each epic boundary", with a three-month hard floor.
 * The floor works, because a date is a fact a person can check. The trigger is weaker, and the
 * reason is not that anybody forgets: **the only record of when the pass last ran was unsorted
 * prose with a contradicting summary line.** On 2026-08-30 a reader auditing that file
 * *specifically for staleness* got it wrong on the first attempt — read the table with `tail -8`,
 * noticed line order was not date order, corrected once, and stopped at the first correction
 * instead of sorting the column.
 *
 * **This WARNS and never blocks** (product-owner decision, 2026-08-30). A missed pass is a
 * documentation debt, not a broken build, and blocking a release on one is how a gate gets bypassed
 * with `--no-verify`. **The weakness is recorded rather than designed away: a warning is ignorable,
 * and that is exactly how #220 happened.** Escalation-to-failure was refused — a blocking gate with
 * extra steps arrives at the same bypass by a longer route.
 *
 * **The threshold is 8 ADRs, derived and not picked** — `docs/specs/drift-gates/m0-measurement.md`
 * shows the working: realised counts per interval `[0,1,1,2,3,3,6,7,8,11,12]`, p75 = 7.50, and T = 8
 * fires on 3 of 11 intervals while catching both occasions the register itself records as failures.
 * A 14-day backstop is kept and honestly labelled: it has never fired and never would have on this
 * history. It is insurance against ADRs ceasing to be the unit, since a period with no ADRs at all
 * sits below every count threshold and would otherwise leave this permanently silent.
 *
 * **An ADR is a proxy for an epic, not the thing** — some epics file none and some file two, so this
 * counts the wrong noun by a factor of about 1.7. That is acceptable only because it is stated.
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { REPO_ROOT, readRepoDoc, report, sections, tableRows } from './lib/doc-register.mjs';

const DOC = 'docs/RECONCILE.md';
const DECISIONS = 'docs/DECISIONS.md';
const ADR_DIR = 'docs/adr';
const ADR_THRESHOLD = 8;
const BACKSTOP_DAYS = 14;

/**
 * `git`, or `null` — **never a throw**, which is the point.
 *
 * The first version called `execFileSync` bare. With `git` absent from PATH, or `docs/adr` missing,
 * or the working copy not a repository, it exited **1** with a raw stack trace, which `prepush.sh`
 * reports as **FAIL** — the exact outcome the docblock above promises is impossible. A gate whose
 * one contractual promise is "this never blocks" must not have an exception path that blocks, and
 * "wrap the call site" is not enough: the promise has to hold for every reason the call can fail.
 */
function tryGit(args) {
  try {
    // `cwd: REPO_ROOT` for the same reason `readRepoDoc` resolves from it: reading this
    // repository's documents while asking a *different* repository's history is worse than either
    // half being wrong, because the two halves would look consistent.
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      cwd: REPO_ROOT,
    });
  } catch {
    return null;
  }
}

/**
 * **The three places a pass is recorded, compared against each other** (spec US-6 / S8).
 *
 * `docs/RECONCILE.md:9-13` instructs the owner of a pass to record it in three places "**all three,
 * in the same commit**" — the banner date, a row in the Passes-run table, and a `docs/DECISIONS.md`
 * entry. That instruction is prose, and prose is what failed: the banner said `2026-07-28` while the
 * table recorded `2026-07-31`, so the drift-control document had drifted about its own drift
 * control. A reader of the banner alone thought the pass was four days more overdue than it was; a
 * reader of the table alone thought the opposite. This gate's *own input* was that prose.
 *
 * The **effective date is the newest of the three**, deliberately — the failure mode to avoid is a
 * forgotten update making the pass look older and firing a warning about work already done, which
 * teaches a reader to ignore the gate. Taking the newest errs towards silence, and the disagreement
 * is reported separately, so nothing is hidden either way.
 *
 * **Stated blind spot:** the `DECISIONS.md` clause knows only that an entry carrying that date
 * exists, never that it is *about the pass*. Matching the word "Reconciliation" in a heading is
 * prose-scanning, which is the failure this whole module is built against — and it would be wrong
 * in both directions, since two of that file's pass entries do not carry the word in a form a
 * regex could rely on. A same-day entry that happens to be about something else therefore satisfies
 * this, and that is a knowingly weak check rather than an accidental one.
 */
function maxDate(values) {
  const dates = values.filter((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)).sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

function passSites(md, decisions) {
  // The banner line, not any date in the prose: `**Last full pass: YYYY-MM-DD.**` at column 0.
  const bannerLines = md.split('\n');
  let banner = null;
  let bannerLine = 0;
  for (let i = 0; i < bannerLines.length; i += 1) {
    const m = /^>?\s*\*\*Last full pass:\s*(\d{4}-\d{2}-\d{2})\.?\*\*/.exec(bannerLines[i]);
    if (m) {
      banner = m[1];
      bannerLine = i + 1;
      break;
    }
  }

  const table = lastPassDate(md);

  // The newest dated heading in DECISIONS.md, at either level — that file uses both.
  const decisionDates = [...sections(decisions, 2), ...sections(decisions, 3)]
    .map((s) => /^(\d{4}-\d{2}-\d{2})\b/.exec(s.heading)?.[1])
    .filter(Boolean)
    .sort();
  const newestDecision = decisionDates.length > 0 ? decisionDates[decisionDates.length - 1] : null;

  return { banner, bannerLine, table, decisions: decisionDates, newestDecision };
}

/**
 * The newest date in the pass table's **date column**, read by cell index.
 *
 * Never by scanning the row's text: `RECONCILE.md`'s findings column is full of dates, and taking
 * the first one a regex meets is how a reader concluded the last pass was five days earlier than it
 * was. And never `tableRows[0]` either — **the table is not guaranteed sorted**, which is the
 * defect this gate exists because of, so the maximum is taken over every row.
 */
function lastPassDate(md) {
  const dates = tableRows(md, 'Passes run')
    .map((cells) => cells[0])
    .filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c))
    .sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

/**
 * ADRs filed since `since`, by **git add-date**, never the document's own `**Date:**` field —
 * ADR-0070 and ADR-0093 have no `Date` line at all, six use a different format, ADR-0050 has three,
 * and ADR-0071's is the one this repository records as filed two days late.
 *
 * **One `git log`, not one per file.** The first version walked `readdirSync('docs/adr')` and spawned
 * a `git log` per entry: 122 subprocesses, measured at **2.9 s** against this gate's own `<1.0 s`
 * budget — and the budget is not decoration, because a pre-push step slow enough to notice is a step
 * somebody starts skipping. A single `--diff-filter=A --name-only` walk over the directory yields
 * every file's add-commit in one pass; the marker prefix separates a date line from a path line,
 * because a commit adding several ADRs prints one date and several paths.
 *
 * Returns `null` when git could not answer at all, so the caller can say so rather than reporting
 * "0 ADRs since" — which would read as a reassuring measurement of a quiet period.
 */
function adrsSince(since) {
  const out = tryGit([
    'log',
    '--diff-filter=A',
    '--format=@@%ad',
    '--date=short',
    '--name-only',
    '--',
    `${ADR_DIR}/`,
  ]);
  if (out === null) return null;

  const filed = [];
  let date = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('@@')) {
      date = line.slice(2).trim();
    } else if (date && /^docs\/adr\/\d{4}-.*\.md$/.test(line) && date > since) {
      filed.push({ file: line.slice(ADR_DIR.length + 1), date });
    }
  }
  return filed;
}

/**
 * Every ADR file git knows about — this gate's **population**, derived rather than assumed.
 *
 * The first version hard-coded `population: 1`, so an empty or unreadable `docs/adr` produced a
 * clean `OK. 0 ADRs since`: a gate reporting success over nothing, which is the single failure this
 * repository has recorded most often and which `report()`'s own docblock exists to refuse. It is
 * taken from the same `git log` walk, so it cannot disagree with the count above by construction —
 * A9's lesson from `check:debt-status`, where a control that shared the parser's blind spot agreed
 * with itself over 31 invisible rows.
 */
function knownAdrs() {
  const out = tryGit(['ls-files', '--', `${ADR_DIR}/*.md`]);
  if (out === null) return null;
  return out.split('\n').filter((l) => /^docs\/adr\/\d{4}-.*\.md$/.test(l));
}

function main() {
  const md = readRepoDoc(DOC);
  const decisions = readRepoDoc(DECISIONS);
  const sites = passSites(md, decisions);
  const warnings = [];

  // **Every exit below is advisory**, so this gate has no path that returns 1. See `report()`.
  const advisory = true;

  // The three sites are compared BEFORE the effective date is used, so a disagreement is reported
  // even on a run where the ADR count is comfortably below the threshold. It is the gate's own
  // input; a wrong input produces a confident wrong answer, which is worse than no answer.
  if (sites.banner === null) {
    warnings.push(
      `${DOC}: no "**Last full pass: YYYY-MM-DD.**" banner line found — one of the three recording ` +
        'sites is unreadable, so the other two are unchecked.',
    );
  } else if (sites.table !== null && sites.banner !== sites.table) {
    warnings.push(
      `${DOC}: the banner says ${sites.banner} (line ${sites.bannerLine}) and the newest Passes-run ` +
        `row says ${sites.table}. RECONCILE.md's own instruction is "all three, in the same ` +
        'commit"; update whichever is behind.',
    );
  }

  const last = sites.table === null ? null : maxDate([sites.banner, sites.table]);

  if (last === null) {
    return report({
      name: 'check:reconcile-due',
      problems: [
        `${DOC}: no dated rows found in the "Passes run" table — the parse is broken, or the table is.`,
      ],
      population: 0,
      advisory,
    });
  }

  if (!sites.decisions.includes(last)) {
    warnings.push(
      `${DECISIONS}: no entry dated ${last}, the newest recorded pass. The pass is recorded in ` +
        `${DOC} and not in the running log. (This can only see that an entry with that date ` +
        'exists, never that it is about the pass — matching a word in a heading would be the ' +
        'prose-scanning failure this gate is built against.)',
    );
  }

  // **A shallow clone cannot answer this question, and answers it wrongly rather than refusing.**
  // `--diff-filter=A` reports every file present at the boundary commit as *added there*, so a
  // `fetch-depth: 1` checkout dates all 122 ADRs to the day CI ran and this gate warns that the
  // whole register was filed since the last pass. Saying so is the only honest output; guessing a
  // correction from a truncated history is not available.
  const shallow = tryGit(['rev-parse', '--is-shallow-repository']);
  if (shallow !== null && shallow.trim() === 'true') {
    return report({
      name: 'check:reconcile-due',
      warnings: [
        'this is a shallow clone, so `git log --diff-filter=A` dates every ADR to the boundary ' +
          'commit and the count would be meaningless. Skipped rather than guessed — run it on a ' +
          'full clone (`git fetch --unshallow`).',
      ],
      population: 1,
      advisory,
      summary: `last pass ${last}.`,
    });
  }

  const corpus = knownAdrs();
  const since = corpus === null ? null : adrsSince(last);
  if (corpus === null || since === null) {
    return report({
      name: 'check:reconcile-due',
      warnings: [
        'git could not be read (absent from PATH, or this is not a work tree), so the ADR count ' +
          'is unavailable. Reported rather than assumed: "0 ADRs since" would read as a measured ' +
          'quiet period.',
      ],
      population: 1,
      advisory,
      summary: `last pass ${last}.`,
    });
  }

  const days = Math.floor((Date.now() - Date.parse(`${last}T00:00:00Z`)) / 86_400_000);

  if (since.length >= ADR_THRESHOLD) {
    warnings.push(
      `${since.length} ADRs have been filed since the last reconciliation pass (${last}), against a ` +
        `threshold of ${ADR_THRESHOLD}: ${since.map((a) => a.file.slice(0, 4)).join(', ')}.`,
    );
    warnings.push(`Run the pass — docs/RECONCILE.md — and add a row to its "Passes run" table.`);
  } else if (days >= BACKSTOP_DAYS) {
    warnings.push(
      `${days} days since the last reconciliation pass (${last}), against a ${BACKSTOP_DAYS}-day backstop. ` +
        `Only ${since.length} ADRs were filed in that time, so the ADR trigger did not fire — which is ` +
        'what the backstop is for: a quiet period leaves the count below every threshold.',
    );
  }

  return report({
    name: 'check:reconcile-due',
    warnings,
    // **The ADR corpus, derived from git — not the literal 1 this used to pass.** Zero ADRs *since*
    // the last pass is a legitimate reading; zero ADRs *at all* means the gate measured nothing.
    population: corpus.length,
    advisory,
    summary:
      `last pass ${last} (${days}d ago), ${since.length} of ${corpus.length} ADRs since, ` +
      `threshold ${ADR_THRESHOLD}.`,
  });
}

// **Exported for `check-reconcile-due.test.mjs`, and guarded so importing does not run the gate.**
// The three-site comparison has to be provable red, and the live repository is now consistent —
// which is the whole point of having fixed it. A check that cannot be made to fail by the defect it
// names is not finished (ADR-0110 D5), so the fixtures below stand in for a red repository.
export { maxDate, passSites };

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main());
}
