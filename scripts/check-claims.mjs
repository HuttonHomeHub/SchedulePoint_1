#!/usr/bin/env node
/**
 * Verifies every claim this repository makes about a **dependency's internals** (ADR-0076).
 *
 * ## Why this exists
 *
 * SchedulePoint's docs and docblocks cite `better-auth` and `better-call` source by file and line
 * — 34 distinct citations at the time of writing — and they are load-bearing rather than
 * decorative. Whole decisions rest on them: ADR-0074 hashes reset tokens because
 * `processIdentifier` returns the identifier unchanged with no `verification` key configured;
 * ADR-0075 rejects an abort-on-send-failure design because `sign-up.mjs` answers a duplicate
 * address with a synthetic 200; the mail adapter swallows a verification error because
 * `email-verification.mjs` ends its uniform block with `if (error) throw error`.
 *
 * **None of that is in this repository, and nothing in this repository was watching it.** A
 * Dependabot minor bump moves every one of those lines and every citation rots silently — the
 * prose still reads as authoritative, the line numbers still look precise, and the decisions they
 * justify are now resting on nothing. That is not hypothetical drift: within one session an ADR
 * was written citing `better-auth@1.3.27` at `dist/api/create-context.mjs` from memory, when the
 * installed version is 1.6.25 and the path is `dist/context/create-context.mjs`.
 *
 * ADR-0058's rule is that what can be computed should be. A citation is computable.
 *
 * ## What it checks
 *
 * 1. **Version pin.** Every claim was verified against a specific installed version. If the
 *    installed version has moved, the whole set for that package is stale — not necessarily
 *    wrong, but no longer *verified*, which is the property the register asserts. Fails loudly
 *    and names re-verification as the fix, because bumping the recorded version without reading
 *    the code turns this gate into a rubber stamp.
 * 2. **Anchor.** The recorded snippet must still appear within the cited line range. This catches
 *    a citation that was wrong when it was written, which a version pin alone cannot.
 * 3. **Completeness.** Every `<file>.mjs:<line>` reference in `docs/` and in the app sources must
 *    be in the register. This is the half that keeps the register honest over time: a new
 *    citation cannot be added without recording what it says and what proves it.
 *
 * ## What it deliberately does NOT check
 *
 * That the **prose around** the citation describes the code correctly. A human wrote "this
 * function awaits" beside a line, and only a human can say whether that reading is right. What
 * this guarantees is narrower and still worth having: the line is where we said it was, in the
 * version we said we read.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const register = JSON.parse(readFileSync(join(root, 'scripts/dependency-claims.json'), 'utf8'));

/** Resolve an installed package's real directory through pnpm's content-addressed store. */
function installed(name) {
  const store = join(root, 'node_modules/.pnpm');
  const dir = readdirSync(store).find(
    (entry) => entry.startsWith(`${name}@`) && statSync(join(store, entry)).isDirectory(),
  );
  if (!dir) return null;
  const version = /@(\d+\.\d+\.\d+)/.exec(dir)?.[1];
  return { version, dir: join(store, dir, 'node_modules', name) };
}

const problems = [];

// (1) Version pin — checked once per package, before any anchor, because a moved version explains
// every anchor failure that follows and reporting 34 of them would bury the actual cause.
const stale = new Set();
for (const [name, expected] of Object.entries(register.verifiedAgainst)) {
  const pkg = installed(name);
  if (!pkg) {
    problems.push(`${name}: not installed — cannot verify any claim about it.`);
    stale.add(name);
    continue;
  }
  if (pkg.version !== expected) {
    stale.add(name);
    problems.push(
      `${name}: claims were verified against ${expected}, ${pkg.version} is installed.\n` +
        `    Re-READ each cited location in the new version and update the anchors, then bump\n` +
        `    "verifiedAgainst". Bumping the version alone makes this gate a rubber stamp.`,
    );
  }
}

// (2) Anchors.
for (const claim of register.claims) {
  if (stale.has(claim.package)) continue;
  const pkg = installed(claim.package);
  const file = join(pkg.dir, claim.path);
  let source;
  try {
    source = readFileSync(file, 'utf8').split('\n');
  } catch {
    problems.push(`${claim.ref}: ${claim.package}/${claim.path} does not exist.`);
    continue;
  }
  const [start, end] = claim.lines.split('-').map(Number);
  const range = source.slice(start - 1, end ?? start).join('\n');
  if (!range.includes(claim.anchor)) {
    problems.push(
      `${claim.ref}: the anchor is no longer at ${claim.path}:${claim.lines}.\n` +
        `    expected: ${claim.anchor}\n` +
        `    cited by: ${claim.citedBy.join(', ')}`,
    );
  }
}

// (3) Completeness — every citation in the tree is registered.
const CITATION = /\b([a-z0-9-]+\.mjs):(\d+(?:-\d+)?)/g;
const known = new Set(register.claims.map((c) => c.ref));
const found = new Map();
for (const dir of ['docs', 'apps/api/src', 'apps/web/src', 'apps/api/test']) {
  (function walk(d) {
    for (const entry of readdirSync(join(root, d), { withFileTypes: true })) {
      const rel = join(d, entry.name);
      if (entry.isDirectory()) {
        walk(rel);
      } else if (/\.(md|ts|tsx|mjs)$/.test(entry.name)) {
        const text = readFileSync(join(root, rel), 'utf8');
        for (const [, base, lines] of text.matchAll(CITATION)) {
          const ref = `${base}:${lines}`;
          if (!found.has(ref)) found.set(ref, new Set());
          found.get(ref).add(rel);
        }
      }
    }
  })(dir);
}
for (const [ref, where] of [...found].sort()) {
  if (known.has(ref)) continue;
  problems.push(
    `${ref}: cited in ${[...where].join(', ')} but not in scripts/dependency-claims.json.\n` +
      `    Add it — record the package, the path, the line range and a short anchor from the\n` +
      `    code you actually read. A citation nobody re-read is the thing this gate is for.`,
  );
}

// A registered claim nobody cites any more is dead weight, and dead weight is what makes a
// register stop being read. Reported, not failed — deleting is a judgement call.
for (const claim of register.claims) {
  if (!found.has(claim.ref)) {
    console.warn(
      `  note: ${claim.ref} is registered but no longer cited anywhere. Consider removing it.`,
    );
  }
}

if (problems.length > 0) {
  console.error('Dependency-internal claims are out of date:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const pinned = Object.entries(register.verifiedAgainst)
  .map(([name, version]) => `${name}@${version}`)
  .join(', ');
console.log(`Dependency claims OK (${register.claims.length} claims against ${pinned}).`);
