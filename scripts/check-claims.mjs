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
 * 3. **Completeness.** Every citation of a cited-extension file by line in `docs/` and in the app
 *    sources must be in the register — in either the `file.mjs:234` form or the prose form
 *    "`file.mjs`, lines **234**". This is the half that keeps the register honest over time: a new
 *    citation cannot be added without recording what it says and what proves it.
 *
 * ## The extension class, and why it is ONE list
 *
 * What counts as a citable file lives in `scripts/lib/citation-patterns.mjs`, as a single
 * `CITED_EXTENSIONS` constant feeding **both** the two recognisers and the `git ls-files` argument
 * list that excludes this repository's own files. That symmetry is the gate's central invariant
 * and it is asserted, not described: `scripts/lib/citation-patterns.test.mjs` runs first in the
 * `check:claims` script.
 *
 * It is one list because writing it twice is how the hole in `docs/TECH_DEBT.md` **#240** was made.
 * Both patterns ended `\.m?js`, written separately from the exclusion's `'*.js' '*.mjs' '*.cjs'`,
 * so the matcher and the exclusion disagreed about what JavaScript even is — and a `.css` or
 * `.d.ts` citation was invisible in **both** directions: never demanded when unregistered, and a
 * register entry for one reading as uncited. Both halves failed towards green, which is why nothing
 * ever went red. And widening only the obvious half is worse than leaving it: measured, patterns
 * alone produces **87 findings** on the first run, nearly all this repository's own stylesheets,
 * because the exclusion could not see them (`docs/specs/claims-citation-scan/m0-measurement.md`).
 *
 * ## Three ownership categories, not two
 *
 * A cited file is one of: **a dependency's** (register it), **ours** (excluded — no version to pin
 * and nothing to rot), or **neither**. The third is `FOREIGN_UNVERIFIABLE`, and it is deliberately
 * one name: the previous Flask application's `auth.css`, which no installed package resolves and
 * `git ls-files` will never list, yet whose line ranges are load-bearing evidence in ADR-0077 and
 * `docs/DESIGN_SYSTEM.md`. Its admission rule is written beside it so it cannot become a bin.
 *
 * ## What it deliberately does NOT check
 *
 * That the **prose around** the citation describes the code correctly. A human wrote "this
 * function awaits" beside a line, and only a human can say whether that reading is right. What
 * this guarantees is narrower and still worth having: the line is where we said it was, in the
 * version we said we read.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

import { CITATIONS, FOREIGN_UNVERIFIABLE, ownGlobs } from './lib/citation-patterns.mjs';

const root = new URL('..', import.meta.url).pathname;
const register = JSON.parse(readFileSync(join(root, 'scripts/dependency-claims.json'), 'utf8'));

/**
 * Resolve an installed package's real directory through pnpm's content-addressed store.
 *
 * **Resolved through the LINK, not by scanning the store** (`docs/TECH_DEBT.md` #178). The previous
 * implementation scanned `node_modules/.pnpm` and took the FIRST directory whose name started with
 * `<name>@` — and pnpm does not eagerly unlink a superseded version, so immediately after a bump the
 * store holds both and `readdirSync` returned the older one. That produced a WRONG answer rather
 * than a missing one: the gate reported "claims were verified against 7.86.0, 7.84.0 is installed"
 * against a register that was freshly and correctly updated. A gate that lies about which version
 * it checked is worse than one that says nothing, because the fix looks like reverting the register.
 *
 * A symlink cannot be stale in that way: it points at what this workspace actually loads. It also
 * removes the store's own naming as a parsing problem — pnpm flattens the scope separator
 * (`@better-fetch/fetch` is stored as `@better-fetch+fetch@1.3.1`) and appends peer hashes, and the
 * version now comes from the resolved `package.json` rather than from a directory name.
 *
 * **Two workspaces on different versions is refused, not resolved.** The register holds one
 * `verifiedAgainst` per package, so a split estate leaves it unable to describe the code that ships
 * — whichever way it is set. ADR-0107 met exactly this while bumping `better-auth` in one workspace
 * and not the other, and worked around it by only ever installing one version; this makes that
 * assumption checkable instead of remembered.
 */
