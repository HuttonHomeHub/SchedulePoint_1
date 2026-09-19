#!/usr/bin/env node
/**
 * Every ADR is reachable from the documents a reader actually navigates by.
 *
 * **Written because three consecutive reconciliation passes found the same defect by hand.** The
 * 2026-08-04 pass recorded "`ROADMAP.md` was silent on ADR-0067–0073"; the 2026-08-09 pass recorded
 * "`ROADMAP.md` was silent on **ADR-0074 through ADR-0085** — the same failure as the two rows
 * below, two epics later, which is why that check is a numbered step and not a habit". It was a
 * numbered step, and on 2026-08-13 the roadmap was silent on **ADR-0087 through ADR-0092**.
 *
 * A numbered step is still a human remembering. `docs/RECONCILE.md` §1 states the remedy in its own
 * words — *if you find yourself writing "remember to re-check X", write a gate for X instead* — so
 * this is that gate, and the fourth occurrence is what it exists to prevent.
 *
 * **It now checks THREE registers, and the third is why `docs/TECH_DEBT.md` #291 existed.** The
 * register in `CLAUDE.md` §16 was complete on each of those three occasions and the roadmap was
 * not, which is where this gate's original subject came from — and the inference drawn from that
 * ("only the roadmap rots silently") was disproved **ten times**. ADR-0132, ADR-0135, ADR-0049,
 * ADR-0122, ADR-0144, ADR-0145 and ADR-0146 were each Accepted, filed, listed in the index
 * (gated) and cited by `ROADMAP.md` (gated) while absent from the register a reader is briefed
 * from. Every one was repaired by hand; three were found by a person doing this comparison
 * manually; not one was found by a gate, because until 2026-09-19 this script did not read that
 * file. The two documents that are checked are the two that fail loudly, which is exactly why the
 * third rots.
 *
 * Widening it was an ADR-0105 trigger and was correctly deferred twice on that ground — see
 * `docs/specs/adr-register-coverage/` for the spec that discharged it, and ADR-0147, which amends
 * ADR-0110 D6 rather than superseding it.
 *
 * **Not every ADR belongs in a roadmap**, which is why this carries an exemption file rather than a
 * blanket rule. A decision about drift control or flag classification is not product direction, and
 * forcing it into the roadmap would add noise a reader has to skip — which is how a document stops
 * being read. Each exemption names its reason, in the shape `dependency-claims.json` and
 * `flag-retirement.json` already use: a register somebody has to edit deliberately, not a pattern
 * that quietly swallows new cases.
 *
 * Usage: `node scripts/check-adr-coverage.mjs`
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { report, sections, stripFences } from './lib/doc-register.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Collect every finding, against an arbitrary repository root.
 *
 * **The root is a parameter so the suite can drive the real wiring rather than a copy of it.**
 * Until 2026-09-19 this gate read a module-scope `root` and exited inline, so none of its three
 * assertions had ever been verified red — the only register gate with no `.test.mjs` sibling, and
 * `stack-record.structural.test.ts` is the recorded cost of asserting against a private mirror
 * instead (ADR-0110 D5).
 */
