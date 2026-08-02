#!/usr/bin/env node
/**
 * The **surface contract**, as a computed gate (ADR-0058 family, `docs/specs/engine-surface-audit.md`).
 *
 * A scheduling field is only finished when a planner can reach it. Four of the six findings in that
 * audit are the same defect: a field grew a storage half and an API half, never grew a UI half, and
 * nothing noticed for a year — `suspendDate` (authorable, and the recalculation does not even SELECT
 * it), the calendar exception's `endDate` (stored, returned, uncreatable), `remainingDurationMinutes`
 * (stored, consumed by the engine, absent from the API), and the assignment lag (implemented in the
 * histogram engine, with no column to hold it). Each looked correct in the layer its author was
 * working in. None of them is visible without holding two layers side by side, which is exactly the
 * comparison a script can do and a reviewer reliably will not.
 *
 * So: every writable field on a **scheduling-semantic** DTO, and every input the CPM engine accepts,
 * must be classified in `scripts/surface-contract.json` as one of
 *
 *   - `surface`  — a planner can author it; the value names where.
 *   - `exempt`   — deliberately has no planner surface; the value says why.
 *   - `gap`      — a known, recorded hole; the value names the audit finding that owns it.
 *
 * The gate fails on a field that is **unclassified**, not on one that is honestly marked a gap. That
 * is deliberate: a gate which fails on day one gets deleted rather than fixed (ADR-0058), and the
 * point is to stop *new* silent holes, not to block on the ones already written down. A `gap` entry
 * flips to `surface` when the fix lands, and `--gaps` prints what is still owed.
 *
 * **Scope is scheduling, not CRUD.** Clients, projects, organisations, members, invitations, notes
 * and shares are plain create/read/update surfaces where a missing field is obvious the first time
 * anyone opens the screen. The defect class this gate exists for lives where a value passes through
 * storage, an engine and a form — so that is what it covers, and widening it later is a one-line
 * change to MODULES below.
 *
 * **What it cannot catch, stated so nobody trusts it further than it goes.** It enumerates fields
 * that *exist*. It therefore sees "this field has no surface" (F3, F7) and, once a human classifies
 * it, "this field's surface does not reach the engine" (F1). It is blind to a field that **should
 * exist and does not** — the calendar exception's missing `endDate` on the create DTO (F2) and the
 * missing `lag` column on `ResourceAssignment` (F6) are absences, and there is nothing to enumerate.
 * Those still need a human comparing a storage model against a write path. Half the audit's findings
 * are of that kind; a gate that claimed otherwise would be the same over-confidence it exists to fix.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

/** The modules whose write DTOs carry scheduling meaning. See the scope note above. */
const MODULES = [
  'activities',
  'dependencies',
  'cross-plan-dependencies',
  'plans',
  'calendars',
  'resources',
  'baselines',
];

/** Engine input structs — the other side of the comparison. */
const ENGINE_TYPES = [
  'EngineActivity',
  'EngineEdge',
  'EngineResource',
  'EngineAssignment',
  'LevelingOptions',
];

const REGISTRY_PATH = 'scripts/surface-contract.json';

/**
 * Fields every write DTO carries as plumbing rather than schedule meaning. Excluded globally so the
 * registry stays about decisions: `version` is the optimistic-lock token (ADR-0022), and the rest are
 * identifiers a planner supplies by navigating rather than by typing into a scheduling control.
 */
const PLUMBING = new Set(['version', 'editedField']);

/** Property lines on a class/interface: two-space indent, optional `readonly`, optional `?`/`!`. */
const PROPERTY = /^ {2}(?:readonly )?([a-zA-Z][a-zA-Z0-9]*)[?!]?:/gm;

function fieldsOf(source) {
  const names = new Set();
  for (const [, name] of source.matchAll(PROPERTY)) if (!PLUMBING.has(name)) names.add(name);
  return names;
}

