// @ts-check
/**
 * **Gate A — every debt-register row states its status, and the register agrees with itself.**
 *
 * `docs/specs/drift-gates/`, closing `docs/TECH_DEBT.md` #219(a).
 *
 * The register is the artefact that decides what gets picked up next, and answering "what is
 * actually still open?" required reading all of it. That is not hypothetical: on 2026-08-30 three
 * candidates were recommended to the product owner from this file and one had been fixed three
 * weeks earlier. A sweep then verified seven rows against the code — six were fixed and never
 * closed.
 *
 * **Armed at M4, and only because M3 repaired the file first.** It was report-only through M2-M3:
 * `scripts/prepush.sh` derives its roster from `package.json`'s `check:*` keys, so registering it
 * against a register with 118 findings would have made it blocking on day one — which is how a gate
 * gets deleted rather than fixed (ADR-0058). The red run against the un-repaired file is committed
 * at `docs/specs/drift-gates/red-run.md`; the repair took it to zero; this key was added after.
 * `--report` prints the summary line as well as the findings.
 *
 * **Every match is anchored at column 0**, via `scripts/lib/doc-register.mjs`. See that module's
 * docblock for the six recorded instances of a scan matching its own prose — the sixth of which is
 * live in this very file's subject, since #219 quotes `**Status:**` while asking for this gate.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  detailedRows,
  fieldValue,
  NOT_ITEMS,
  REPO_ROOT,
  registerSections,
  report,
  statusToken,
  stripFences,
} from './lib/doc-register.mjs';

const DOC = 'docs/TECH_DEBT.md';

/** The four-token vocabulary (spec §4.3). `closed` is deliberately NOT here — see A3. */
const VOCABULARY = ['open', 'deferred', 'standing', 'unverified'];

/** Heading annotations the register's own opening rule forbids, in bold. */
const FORBIDDEN_ANNOTATIONS = /\b(CLOSED|RESOLVED|ANSWERED)\b/;

// `NOT_ITEMS` and the row-number parse live in `scripts/lib/doc-register.mjs` since
// `docs/specs/zero-duration-task/` M0-T7, because `check:engine-parity` reads the same rows.

/**
 * Collect every finding, against an arbitrary repository root.
 *
 * **The root is a parameter so a suite can drive the real wiring rather than a copy of it.** Until
 * 2026-10-05 this gate read the repository directly and exited inline, so none of its assertions
 * had ever been made to fail by a fixture — the same state `check-adr-coverage.mjs` was in until
 * 2026-09-19, and the standard ADR-0110 D5 sets is that a gate is finished when it has been made
 * to fail by the defect it was written for.
 */