export function collectFindings(root) {
  const read = (p) => readFileSync(join(root, p), 'utf8');

  const roadmap = read('docs/ROADMAP.md');
  const index = read('docs/adr/README.md');
  const register = JSON.parse(read('scripts/adr-coverage.json'));
  const exempt = new Map(Object.entries(register.exempt));

  const adrs = readdirSync(join(root, 'docs/adr'))
    .filter((n) => /^\d{4}-.*\.md$/.test(n))
    .map((n) => n.slice(0, 4))
    .sort();

  const problems = [];

  for (const id of adrs) {
    const cited = roadmap.includes(`ADR-${id}`);
    const reason = exempt.get(id);
    // **A blank reason admitted an ADR silently**, found 2026-09-19 by the pinned positive case
    // this gate had never had. Every branch below tests `reason !== undefined`, so `"0147": ""`
    // exempted an ADR from roadmap coverage while recording nothing about why — the one thing the
    // exemption file exists to hold, and the failure ADR-0136 records the licence gate having no
    // test for. It is its own finding rather than falling through to R1, because "your exemption
    // is empty" and "this ADR is not in the roadmap" are different repairs.
    if (reason !== undefined && reason.trim() === '') {
      problems.push(
        `R5: scripts/adr-coverage.json exempts ADR-${id} with an empty reason.\n` +
          `    An exemption is a written reason or it is nothing — say why this ADR is not\n` +
          `    product direction, or delete the entry and cite it in docs/ROADMAP.md.`,
      );
      continue;
    }
    if (cited && reason !== undefined) {
      // Not pedantry: an exemption that is no longer true is a licence for the NEXT ADR to claim it
      // by copying its neighbour. The register has to describe the tree it is sitting in.
      problems.push(
        `R2: ADR-${id} is exempt ("${reason}") but IS cited in docs/ROADMAP.md.\n` +
          `    Drop it from scripts/adr-coverage.json — it earned its place.`,
      );
    } else if (!cited && reason === undefined) {
      problems.push(
        `R1: ADR-${id} is not mentioned in docs/ROADMAP.md.\n` +
          `    Add it where the reader looks for product direction, or — if it is a process or\n` +
          `    tooling decision rather than a product one — exempt it in\n` +
          `    scripts/adr-coverage.json WITH a reason.`,
      );
    }
  }

  // An exemption for an ADR that does not exist is dead config, and dead config is how a register
  // stops being read (the ADR-0088 finding about no-op flag pins, one file along).
  // **The index, gated rather than remembered** (ADR-0110 D6). ADR-0078 S1 found SEVEN ADRs missing
  // from `docs/adr/README.md` and repaired them by hand; writing ADR-0110 found ADR-0109 missing from
  // it again — because this script validated roadmap coverage and never read the index at all. A rule
  // repaired by hand and left ungated recurs at the next opportunity, and here that was the very next
  // ADR. Both directions are checked: a file with no row is invisible to a reader who starts at the
  // index, and a row with no file is a link to nothing.
  for (const id of adrs) {
    if (!index.includes(`(${id}-`)) {
      problems.push(
        `R3a: ADR-${id} has no row in docs/adr/README.md. The index is how a reader finds it; ` +
          `an ADR absent from it is filed but not published.`,
      );
    }
  }
  for (const match of index.matchAll(/\|\s*\[(\d{4})\]\(/g)) {
    const id = match[1];
    if (!adrs.includes(id)) {
      problems.push(`R3b: docs/adr/README.md lists ADR-${id}, which has no file.`);
    }
  }

  for (const id of exempt.keys()) {
    if (!adrs.includes(id)) {
      problems.push(`R4: scripts/adr-coverage.json exempts ADR-${id}, which does not exist.`);
    }
  }

  const claudeRegister = registerFindings(read('CLAUDE.md'), adrs);
  problems.push(...claudeRegister.problems);

  const covered = adrs.length - exempt.size;
  return {
    problems,
    population: adrs.length,
    // **Both counts, so a green run is distinguishable from a run that found nothing to check.**
    summary:
      `${String(covered)} of ${String(adrs.length)} ADRs cited in docs/ROADMAP.md, ` +
      `${String(exempt.size)} exempt by written reason; ` +
      `${String(claudeRegister.entries)} of ${String(adrs.length)} in CLAUDE.md §16.`,
  };
}

/**
 * The canonical form of a §16 entry: a list item at column 0 whose first content is a bolded id.
 *
 * Measured 2026-09-19: **146 of 146** entries take exactly this form, and **zero** lines anywhere
 * in `CLAUDE.md` take an indented or `*`-marker variant. The status parenthetical that most entries
 * carry is deliberately NOT required — ADR-0001 through ADR-0005 carry none, and a rule that fails
 * on day one against correct entries gets deleted rather than fixed (ADR-0058).
 */
const CANONICAL_ENTRY = /^- \*\*ADR-(\d{4})\*\*/;

/**
 * The generous form (ADR-0124 D1: *find generously, refuse strictly*).
 *
 * On today's estate the two passes agree exactly — both find 146 — so this buys nothing now. It is
 * built anyway because the day somebody reformats an entry the alternative is 146 findings reading
 * "this ADR is not in the register" against a file where every ADR is present, which is how a gate
 * gets deleted rather than fixed.
 */
const GENEROUS_ENTRY = /^\s*[-*]\s+\*{0,2}ADR-(\d{4})/;

/**
 * Assert `CLAUDE.md` §16 — the register a reader is actually briefed from.
 *
 * **`docs/TECH_DEBT.md` #291 records TEN instances** of an ADR being Accepted, filed, listed in
 * `docs/adr/README.md` (gated) and cited by `docs/ROADMAP.md` (gated) while absent from §16 (not
 * gated). Every one was repaired by hand; three were found by a person doing this comparison
 * manually; the row predicted its own recurrence and was proved right four times. The two gated
 * documents are the two that fail loudly, which is exactly why the third rots.
 *
 * **Why this is not `body.includes('ADR-0122')`.** `ADR-\d{4}` occurs **750** times in `CLAUDE.md`
 * against 146 entries, because entries cite each other constantly — so a substring check is
 * satisfied by prose inside a *different* ADR's entry. That is not hypothetical: it is precisely
 * how ADR-0049 and ADR-0122 were "present" while being absent from the register, and correctly
 * counted as missing.
 *
 * **What this does NOT check, stated so nobody reads more into a green run than it says:**
 * - **Presence, not quality.** `- **ADR-0147** — TODO` passes. A placeholder entry is a human's
 *   problem and this gate has no opinion about prose.
 * - **No opinion on order.** §16 is deliberately not numerically sorted (ADR-0057 sits after
 *   ADR-0146; 0085–0087 sit between 0103 and 0106), and imposing one would be a different decision.
 * - **Blind to non-list forms.** An entry written as a heading or a table row is invisible here and
 *   reports as A1. That is the intended failure: the canonical form is the contract.
 * - **`CLAUDE.md` only.** `docs/DECISIONS.md` is by its own description a log of *smaller*
 *   decisions with no per-ADR obligation, so it is out of scope by decision rather than oversight.
 */
function registerFindings(claudeMd, adrs) {
  const problems = [];
  /** @type {(n: number) => { problems: string[], entries: number }} */
  const done = (entries) => ({ problems, entries });
  const section = sections(claudeMd, 2).find((s) => s.heading.startsWith('16.'));

  // **A4 returns early rather than emitting 146 A1 findings for one cause.** If the section cannot
  // be located the register has been restructured or renumbered, and telling the reader that every
  // ADR is missing buries the one fact that matters.
  if (section === undefined) {
    problems.push(
      'A4: CLAUDE.md has no `## 16. …` section, so the ADR register could not be read at all.\n' +
        '    This gate anchors on the NUMBER, not the title, so a retitle is safe and a renumber\n' +
        '    is not. Update the anchor in scripts/check-adr-coverage.mjs deliberately.',
    );
    return done(0);
  }

  const bodyLines = section.body.split('\n');
  const at = (i) => section.line + 1 + i;

  /** @type {Map<string, number[]>} generous id → 1-based CLAUDE.md lines. */
  const found = new Map();
  /** @type {Set<string>} ids whose bullet is in the canonical form. */
  const canonical = new Set();
  /** @type {{ id: string, line: number }[]} generous matches that are not canonical. */
  const malformed = [];

  bodyLines.forEach((line, i) => {
    const g = GENEROUS_ENTRY.exec(line);
    if (g === null) return;
    const id = g[1];
    found.set(id, [...(found.get(id) ?? []), at(i)]);
    if (CANONICAL_ENTRY.test(line)) canonical.add(id);
    else malformed.push({ id, line: at(i) });
  });

  if (found.size === 0) {
    problems.push(
      'A4: CLAUDE.md §16 holds no ADR entries at all. Either the register was emptied or the\n' +
        '    entry form changed; a list item at column 0 beginning `- **ADR-NNNN**` is the contract.',
    );
    return done(0);
  }

  // **A1 — an ADR with no entry.** This is #291's defect, and it consults the roadmap exemption
  // map NOWHERE (A7). 43 ADRs are exempt from roadmap coverage and **17 of those exemptions
  // justify themselves by pointing at §16** ("CLAUDE.md §16 is the register for these"), so an
  // exemption suppressing a §16 finding would let the one coverage claim the repository makes
  // about those ADRs go unchecked by citing itself.
  for (const id of adrs) {
    if (found.has(id)) continue;
    problems.push(
      `A1: ADR-${id} has no entry in CLAUDE.md §16.\n` +
        `    §16 is the register every human and every agent is briefed from — an ADR absent from\n` +
        `    it is invisible to the audience that matters most. Add a bullet in the form\n` +
        `    \`- **ADR-${id}** _(status)_ — …\`.`,
    );
  }

  // **A2 — an entry naming no file.** A link to nothing, and the mirror of R3b one document along.
  for (const [id, lines] of found) {
    if (adrs.includes(id)) continue;
    problems.push(
      `A2: CLAUDE.md:${String(lines[0])} carries an entry for ADR-${id}, which has no file in ` +
        `docs/adr/.`,
    );
  }

  // **A3 — a duplicate.** A set comparison is structurally blind to these, and a hand repair is
  // exactly where they come from: #291 records ten repairs made by hand, each by somebody adding a
  // bullet without reading 4,900 lines to see whether one was already there.
  for (const [id, lines] of found) {
    if (lines.length < 2) continue;
    problems.push(
      `A3: ADR-${id} has ${String(lines.length)} entries in CLAUDE.md §16 ` +
        `(lines ${lines.join(', ')}). One decision, one entry.`,
    );
  }

  // **A6 — the strict refusal half of ADR-0124 D1.** Found generously above, refused here, so a
  // reformatted entry produces one actionable finding rather than a false "this ADR is missing".
  for (const { id, line } of malformed) {
    problems.push(
      `A6: CLAUDE.md:${String(line)} names ADR-${id} in a list item that is not the canonical ` +
        `form.\n    Write it at column 0 as \`- **ADR-${id}** …\` — the form 146 of 146 entries use.`,
    );
  }

  // **A5 — the control, and it measures a different quantity by a different method** (ADR-0124 D2).
  // ADR-0120's A9 compared heading counts against heading counts and could only agree with itself;
  // this scans the WHOLE document for the canonical form, never calling `sections()`, and requires
  // the two sets to be equal.
  //
  // **What A5 is and is not.** It detects an entry that has escaped §16 (moved into §17 by a bad
  // edit) and a section boundary that has stopped being where it should be — `docs/TECH_DEBT.md`
  // #231 is the recorded case, where a section ran 1,115 lines past its end and read its
  // neighbour's fields. It does NOT detect the section being parsed too generously; that is the
  // suite's job, via the fixture reproducing the ADR-0049/0122 shape.
  const everywhere = new Set();
  for (const line of stripFences(claudeMd).split('\n')) {
    const m = CANONICAL_ENTRY.exec(line);
    if (m) everywhere.add(m[1]);
  }
  const escaped = [...everywhere].filter((id) => !canonical.has(id)).sort();
  if (escaped.length > 0) {
    problems.push(
      `A5: ${String(escaped.length)} canonical ADR entr${escaped.length === 1 ? 'y is' : 'ies are'} ` +
        `in CLAUDE.md but OUTSIDE §16 (${escaped.join(', ')}).\n` +
        `    §16 reads ${String(canonical.size)}; the whole document reads ` +
        `${String(everywhere.size)}. Either an entry has escaped the section or the section's\n` +
        `    bounds have moved — the second is docs/TECH_DEBT.md #231's defect.`,
    );
  }

  return done(found.size);
}

/** Run the whole gate against `root` and return `report()`'s verdict. */
export function runGate(root) {
  const { problems, population, summary } = collectFindings(root);
  const code = report({ name: 'check:adr-coverage', problems, population, summary });
  return { code, problems, summary };
}

// **No `warnings` are pushed anywhere in this gate, deliberately.** That channel returns 2
// unconditionally (`lib/doc-register.mjs`), and under `prepush.sh`'s inverted default a 2 from a
// gate absent from `ADVISORY_GATES` BLOCKS — so a soft note here would stop a push for a reason
// nobody could see. This gate is blocking by design (its remedy is an edit to the file that
// failed, ADR-0120 D2) and says so through `problems` only.

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(runGate(repoRoot).code);
}