/** Every writable field, keyed `module/dto-basename.field`. */
function dtoFields() {
  const keys = [];
  for (const module of MODULES) {
    const dir = `apps/api/src/modules/${module}/dto`;
    let entries;
    try {
      entries = readdirSync(new URL(dir, root));
    } catch {
      throw new Error(`${dir} does not exist — has a module been renamed? Update MODULES.`);
    }
    for (const file of entries) {
      if (!/^(create|update|replace)-.*\.dto\.ts$/u.test(file)) continue;
      const base = file.replace(/\.dto\.ts$/u, '');
      for (const field of fieldsOf(read(`${dir}/${file}`))) keys.push(`${module}/${base}.${field}`);
    }
  }
  return keys;
}

/** Every engine input field, keyed `engine/<Struct>.field`. */
function engineFields() {
  const types = read('apps/api/src/modules/schedule/engine/types.ts');
  const compute = read('apps/api/src/modules/schedule/engine/compute.ts');
  const keys = [];
  for (const struct of [...ENGINE_TYPES, 'ComputeOptions']) {
    const source = struct === 'ComputeOptions' ? compute : types;
    const block = new RegExp(`export interface ${struct} \\{([\\s\\S]*?)\\n\\}`, 'u').exec(source);
    if (block === null) {
      throw new Error(
        `engine struct ${struct} not found — has it been renamed? Update ENGINE_TYPES.`,
      );
    }
    for (const field of fieldsOf(block[1])) keys.push(`engine/${struct}.${field}`);
  }
  return keys;
}

const registry = JSON.parse(read(REGISTRY_PATH));
const required = [...dtoFields(), ...engineFields()].sort();

if (process.argv.includes('--init')) {
  // Emit a skeleton for a first population; every unknown lands as an explicit TODO so the author
  // classifies it rather than the script guessing and being quietly wrong.
  const next = Object.fromEntries(required.map((key) => [key, registry[key] ?? { gap: 'TODO' }]));
  writeFileSync(new URL(REGISTRY_PATH, root), `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Wrote ${String(required.length)} keys to ${REGISTRY_PATH}.`);
  process.exit(0);
}

const VALID = ['surface', 'exempt', 'gap'];
const unclassified = [];
const malformed = [];
const stale = Object.keys(registry).filter((key) => !required.includes(key));

for (const key of required) {
  const entry = registry[key];
  if (entry === undefined) {
    unclassified.push(key);
    continue;
  }
  const kinds = VALID.filter((kind) => typeof entry[kind] === 'string' && entry[kind].length > 0);
  if (kinds.length !== 1) malformed.push(key);
}

if (process.argv.includes('--gaps')) {
  const gaps = required.filter((key) => typeof registry[key]?.gap === 'string');
  if (gaps.length === 0) console.log('No open surface gaps.');
  else {
    console.log(`${String(gaps.length)} field(s) with no planner surface:\n`);
    for (const key of gaps) console.log(`  • ${key} — ${registry[key].gap}`);
  }
  process.exit(0);
}

if (unclassified.length > 0 || malformed.length > 0 || stale.length > 0) {
  console.error('Surface contract not satisfied:\n');
  for (const key of unclassified) {
    console.error(`  • ${key} is unclassified. Add it to ${REGISTRY_PATH} as exactly one of`);
    console.error(
      `    {"surface": "where a planner authors it"} | {"exempt": "why not"} | {"gap": "finding"}.`,
    );
  }
  for (const key of malformed) {
    console.error(`  • ${key} must carry exactly one non-empty key of ${VALID.join(' | ')}.`);
  }
  for (const key of stale) {
    console.error(`  • ${key} is in the registry but no longer exists — delete the entry.`);
  }
  console.error('\nA field is not finished when it is stored and accepted. It is finished when a');
  console.error('planner can reach it, or when a written reason says they never will.');
  process.exit(1);
}

const counts = Object.fromEntries(
  VALID.map((kind) => [
    kind,
    required.filter((key) => typeof registry[key][kind] === 'string').length,
  ]),
);
console.log(
  `Surface contract OK — ${String(required.length)} scheduling fields classified ` +
    `(${String(counts.surface)} with a surface, ${String(counts.exempt)} exempt, ${String(counts.gap)} known gaps).`,
);
