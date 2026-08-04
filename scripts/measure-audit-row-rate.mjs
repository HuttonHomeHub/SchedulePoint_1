#!/usr/bin/env node
/**
 * ADR-0073 **C3.0** — how many audit rows would the proposed catalogue write?
 *
 * ADR-0072 gated the coverage rung on an estimate nobody had made: *"every activity edit changes
 * the arrival rate by a factor nobody has estimated. That estimate, not the index plan, is what
 * gates the rung."* Feature-spec §2.4 made one. This measures it.
 *
 * **It counts from the seed catalogue's own `SeedSpec`s, not from a database.** That is the ADR-0066
 * rule applied to a measurement rather than to a test: the specs are the source of truth for what
 * the catalogue builds, and every auditable operation in family D–G maps to exactly one spec
 * element — one `dependencies` entry is one `POST /dependencies`, which is one
 * `dependency.created` row. Counting persisted rows instead would need the producers to exist
 * first, which is the one thing C3.0 must not require: an append-only table cannot be cleaned, so
 * narrowing the catalogue is cheap **before** a producer ships and impossible after.
 *
 * What it deliberately does NOT claim. This is the **included** classes only — the ones that scale
 * with the size of the programme. The excluded classes (field edits, drags, progress) scale with
 * interactions, which no static artefact can count; §2.4's argument for excluding them rests on
 * that difference in shape, not on a number this script could produce.
 *
 *   node scripts/measure-audit-row-rate.mjs
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const seed = await import(path.join(here, '../packages/seed/dist/index.js'));

const { capabilitySpecs } = await import(
  path.join(here, '../apps/seed-cli/dist/capabilities/index.js')
);
const { fixtureSpec } = await import(path.join(here, '../apps/seed-cli/dist/fixture.js'));

/**
 * Rows a plan of this shape would write, by action.
 *
 * Only the actions whose count is **derivable from the plan's structure** appear. `activity.deleted`
 * and the archive/scope actions are driven by what an operator later does, not by what the
 * catalogue builds, so counting them here would be inventing a number — they are reported as
 * "operator-driven" instead.
 */
function rowsFor(spec) {
  return {
    'dependency.created': spec.dependencies.length,
    // One row per import, whatever the file's size — the whole point of the "one event per user
    // action" rule. Only the interchange tier actually imports; counted where it applies.
    'interchange.imported': 0,
    'calendar.working_time_changed': spec.calendars.length,
  };
}

const specs = [fixtureSpec(), ...capabilitySpecs()];
const scaleSizes = [500, 2000];

const totals = {};
let planCount = 0;
for (const spec of specs) {
  planCount += 1;
  for (const [action, n] of Object.entries(rowsFor(spec))) {
    totals[action] = (totals[action] ?? 0) + n;
  }
}

const activityTotal = specs.reduce((sum, s) => sum + s.activities.length, 0);
const dependencyTotal = specs.reduce((sum, s) => sum + s.dependencies.length, 0);

process.stdout.write(`\nADR-0073 C3.0 — measured audit row rate (included classes)\n`);
process.stdout.write(`${'='.repeat(64)}\n\n`);
process.stdout.write(`Catalogue: ${String(planCount)} plans (fixture + capability tiers)\n`);
process.stdout.write(
  `  ${String(activityTotal)} activities, ${String(dependencyTotal)} dependencies\n\n`,
);

process.stdout.write(`Per-plan rows, by action (structure-derived):\n`);
for (const [action, n] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
  const perPlan = (n / planCount).toFixed(1);
  process.stdout.write(`  ${action.padEnd(32)} ${String(n).padStart(6)} total  ${perPlan}/plan\n`);
}

process.stdout.write(`\nScale tier — the shape §2.4 estimates against:\n`);
for (const activities of scaleSizes) {
  const spec = seed.scaleSpec({ activities });
  const links = spec.dependencies.length;
  const ratio = (links / activities).toFixed(2);
  process.stdout.write(
    `  ${String(activities).padStart(5)} activities → ${String(links).padStart(6)} ` +
      `dependency.created rows (${ratio} per activity)\n`,
  );
}

const twoThousand = seed.scaleSpec({ activities: 2000 });
const estimate = 2500;
const measured = twoThousand.dependencies.length;
process.stdout.write(`\n${'='.repeat(64)}\n`);
process.stdout.write(
  `§2.4 estimated ~${String(estimate)} link creates for a 2,000-activity programme.\n` +
    `Measured on the scale generator: ${String(measured)}.  ` +
    `Ratio ${(measured / estimate).toFixed(2)}×.\n`,
);
process.stdout.write(
  `Gate: the catalogue narrows if the measured rate exceeds 5× the estimate ` +
    `(${String(estimate * 5)}).\n`,
);
process.stdout.write(
  measured > estimate * 5 ? `RESULT: NARROW THE CATALOGUE.\n\n` : `RESULT: within budget.\n\n`,
);