function installed(name) {
  // **A transitive package is resolved through the dependent the claim is about.** `axe-core` is
  // installed TWICE, legitimately: `@axe-core/playwright` loads 4.13.0 and `eslint-plugin-jsx-a11y`
  // / `vitest-axe` load 4.12.1. "The installed version" is not a fact about the tree, it is a fact
  // about which consumer the claim concerns — so the register names it (`resolveVia`) rather than
  // leaving the script to pick. It picked, it picked the wrong one, and the gate reported a claim
  // as verified against a version the journeys do not run.
  const via = register.resolveVia?.[name];
  if (via !== undefined) {
    const host = installed(via);
    if (!host?.dir) return null;
    // pnpm links a dependency as a SIBLING of its dependent inside the store — `…/node_modules/
    // @axe-core/playwright` sits beside `…/node_modules/axe-core`, not above it — so the host's
    // `node_modules` root is its own directory with its package name trimmed off. The nested npm
    // layout is tried second, because both are real and neither is universal.
    const hostRoot = host.dir.endsWith(via) ? host.dir.slice(0, -via.length) : null;
    for (const candidate of [
      ...(hostRoot === null ? [] : [join(hostRoot, name)]),
      join(host.dir, 'node_modules', name),
    ]) {
      try {
        const real = realpathSync(candidate);
        const version = JSON.parse(readFileSync(join(real, 'package.json'), 'utf8')).version;
        return { version, dir: real };
      } catch {
        /* try the next layout */
      }
    }
    return null;
  }

  // Every place the package could be LINKED: the root and each workspace. pnpm links a dependency
  // into the workspace that declares it, so this is where "what is actually installed" lives.
  const roots = [
    root,
    ...['apps', 'packages'].flatMap((group) => {
      const dir = join(root, group);
      try {
        return readdirSync(dir).map((entry) => join(dir, entry));
      } catch {
        return [];
      }
    }),
  ];

  const found = new Map();
  for (const base of roots) {
    const link = join(base, 'node_modules', name);
    let real;
    try {
      real = realpathSync(link);
    } catch {
      continue;
    }
    try {
      const version = JSON.parse(readFileSync(join(real, 'package.json'), 'utf8')).version;
      if (typeof version === 'string') found.set(version, real);
    } catch {
      /* a link with no readable manifest is not an install */
    }
  }

  // A transitive dependency is linked into no workspace at all. Fall back to the store — but
  // requiring a SINGLE match, so the ambiguity that produced #178's wrong answer is reported rather
  // than resolved by whichever name `readdirSync` returns first.
  if (found.size === 0) {
    const store = join(root, 'node_modules/.pnpm');
    const stored = `${name.replace('/', '+')}@`;
    const dirs = readdirSync(store).filter(
      (entry) => entry.startsWith(stored) && /^\d/.test(entry.slice(stored.length)),
    );
    if (dirs.length === 0) return null;
    if (dirs.length > 1) {
      const versions = dirs
        .map((d) => /@(\d+\.\d+\.\d+)/.exec(d.slice(stored.length - 1))?.[1])
        .filter(Boolean)
        .sort();
      return { version: null, dir: null, conflict: [...new Set(versions)], ambiguous: true };
    }
    const dir = dirs[0];
    const version = /@(\d+\.\d+\.\d+)/.exec(dir.slice(stored.length - 1))?.[1];
    return { version, dir: join(store, dir, 'node_modules', name) };
  }
  if (found.size > 1) {
    // Two workspaces on different versions makes "the installed version" meaningless, and the
    // register holds ONE `verifiedAgainst` per package — so a citation could be re-read against
    // either and the gate could not say which. Refused loudly rather than resolved by picking.
    return { version: null, dir: null, conflict: [...found.keys()].sort() };
  }
  const [version, dir] = [...found][0];
  return { version, dir };
}

