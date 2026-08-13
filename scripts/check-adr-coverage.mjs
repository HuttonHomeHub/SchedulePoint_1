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
 * different questions — "what did we decide?" versus "where is the product going?" — and only the
 * second one rots silently, because nothing downstream breaks when a shipped capability is missing
 * from it. So the subject here is `ROADMAP.md`, deliberately.
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

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const roadmap = read('docs/ROADMAP.md');
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
  if (cited && reason !== undefined) {
    // Not pedantry: an exemption that is no longer true is a licence for the NEXT ADR to claim it
    // by copying its neighbour. The register has to describe the tree it is sitting in.
    problems.push(
      `ADR-${id} is exempt ("${reason}") but IS cited in docs/ROADMAP.md.\n` +
        `    Drop it from scripts/adr-coverage.json — it earned its place.`,
    );
  } else if (!cited && reason === undefined) {
    problems.push(
      `ADR-${id} is not mentioned in docs/ROADMAP.md.\n` +
        `    Add it where the reader looks for product direction, or — if it is a process or\n` +
        `    tooling decision rather than a product one — exempt it in\n` +
        `    scripts/adr-coverage.json WITH a reason.`,
    );
  }
}

// An exemption for an ADR that does not exist is dead config, and dead config is how a register
// stops being read (the ADR-0088 finding about no-op flag pins, one file along).
for (const id of exempt.keys()) {
  if (!adrs.includes(id)) {
    problems.push(`scripts/adr-coverage.json exempts ADR-${id}, which does not exist.`);
  }
}

if (problems.length > 0) {
  console.error('ADR coverage is out of date:\n');
  for (const p of problems) console.error(`  - ${p}\n`);
  console.error(
    'See docs/RECONCILE.md §1. Three reconciliation passes found this by hand before it\n' +
      'was gated; fix the roadmap or the register, not this script.',
  );
  process.exit(1);
}

const covered = adrs.length - exempt.size;
console.log(
  `ADR coverage OK (${String(covered)} of ${String(adrs.length)} ADRs cited in docs/ROADMAP.md, ` +
    `${String(exempt.size)} exempt by written reason).`,
);
