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

import { fieldValue, readRepoDoc, report, sections, stripFences } from './lib/doc-register.mjs';

const DOC = 'docs/TECH_DEBT.md';

/** The four-token vocabulary (spec §4.3). `closed` is deliberately NOT here — see A3. */
const VOCABULARY = ['open', 'deferred', 'standing', 'unverified'];

/** Heading annotations the register's own opening rule forbids, in bold. */
const FORBIDDEN_ANNOTATIONS = /\b(CLOSED|RESOLVED|ANSWERED)\b/;

/** Section headings that are structure, not items. */
const NOT_ITEMS = new Set(['Principles for managing debt', 'Detailed items', 'Closed numbers']);

/** `## 219. Title` or `## #106 — Title`; returns the row number as a string, or null. */
function rowNumber(heading) {
  const m = /^#?(\d+)([a-z]?)[.\s—-]/.exec(heading.trim());
  return m ? `${m[1]}${m[2]}` : null;
}

function main(argv) {
  const md = readRepoDoc(DOC);
  const problems = [];
  const warnings = [];

  // ── Parse ────────────────────────────────────────────────────────────────────────────────────
  //
  // **BOTH heading levels, and reading only one was a live defect in this gate's first version.**
  // `docs/TECH_DEBT.md:100-103` states the document's own convention — "Headings are
  // `### <number>. <title>`, ALWAYS. Three rows had drifted to `##`" — so `###` is canonical and
  // `##` is the drift. The first version called `sections(md, 2)` and therefore read **only the
  // drifted rows**: 31 numbered rows invisible, 29 of them with no status, while the gate reported
  // "88 rows, all with a status" over a document where that was false. It survived a red run, a
  // repair and an arming, because A9's control counted the same level as the parser — see below.
  const all = [...sections(md, 2), ...sections(md, 3)].sort((a, b) => a.line - b.line);
  const items = all.filter(
    (s) => !NOT_ITEMS.has(s.heading.trim()) && rowNumber(s.heading) !== null,
  );
  const structural = all.filter((s) => NOT_ITEMS.has(s.heading.trim()));

  // The compact table: `| N | … |` rows above `## Detailed items`.
  const detailedAt = all.find((s) => s.heading.trim() === 'Detailed items')?.line ?? Infinity;
  const ledgerAt = all.find((s) => s.heading.trim() === 'Closed numbers')?.line ?? Infinity;
  const lines = stripFences(md).split('\n');
  const compact = [];
  const ledger = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^\|\s*#?(\d+)([a-z]?)\s*\|/.exec(lines[i]);
    if (!m) continue;
    const entry = {
      number: `${m[1]}${m[2]}`,
      line: i + 1,
      cells: lines[i]
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim()),
    };
    if (i + 1 < detailedAt) compact.push(entry);
    else if (i + 1 > ledgerAt) ledger.push(entry);
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

  // ── A1 — every item row has exactly one column-0 status line ────────────────────────────────
  const noStatus = items.filter((s) => fieldValue(s.body, 'Status') === null);
  for (const s of noStatus) {
    problems.push(`A1: ${DOC}:${s.line} "${s.heading.slice(0, 60)}" has no **Status:** line.`);
  }

  // ── A2 — the status token is in the vocabulary ───────────────────────────────────────────────
  for (const s of items) {
    const v = fieldValue(s.body, 'Status');
    if (v === null) continue;
    const token = v
      .split(/[\s·—|]/)[0]
      .toLowerCase()
      .replace(/[*_`.]/g, '');
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
    ...items.map((s) => ({ n: rowNumber(s.heading), line: s.line })),
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
  const ratchet = JSON.parse(readRepoDoc('scripts/debt-register.json')).compactTableRatchet;
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

  const summary =
    `${items.length} detailed rows (${items.length - noStatus.length} with a status, ${noStatus.length} without), ` +
    `${compact.length} compact-table rows, ${ledger.length} ledgered, ${structural.length} section headings.`;

  if (argv.includes('--report')) {
    process.stdout.write(`check:debt-status — REPORT ONLY (not yet armed; see M4)\n${summary}\n\n`);
  }
  return report({
    name: 'check:debt-status',
    problems,
    warnings,
    population: items.length,
    summary,
  });
}

process.exit(main(process.argv.slice(2)));
