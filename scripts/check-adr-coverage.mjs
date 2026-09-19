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
 * **What it checks, and why it is not "appears in CLAUDE.md".** The register in `CLAUDE.md` §16 was
 * complete on every one of those three occasions; the roadmap was not. The two documents answer
 * different questions — "what did we decide?" versus "where is the product going?" — so the
 * subject here is `ROADMAP.md`, deliberately.
 *
 * **The INFERENCE that paragraph once drew from those three occasions is disproved and is not
 * repeated here.** It read "only the second one rots silently", and §16 has since been found
 * incomplete **seven times** (`docs/TECH_DEBT.md` #291): ADR-0132, ADR-0135, ADR-0049, ADR-0122,
 * and ADR-0145, each filed and indexed and cited by `ROADMAP.md` while absent from the register a
 * reader is briefed from. Every one was caught by a person or by a reviewer, never by this gate,
 * because it does not read that file at all. The historical claim about those three specific
 * occasions may still hold; the general rule it was used to justify does not.
 *
 * **That is a known gap, not an argument for widening this gate in passing.** #291 is the row;
 * widening a shared gate is an ADR-0105 trigger and wants its own spec, which is precisely why
 * ADR-0145's gate pass corrected this comment and stopped there.
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

import { report } from './lib/doc-register.mjs';

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

  const covered = adrs.length - exempt.size;
  return {
    problems,
    population: adrs.length,
    summary:
      `${String(covered)} of ${String(adrs.length)} ADRs cited in docs/ROADMAP.md, ` +
      `${String(exempt.size)} exempt by written reason.`,
  };
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