export function collectFindings(root) {
  const read = (path) => readFileSync(join(root, path), 'utf8');
  const md = read(DOC);
  // One fence-stripped line array, shared by every assertion that scans the raw document.
  const raw = stripFences(md).split('\n');
  const problems = [];
  // **No `warnings` array here, deliberately.** One was declared and never pushed to for months.
  // `report()`'s warnings path returns 2 unconditionally, and under the inverted `ADVISORY_GATES`
  // default a 2 from a gate that is not declared advisory BLOCKS — so the first `warnings.push` in
  // this file would have stopped a push over a soft note, with nothing explaining why. See the
  // constraint recorded on `report()`.

  // ── Parse ────────────────────────────────────────────────────────────────────────────────────
  //
  // **BOTH heading levels, and reading only one was a live defect in this gate's first version.**
  // `docs/TECH_DEBT.md:100-103` states the document's own convention — "Headings are
  // `### <number>. <title>`, ALWAYS. Three rows had drifted to `##`" — so `###` is canonical and
  // `##` is the drift. The first version called `sections(md, 2)` and therefore read **only the
  // drifted rows**: 31 numbered rows invisible, 29 of them with no status, while the gate reported
  // "88 rows, all with a status" over a document where that was false. It survived a red run, a
  // repair and an arming, because A9's control counted the same level as the parser — see below.
  const all = registerSections(md);
  const items = detailedRows(md);
  const structural = all.filter((s) => NOT_ITEMS.has(s.heading.trim()));

  // The compact table: `| N | … |` rows above `## Detailed items`.
  const detailedAt = all.find((s) => s.heading.trim() === 'Detailed items')?.line ?? Infinity;
  const ledgerAt = all.find((s) => s.heading.trim() === 'Closed numbers')?.line ?? Infinity;
  const lines = stripFences(md).split('\n');
  const compact = [];
  const ledger = [];
  const parseRow = (i) => {
    const m = /^\|\s*#?(\d+)([a-z]?)\s*\|/.exec(lines[i]);
    if (!m) return null;
    return {
      number: `${m[1]}${m[2]}`,
      line: i + 1,
      cells: lines[i]
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim()),
    };
  };
  for (let i = 0; i < lines.length && i + 1 < detailedAt; i += 1) {
    const entry = parseRow(i);
    if (entry) compact.push(entry);
  }
  // **The ledger is the one contiguous table under `## Closed numbers`, and nothing after it.**
  // This used to take every `| N |` line below the heading, which reaches the whole detailed
  // section: `#343`, `#360` and `#362` sat inside `### 294.`'s measurement table for weeks and
  // counted as ledgered, so a gate built on "is it in the ledger?" (A11) would have been satisfied
  // by any later table whose first cell is a number. Skip to the first table row, then stop at the
  // first line that is not part of it.
  let inLedger = false;
  for (let i = ledgerAt; i < lines.length; i += 1) {
    const isRow = lines[i].startsWith('|');
    if (!isRow) {
      if (inLedger) break;
      continue;
    }
    inLedger = true;
    const entry = parseRow(i);
    if (entry) ledger.push(entry);
  }

  // ── A9 — the pinned positive case, FIRST, so nothing below can pass vacuously ────────────────
  // ADR-0108's census passed its "nothing unclassified" check because its glob matched zero files;
  // ADR-0093 records a suite that could not tell "the duplicate is gone" from "the capability is
  // gone". Every assertion below is a `.filter()` and is therefore vacuously true of an empty set.
  if (items.length === 0)
    problems.push('A9: no detailed rows parsed at all — the parse is broken, not the register.');
  if (compact.length === 0)
    problems.push('A9: no compact-table rows parsed at all — the parse is broken.');
  // **The control must not share the parser's blind spot — which is how this assertion missed the
  // biggest instance of exactly what it exists for.** Its first version counted `^## `, the same
  // level `sections(md, 2)` read, so BOTH sides of "did we read less than we think?" were blind to
  // the 31 `###` rows: A9 agreed with itself and reported OK. The scan now counts a numbered
  // heading at EITHER level, derived independently of `sections()`.
  //
  // It scans the RAW document, fences included, which is deliberate: sharing `stripFences` would
  // re-introduce a common mode, and the failure directions are not symmetric. A fenced example
  // heading here produces a **false positive** — loud, and fixed the day it appears. Sharing the
  // parser's machinery produces a **false negative**, which is silent and is the defect this
  // assertion exists to catch.
  const naiveRows = md.split('\n').filter((l) => /^#{2,3} #?\d+[a-z]?[.\s\u2014-]/.test(l)).length;
  if (items.length !== naiveRows) {
    problems.push(
      `A9: the parser sees ${items.length} numbered rows but a naive scan of both heading levels ` +
        `sees ${naiveRows}. One of them is wrong; a gate that reads less than it thinks reports ` +
        'green over the gap.',
    );
  }

  // **A9's second limb counts FIELDS, because the first counts headings and so does A1.**
  // `#231`: `sections()` used to end a body only at the next SAME-level heading, so a `###` row
  // followed by `##` headings ran past them and read whatever fields it met. `#117` carried no
  // `**Status:**` line at all, its body ran 1,115 lines, it borrowed `#118`'s, and A1 below was
  // satisfied — while the limb above compared 71 headings against 71 headings and agreed with
  // itself. A control that measures the same quantity as the thing it controls cannot report a
  // disagreement; this one measures a different quantity, which is the whole point.
  //
  // **Anchored at column 0**, for the reason `fieldValue` is: an unanchored count reads 74 here,
  // three of them prose discussing the field rather than declaring it.
  // **Counted inside the detailed region only.** Counting the whole document lets a declaration in
  // prose OUTSIDE any row compensate for a row that is missing one, netting to zero — demonstrated
  // by the ADR-0124 test-engineer review, which removed `#58`'s status and added a column-0
  // `**Status:**` line to the preamble; this limb then stayed silent (A1 still caught it, but this
  // limb exists precisely to be the independent check that does not depend on A1).
  const detailedStart = raw.findIndex((l) => l.startsWith('## Detailed items'));
  const declaredStatuses = raw
    .slice(detailedStart + 1)
    .filter((l) => l.startsWith('**Status:**')).length;
  if (items.length !== declaredStatuses) {
    // **The two directions mean different things, so the message says which one happened.** More
    // rows than declarations means a row has no field of its own and A1 will name it. Fewer means
    // a declaration sits somewhere the parser found no row — a heading form it cannot see, which
    // is the shape A10 exists for.
    problems.push(
      `A9: the parser sees ${items.length} numbered rows but the raw document declares ` +
        `${declaredStatuses} column-0 **Status:** lines. ` +
        (items.length > declaredStatuses
          ? 'Some row has no declaration of its own — A1 names it.'
          : 'Some declaration belongs to a heading the parser did not read as a row.'),
    );
  }

  // ── A10 — every row heading is in the canonical form (#227) ──────────────────────────────────
  //
  // **This asserts the form; it does NOT narrow what the parser reads.** `sections()` and
  // `rowNumber` deliberately accept both heading levels and both title separators, because
  // ADR-0120 Finding 0 is that a gate's job is to find every row — a row in the wrong form is
  // still a row, and a parser that skips it reports green over the gap. Narrowing the reader to
  // enforce the form would re-introduce that defect in the name of fixing this one. So finding
  // stays generous and refusing is this separate, strict pass over what was found.
  //
  // The register states the convention at `docs/TECH_DEBT.md` — `### <number>. <title>`, always.
  // Before this assertion existed the register had drifted to two other forms: 41 rows at `##`
  // (repaired 2026-09-01) and 8 in an `### #<n> — <title>` form (repaired with this assertion).
  //
  // **Two limbs, because a heading can be wrong in two ways.** The first catches a row whose
  // heading is misshapen. The second catches a `###` that is not a row at all — which the first
  // structurally cannot see, since its predicate only fires on things already shaped like rows.
  // That second case is not cosmetic: after the depth fix above, ANY `###` inside the detailed
  // region terminates the row it sits in, so a sub-heading written at the wrong level silently
  // truncates its own row's body. One such heading existed and was demoted to `####` with this
  // assertion; nothing would have reported it.
  const CANONICAL = /^### \d+[a-z]?\. \S/;
  for (const line of raw) {
    if (!/^#{2,3} #?\d+[a-z]?[.\s\u2014-]/.test(line)) continue;
    if (CANONICAL.test(line)) continue;
    problems.push(
      `A10: "${line.slice(0, 70)}" is not in the canonical row form. ` +
        'A row heading is `### <number>. <title>` — three hashes, the number, a full stop.',
    );
  }
  const detailedLine = raw.findIndex((l) => l.startsWith('## Detailed items'));
  // **Refuse loudly rather than widen silently.** With no `## Detailed items` heading, `findIndex`
  // returns -1 and the loop below would start at 0 and sweep the WHOLE document for stray `###`
  // headings — a flood of unrelated findings instead of one clear diagnostic. That is the opposite
  // of A9's own philosophy two assertions up, which refuses on a broken precondition.
  if (detailedLine === -1) {
    problems.push(
      `A10: ${DOC} has no "## Detailed items" heading, so the region this assertion scopes itself ` +
        'to cannot be located. Restore the heading, or update this check — do not let it widen.',
    );
  }
  for (let i = detailedLine + 1; detailedLine !== -1 && i < raw.length; i += 1) {
    if (!raw[i].startsWith('### ') || CANONICAL.test(raw[i])) continue;
    if (/^#{2,3} #?\d+[a-z]?[.\s\u2014-]/.test(raw[i])) continue; // already reported above
    problems.push(
      `A10: ${DOC}:${i + 1} "${raw[i].slice(4, 60)}" is a level-3 heading that is not a row. ` +
        'Inside the detailed items a `###` ends the row above it — write a sub-heading at `####`.',
    );
  }

  // ── A1 — every item row has exactly one column-0 status line ────────────────────────────────
  const noStatus = items.filter((s) => fieldValue(s.body, 'Status') === null);
  for (const s of noStatus) {
    problems.push(`A1: ${DOC}:${s.line} "${s.heading.slice(0, 60)}" has no **Status:** line.`);
  }

  // ── A2 — the status token is in the vocabulary ───────────────────────────────────────────────
  for (const s of items) {
    const v = fieldValue(s.body, 'Status');
    if (v === null) continue;
    const token = statusToken(v);
    if (!VOCABULARY.includes(token)) {
      problems.push(
        `A2: ${DOC}:${s.line} status "${token}" is not one of ${VOCABULARY.join(' / ')}. ` +
          (token === 'closed'
            ? 'A closed row is DELETED and ledgered — this file says so in bold.'
            : ''),
      );
    }
  }

  // ── A3 — no heading is annotated CLOSED / RESOLVED / ANSWERED ────────────────────────────────
  // **The heading LINE only.** A body sentence saying a row "would read as closed" is prose about
  // closure, not a claim of it — #219 records an earlier classifier matching exactly that.
  for (const s of items) {
    if (FORBIDDEN_ANNOTATIONS.test(s.heading)) {
      problems.push(
        `A3: ${DOC}:${s.line} heading is annotated "${FORBIDDEN_ANNOTATIONS.exec(s.heading)[1]}". ` +
          'Delete the row and add its number to the Closed-numbers ledger.',
      );
    }
  }

  // ── A4 — row numbers are unique across BOTH formats ──────────────────────────────────────────
  const seen = new Map();
  for (const e of [
    ...compact.map((c) => ({ n: c.number, line: c.line })),
    ...items.map((s) => ({ n: s.number, line: s.line })),
  ]) {
    if (seen.has(e.n)) {
      problems.push(
        `A4: row number ${e.n} is used twice — ${DOC}:${seen.get(e.n)} and :${e.line}. This has happened twice for real.`,
      );
    } else seen.set(e.n, e.line);
  }

  // ── A5 — no live row number appears in the ledger ────────────────────────────────────────────
  for (const l of ledger) {
    if (seen.has(l.number)) {
      problems.push(
        `A5: ${l.number} is in the Closed-numbers ledger AND live at ${DOC}:${seen.get(l.number)}.`,
      );
    }
  }

  // ── A6 — every ledger row parses ─────────────────────────────────────────────────────────────
  for (const l of ledger) {
    const closed = l.cells[2] ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(closed)) {
      problems.push(
        `A6: ${DOC}:${l.line} ledger row ${l.number} has closed-date "${closed}", not YYYY-MM-DD.`,
      );
    }
  }

  // ── A4b — a compact row whose first cell is not a number ─────────────────────────────────────
  // An unnumbered row cannot be cited by an ADR (which are never rewritten), cannot be ledgered
  // when it closes, and is invisible to A4's uniqueness check. Found live at :68.
  for (let i = 0; i < lines.length; i += 1) {
    if (i + 1 >= detailedAt) break;
    if (!lines[i].startsWith('|')) continue;
    const first = lines[i].split('|')[1]?.trim() ?? '';
    if (first === '#' || /^:?-{2,}:?$/.test(first) || /^#?\d+[a-z]?$/.test(first)) continue;
    problems.push(
      `A4b: ${DOC}:${i + 1} compact row's number cell is "${first.slice(0, 40)}…", not a number. ` +
        'It cannot be cited, ledgered, or checked for uniqueness.',
    );
  }

  // ── A7 — the compact table is frozen, and the ratchet only ever falls ────────────────────────
  const ratchet = JSON.parse(read('scripts/debt-register.json')).compactTableRatchet;
  if (compact.length > ratchet) {
    problems.push(
      `A7: the compact table holds ${compact.length} rows against a ratchet of ${ratchet}. ` +
        'That format is frozen — a new row goes in the detailed section with a **Status:** line.',
    );
  } else if (compact.length < ratchet) {
    problems.push(
      `A7: the compact table holds ${compact.length} rows and the ratchet still says ${ratchet}. ` +
        `Lower it to ${compact.length} in scripts/debt-register.json, in the commit that converted the row.`,
    );
  }

  // ── A8 — an `unverified` row carries no Verified date ────────────────────────────────────────
  for (const s of items) {
    if (
      (fieldValue(s.body, 'Status') ?? '').toLowerCase().startsWith('unverified') &&
      fieldValue(s.body, 'Verified')
    ) {
      problems.push(
        `A8: ${DOC}:${s.line} is "unverified" but carries a **Verified:** date. One of the two is wrong.`,
      );
    }
  }

  // ── A11 — every number from 1 to the highest in use is a live row or a ledger line ──────────
  //
  // A deleted row's number goes in the ledger (`docs/TECH_DEBT.md`, "When you delete a row"),
  // because ADRs and code cite rows by number and are never rewritten. Nothing checked it: #336,
  // #338 and #340 were deleted by `98532284` with no ledger line and were found six days later only
  // because somebody diffed the commit, and the 2026-10-05 scan found 17 more lost the same way.
  //
  // **Integers only.** A suffixed row (`118a`) is a sub-item of a number, and the gate cannot know
  // which letters ever existed, so a suffixed row neither satisfies nor demands its integer.
  //
  // **Known blind spot, stated rather than hidden: the highest number.** `highest` is read from the
  // file itself, so deleting the single highest live row with no ledger line lowers the ceiling and
  // is not reported — and the next new row would then reuse that number silently. A high-water mark
  // in `scripts/debt-register.json` would close it, at the cost of a JSON edit with every new row
  // and a merge conflict between every pair of parallel branches; the spec declined that, and
  // `check-debt-status.test.mjs` pins the limitation so that adding one flips a test rather than
  // going unnoticed.
  //
  // **Red run on the real register (ADR-0110), 2026-10-05**, `### 453.` deleted locally:
  //   ✗ A11: #453 is neither a live row nor a line in the Closed-numbers ledger. …
  //   check:debt-status: FAIL — 1 finding(s). … Numbers 1–455: 1 unaccounted (209 live, 245 ledgered).
  // Exit 1; restored, the same run reads "all accounted for (210 live, 245 ledgered)".
  const wholeNumber = (n) => (/^\d+$/.test(n) ? Number(n) : null);
  const liveSet = new Set();
  for (const e of [...compact, ...items]) {
    const n = wholeNumber(e.number);
    if (n !== null) liveSet.add(n);
  }
  const ledgeredSet = new Set();
  for (const l of ledger) {
    const n = wholeNumber(l.number);
    if (n !== null) ledgeredSet.add(n);
  }
  let highest = 0;
  for (const n of [...liveSet, ...ledgeredSet]) highest = Math.max(highest, n);
  let unaccounted = 0;
  if (ledger.length === 0) {
    // One finding for one cause, rather than a finding for every number the parse failed to find.
    problems.push(
      ledgerAt === Infinity
        ? `A9: ${DOC} has no "## Closed numbers" heading, so no ledger can be parsed. A11 skipped.`
        : 'A9: no Closed-numbers ledger rows parsed — the parse is broken, not the register. A11 skipped.',
    );
  } else {
    for (let n = 1; n <= highest; n += 1) {
      if (liveSet.has(n) || ledgeredSet.has(n)) continue;
      unaccounted += 1;
      problems.push(
        `A11: #${n} is neither a live row nor a line in the Closed-numbers ledger. A deleted row's ` +
          'number goes in the ledger — one line: number, what it was, closed date, where the record ' +
          'is. ADRs and code cite rows by number and are never rewritten, so without it the ' +
          `citation dangles and the number looks free to reuse. git log -S'### ${n}.' -- ${DOC} ` +
          'finds the deleting commit.',
      );
    }
  }

  const summary =
    `${items.length} detailed rows (${items.length - noStatus.length} with a status, ${noStatus.length} without), ` +
    `${compact.length} compact-table rows, ${ledger.length} ledgered, ${structural.length} section headings. ` +
    `Numbers 1–${highest}: ${unaccounted === 0 ? 'all accounted for' : `${unaccounted} unaccounted`} ` +
    `(${liveSet.size} live, ${ledgeredSet.size} ledgered).`;

  return { problems, population: items.length, summary };
}

/**
 * Run the whole gate against `root` and return `report()`'s verdict, which is what the CLI exits
 * with — so a suite exercises the same exit path as `pnpm check:debt-status`, not a mirror of it.
 *
 * `--report` prints the summary line ahead of the findings; it never changes the verdict.
 */
export function runGate(root, argv = []) {
  const { problems, population, summary } = collectFindings(root);
  if (argv.includes('--report')) process.stdout.write(`${summary}\n\n`);
  const code = report({ name: 'check:debt-status', problems, population, summary });
  return { code, problems, summary };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(runGate(REPO_ROOT, process.argv.slice(2)).code);
}