/**
 * Basenames of this repository's OWN cited files, so the completeness scan can tell a dependency
 * citation from a self-citation.
 *
 * **Not "JavaScript" any more** (`docs/TECH_DEBT.md` #240) — it never quite was, since this already
 * listed `*.cjs` while the patterns could not match one. It now covers every member of
 * `CITED_EXTENSIONS`.
 *
 * Without this the scan demands a register entry for `check-counts.mjs:42` — a file sitting in this
 * repo, readable by anyone, with no version to pin and nothing to rot. It is not just `scripts/`:
 * `packages/config/eslint/react.js` and `apps/web/public/theme-boot.js` are both cited by line in
 * ADR-0077's artefacts.
 *
 * **The exclusion is by basename, so a shared basename is a blind spot** — an unregistered
 * `index.js:12` in a dependency would be skipped if this repo also had an `index.js`. It does not —
 * the set this function returns was printed and read, and holds no `index.js` or `index.mjs` — and
 * `@better-fetch/fetch`'s `index.js:733-739` is registered anyway, since a registered ref is
 * accepted before this set is consulted. Recorded as `docs/TECH_DEBT.md` #101 rather than solved
 * with path matching, because prose cites `dist/api/routes/sign-in.mjs` and `sign-in.mjs`
 * interchangeably and neither form is wrong.
 *
 * **#240 enlarges that blind spot, and here is its exact shape today.** The set now also holds
 * `globals.css`, `print-document.css`, `PrintSurface.css`, `GanttPrintSurface.css`,
 * `HealthPrintDocument.css`, `m0-recovered-block.css` and `vite-env.d.ts`, so a dependency file
 * sharing one of those basenames would be silently skipped. **No dependency in this tree collides
 * with any of them** — checked, not assumed: Tailwind ships `preflight.css`, `theme.css`,
 * `utilities.css` and `index.css`, and none of the registered packages ships a `globals.css` or a
 * `vite-env.d.ts`. #101's trade still holds, and it is bounded rather than open.
 */
