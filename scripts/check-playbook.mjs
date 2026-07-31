#!/usr/bin/env node
/**
 * `pnpm check:playbook` — every plan the playbook names must exist, and every plan the builders
 * produce must be in the playbook (ADR-0066 M5.3).
 *
 * ## What this gates, and what it deliberately does not
 *
 * `docs/TEST_PLAYBOOK.md` is prose, and prose rots — that is ADR-0058's whole subject. This check
 * cannot read a sentence and decide whether it still describes the product. What it *can* do is
 * catch the failure that makes the rest worthless: a row pointing at a plan that no longer exists,
 * or a plan nobody documented.
 *
 * Both directions matter, and the second is the one worth the effort. A missing row means a
 * capability was added to the catalogue and nobody wrote down how to tell right from wrong — so it
 * gets seeded, looks plausible, and demonstrates nothing. That is exactly the state the catalogue
 * was built to end.
 *
 * The inventory comes from `seed --list-plans`, which builds the specs in memory. It is not a
 * hand-kept list, because a hand-kept list would drift in precisely the way this check exists to
 * prevent — and it needs no server, no database and no credentials, so CI can run it.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const playbookPath = join(root, 'docs/TEST_PLAYBOOK.md');

/** Rows key their plan as `plan:<seedName>`, which is unambiguous in prose and easy to grep. */
const PLAN_REFERENCE = /`plan:([A-Za-z0-9._-]+)`/g;

const playbook = readFileSync(playbookPath, 'utf8');
const referenced = new Set([...playbook.matchAll(PLAN_REFERENCE)].map((match) => match[1]));

let listed;
try {
  listed = execFileSync(
    'pnpm',
    ['--filter', '@repo/seed-cli', 'exec', 'tsx', 'src/main.ts', '--list-plans'],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch (error) {
  console.error('Could not enumerate the catalogue. `seed --list-plans` failed:\n');
  console.error(error.stdout ?? '', error.stderr ?? error.message);
  process.exit(1);
}

const built = new Map();
for (const line of listed.split('\n')) {
  const [tier, seedName, name] = line.split('\t');
  if (seedName === undefined || name === undefined) continue;
  built.set(seedName, { tier, name });
}

if (built.size === 0) {
  // A silent empty inventory would make every check below trivially pass, which is the one failure
  // mode a gate must not have.
  console.error('`seed --list-plans` produced no plans. The check cannot mean anything; failing.');
  process.exit(1);
}

const missingFromCatalogue = [...referenced].filter((id) => !built.has(id)).sort();
const missingFromPlaybook = [...built.keys()].filter((id) => !referenced.has(id)).sort();

if (missingFromCatalogue.length === 0 && missingFromPlaybook.length === 0) {
  console.log(
    `Playbook OK — ${String(built.size)} plans, every one documented and every reference resolvable.`,
  );
  process.exit(0);
}

console.error('docs/TEST_PLAYBOOK.md and the seed catalogue disagree.\n');

if (missingFromCatalogue.length > 0) {
  console.error('  Named in the playbook but NOT produced by the builders:');
  for (const id of missingFromCatalogue) console.error(`    plan:${id}`);
  console.error(
    '\n  A reader following one of these rows would seed nothing and conclude the feature is\n' +
      '  broken. Either the plan was renamed, or the row is left over from one that was deleted.\n',
  );
}

if (missingFromPlaybook.length > 0) {
  console.error('  Produced by the builders but NOT in the playbook:');
  for (const id of missingFromPlaybook) {
    const entry = built.get(id);
    console.error(`    plan:${id}  (${entry.tier}) ${entry.name}`);
  }
  console.error(
    '\n  Each of these gets seeded and demonstrates nothing, because nobody wrote down what to\n' +
      '  look at or what wrong looks like. Add a row with all five columns — the "wrong" column\n' +
      '  is the one that makes the rest useful.\n',
  );
}

process.exit(1);