function ownBasenames() {
  const names = new Set();
  // **Derived from `CITED_EXTENSIONS`, not listed** (`docs/TECH_DEBT.md` #240). Widening the
  // patterns without widening this is not a smaller version of the change — it is a different and
  // much worse one: measured, it turns **94** citations of this repository's own `globals.css`,
  // `PrintSurface.css` and `GanttPrintSurface.css` into gate failures on the first run, against 7
  // when both halves move together. A gate that fails on day one gets deleted rather than fixed
  // (ADR-0058), so the two are one constant apart on purpose.
  for (const line of execFileSync('git', ['ls-files', ...ownGlobs()], {
    cwd: root,
    encoding: 'utf8',
  }).split('\n')) {
    if (line) names.add(line.slice(line.lastIndexOf('/') + 1));
  }
  return names;
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
  if (pkg.conflict) {
    stale.add(name);
    problems.push(
      pkg.ambiguous
        ? `${name}: installed at ${pkg.conflict.join(' and ')} — more than one copy in the store,\n` +
            `    and it is linked into no workspace, so which one a claim is about is not a fact\n` +
            `    about the tree. Name the dependent whose copy it concerns in "resolveVia".`
        : `${name}: installed at ${pkg.conflict.join(' and ')} in different workspaces.\n` +
            `    The register holds ONE verified version per package, so it cannot describe both.\n` +
            `    Align the workspaces before re-verifying (docs/TECH_DEBT.md #178).`,
    );
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
//
// TWO forms, because the register was silently missing half its input. The gate shipped matching
// only `file.mjs:234`, and ADR-0077's own artefacts wrote the same four citations as
// "`dist/api/routes/sign-in.mjs`, lines **234**" — prose the regex never saw. `pnpm check:claims`
// passed for the wrong reason, on the day it was written, in the epic that widened it. That is the
// ADR-0076 Class 2 failure the gate exists to stop, inside the gate.
// The basename class admits `.` so a DOTTED basename is captured whole. It did not, and
// `dist/throttler.guard.js:148-150` was therefore read as `guard.js:148-150` — a ref that can never
// match its register entry, so the citation was simultaneously "unregistered" and the entry
// "uncited". This is a THIRD hole, not one of the two `docs/TECH_DEBT.md` #101 records: it was found
// by acting on #101's item 2 and would have stayed invisible while the only dotted-basename
// dependency file nobody had cited yet went uncited. `/` is deliberately absent from the class, so a
// leading path still falls away.

/**
 * This file is not scanned for citations.
 *
 * Its comments carry worked EXAMPLES of the two forms above (`sign-in.mjs:234-240`, `file.mjs:234`),
 * and a gate that reads its own documentation as input demands that every example be a real
 * registered claim — which would make the format impossible to document. Excluding one file by name
 * is the smaller cost, and it is the only file in the tree whose job is to describe the notation.
 */
const CITATION_SCAN_EXCLUDES = new Set([
  'scripts/check-claims.mjs',
  // The patterns and their worked examples moved here at `docs/TECH_DEBT.md` #240, and the
  // exclusion had to move with them — otherwise the module defining the notation demands a register
  // entry for every example of it, which is the exact trap the docblock above describes. Two files
  // now, for one job, and the set stays that narrow deliberately.
  'scripts/lib/citation-patterns.mjs',
]);
const own = ownBasenames();
const known = new Set(register.claims.map((c) => c.ref));
const found = new Map();
// `scripts/` is in the walk because that is where the measurement harnesses live, and a harness is
// one of the likeliest things in the tree to rest on a dependency's internals — `measure-band-copy`
// reads `@nestjs/throttler`'s key derivation to know what its own 429 count means. It was outside
// the scan until then, which is the ADR-0077 M0 blind spot one directory along: the gate cannot
// register what it does not read. Own-repo basenames are filtered below, so this repository's own
// `.mjs` files citing each other are not mistaken for dependency claims.
//
// `packages/` and `apps/seed-cli/` join it because `docs/TECH_DEBT.md` #101 said the fix was "one
// array literal plus whatever it turns up", and what they turn up is **nothing** — measured before
// adding them, so the widening is free rather than hopeful. Root-level markdown is deliberately
// still out: it would demand two more refs, one of which is CLAUDE.md's own worked example of this
// notation, and that is a judgement call rather than a free win. #101 stays open for it.
//
// **`apps/web/e2e-*` joins it, and that was a fourth hole rather than a widening.** The walk covered
// `apps/web/src` and none of the 39 journey directories — so a claim about a dependency's internals
// made in a Playwright suite was invisible to this gate in BOTH directions: it could not be
// registered, and it could not be noticed going stale on a bump. The docblock above already gives
// the reason it should have been in from the start ("a harness is one of the likeliest things in
// the tree to rest on a dependency's internals"), which is exactly why `scripts/` was added; a
// journey is a harness. Found by writing the first journey-side claim
// (`@axe-core/playwright`'s `dist/index.js:170-172`) and having the gate report it as registered
// but uncited.
//
// **Measured before adding, the way `packages/` was**: the 39 directories turn up exactly two
// refs, both already registered and zero unregistered — so this is free rather than hopeful. One
// of the two (`index.js:733-739`, cited by `e2e-public/public-screens.spec.ts`) had been a
// registered claim citing from an unscanned directory the whole time.
for (const dir of [
  'docs',
  'scripts',
  'packages',
  'apps/api/src',
  'apps/api/test',
  'apps/web/src',
  'apps/seed-cli',
  // Derived, not listed: a suite added later is scanned without anyone remembering to add it —
  // the same argument `apps/web/tsconfig.json` records for its own e2e glob.
  ...readdirSync(join(root, 'apps/web'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('e2e'))
    .map((e) => join('apps/web', e.name)),
]) {
  (function walk(d) {
    for (const entry of readdirSync(join(root, d), { withFileTypes: true })) {
      const rel = join(d, entry.name);
      if (entry.isDirectory()) {
        walk(rel);
      } else if (/\.(md|ts|tsx|mjs)$/.test(entry.name) && !CITATION_SCAN_EXCLUDES.has(rel)) {
        const text = readFileSync(join(root, rel), 'utf8');
        for (const pattern of CITATIONS) {
          for (const [, base, lines] of text.matchAll(pattern)) {
            const ref = `${base}:${lines.replace(/\s*[-–]\s*/, '-')}`;
            if (!found.has(ref)) found.set(ref, new Set());
            found.get(ref).add(rel);
          }
        }
      }
    }
  })(dir);
}
// **registered → own → foreign → finding.** A registered ref still wins first, which is the
// property that makes `index.js:733-739` work despite the basename blind spot above.
for (const [ref, where] of [...found].sort()) {
  const base = ref.slice(0, ref.lastIndexOf(':'));
  if (known.has(ref)) continue;
  if (own.has(base)) continue;
  if (FOREIGN_UNVERIFIABLE.has(base)) continue;
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
