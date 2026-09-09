// @ts-check
/**
 * **A spec header states its approval, and a citation is what closes it.**
 *
 * `docs/specs/spec-status-gate/`, closing `docs/TECH_DEBT.md` #274.
 *
 * Fifty-four spec documents behind shipped, ADR-filed work were still headed
 * `**Status:** Draft — awaiting approval before implementation.` A header is the first thing a
 * reader sees, and every one of those said the live surface underneath it had never been approved.
 * Nobody was negligent: `docs/PROCESS.md` names the header as the artefact's front matter and names
 * no step that revisits it, so it drifted **by being nobody's step**. That is the ADR-0058 line
 * exactly — replace the vigilance with something computed — and it is why this ships as a gate
 * rather than as a sweep. A sweep fixes today's fifty-four and guarantees tomorrow's.
 *
 * **The predicate: a spec directory named by any file in `docs/adr/` may not be headed `Draft`.**
 * Not "cited by an *Accepted* ADR" — measured, eleven ADRs are `Proposed` and four of those
 * (0029/0030/0031/0032) are live production surfaces, so keying on the ADR's own status would
 * silently miss the loudest cases. Silent under-inclusion is the failure direction
 * `doc-register.mjs:105-109` singles out. The claim is narrow and true: an ADR citing a spec is the
 * record that that spec's design was taken up as a decision, and a document cannot simultaneously
 * be the source of a filed decision and be awaiting approval before implementation. It does **not**
 * claim the work shipped — `docs/adr/0083-shaded-form-fields.md:3-5` is a filed ADR with nothing
 * built — which is why `Approved` is admitted for a cited spec and only `Draft` is refused.
 *
 * **The join runs directory-first**, and that is load-bearing: iterate the slugs that exist on disk
 * and ask whether any ADR names each, never the reverse. A dangling citation then costs nothing
 * (ADR-0029's four cite `docs/specs/*.md` files that live in `docs/plans/`), and the regex cannot
 * invent a population, because everything it yields is intersected with what is on disk.
 *
 * **Finding is generous; refusing is strict** (ADR-0124). The reader accepts `- `, `* `, `> ` and
 * bare header forms via {@link headerField}, because a header in the wrong shape is still a header
 * and a parser that skips it reports green over the gap. S5 is the separate strict pass that
 * refuses anything but the canonical `- **Status:** `.
 *
 * **No `warnings` array is declared here, deliberately.** `report()`'s warnings path returns 2
 * unconditionally — regardless of `advisory` — and under `prepush.sh`'s inverted `ADVISORY_GATES`
 * default a 2 from a gate that is not declared advisory **blocks**, with nothing on screen saying
 * why. `check-debt-status.mjs:49-53` records the same decision. Every finding below is closed by
 * editing one line of one named file, which is exit 1 by the convention `prepush.sh:39-56` states.
 *
 * **What this gate structurally cannot see**, stated here rather than discovered later:
 * 1. A spec no ADR cites — **18 `Draft` documents** at M0, a quarter of the population. The trigger
 *    to revisit is a reconciliation pass finding a shipped, uncited spec still headed `Draft`; that
 *    is a debt row, not a gate change, because every alternative predicate measured worse.
 * 2. Whether an `Approved` spec's work actually shipped. The gate refuses `Draft` and stops.
 * 3. Whether the prose after the token is true. `Accepted — shipped (ADR-0130)` is checked for the
 *    ADR resolving to a file, never for it being the right ADR.
 * 4. `docs/plans/` — the historical tree, excluded by the glob and by decision.
 * 5. Per-milestone sub-specs (`engine-conformance-framework/M<n>-…-feature-spec.md`, seven files).
 *    Excluded by the root-only glob; folding them in means deciding what a milestone's approval
 *    state is, which nothing in `docs/PROCESS.md` defines.
 *
 * **S6 is a departure from the approved spec's §4.6 table, and it is M0's.** §4.10 treated the
 * directories that are cited but hold no spec document as a documented blind spot. M0-T1 then
 * measured four of them — `canvas-decomposition` (ADR-0078), `canvas-maximisation` (ADR-0113),
 * `design-system-rewrite` (ADR-0097), `graphite` (ADR-0099/0102) — all shipped epics — and its
 * conclusion is quoted verbatim: *"it cannot be a silent skip: a silent skip is how the estate
 * reached this state."* A rule stated in a docblock and enforced by nothing is not a rule, so the
 * case is named in `scripts/spec-status.json` and S6 refuses any occupant that is not.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { headerField, report, stripFences } from './lib/doc-register.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SPECS = 'docs/specs';
const ADRS = 'docs/adr';
const REGISTER = 'scripts/spec-status.json';

/** The five-token vocabulary (spec §4.3), lower-cased for comparison. */
const VOCABULARY = ['draft', 'approved', 'accepted', 'superseded', 'withdrawn'];

/** The canonical header form S5 refuses anything else in favour of. */
const CANONICAL = '- **Status:** ';

/**
 * The leading token of a status value, normalised.
 *
 * Lifted from `check-debt-status.mjs:210-214` rather than re-derived, so the two registers agree
 * about what a token is. It has to strip emphasis: three specs are headed
 * `- **Status:** **Draft — awaiting approval.**`, and #274's own count missed all three by matching
 * a string instead of normalising a token — the fourth string-matching miscount of this population.
 */
function statusToken(value) {
  return (value.split(/[\s·—|]/)[0] ?? '').toLowerCase().replace(/[*_`.]/g, '');
}

/**
 * Read a repository-relative path under `root`.
 *
 * This is `readRepoDoc` with the root passed in rather than derived, and the reason is the whole
 * of {@link collectFindings}'s testability: the fixtures in `check-spec-status.test.mjs` are a
 * throwaway tree in `os.tmpdir()`, and a gate that can only ever read the real `docs/specs/` is a
 * gate whose assertions can only be verified against the estate they are about to change. The
 * guard `doc-register.mjs:38-48` records — a gate run from the wrong directory reading a
 * *different file* and reporting confidently about it — is preserved by the CLI below passing the
 * same `import.meta.dirname`-derived root that `readRepoDoc` computes for itself.
 */
function read(root, path) {
  return readFileSync(resolve(root, path), 'utf8');
}

/** Directories directly under `docs/specs/`, which are the slugs. */
function slugsOnDisk(ROOT) {
  return readdirSync(resolve(ROOT, SPECS), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/**
 * The spec document for a slug, root-only.
 *
 * `feature-spec.md` for 88 of 91 and `spec.md` for three (`object-bar-defects`,
 * `probe-sweep-diagnosis`, `revision-compare-changes` at M0). Both are globbed because reading only
 * the first name is the blind spot this epic exists to remove, one directory along.
 */
function specDocOf(ROOT, slug) {
  const found = ['feature-spec.md', 'spec.md'].filter((name) =>
    existsSync(resolve(ROOT, SPECS, slug, name)),
  );
  return found;
}

/**
 * Every finding, plus the summary and the population `report()` needs.
 *
 * Exported so the fixture suite can run the whole gate over a synthetic tree — the difference
 * between testing the assertions and testing a copy of them (`stack-record.structural.test.ts`
 * asserted against a private mirror of the logic it was named for and would have stayed green
 * through the regression its own docblock described).
 */
export function collectFindings(ROOT) {
  const problems = [];
  // No `warnings` array — see the docblock.

  // ── Parse ────────────────────────────────────────────────────────────────────────────────────
  const slugs = slugsOnDisk(ROOT);
  /** @type {{slug: string, path: string, md: string, raw: string, value: string|null, line: number, text: string}[]} */
  const specs = [];
  /** @type {string[]} */
  const bothNames = [];
  for (const slug of slugs) {
    const names = specDocOf(ROOT, slug);
    if (names.length === 0) continue;
    if (names.length > 1) bothNames.push(slug);
    const path = `${SPECS}/${slug}/${names[0]}`;
    const raw = read(ROOT, path);
    const lines = stripFences(raw).split('\n');
    // **The line is located with the reader itself, not with a second regex.** `headerField` on a
    // one-line document returns a value iff that line is an acceptable header, and the function is
    // first-match-wins, so this index is exactly the line whose value `headerField(raw)` returns.
    // A local regex here would be a second implementation of one rule, drifting invisibly — the
    // ADR-0065 `routeOrthogonal` argument, and ADR-0121's `stackSeries`.
    const line = lines.findIndex((l) => headerField(l, 'Status') !== null);
    specs.push({
      slug,
      path,
      md: raw,
      raw,
      value: headerField(stripFences(raw), 'Status'),
      line: line + 1,
      text: line === -1 ? '' : lines[line],
    });
  }

  // The cited set: every `docs/specs/<slug>` any file in `docs/adr/` names, intersected with disk.
  const onDisk = new Set(slugs);
  const cited = new Set();
  for (const name of readdirSync(resolve(ROOT, ADRS)).filter((n) => n.endsWith('.md'))) {
    const md = read(ROOT, `${ADRS}/${name}`);
    // **`specs/`, not `docs/specs/` — and the narrower form was this gate's first defect.** ADRs
    // link their spec relatively (`../specs/<slug>/feature-spec.md`, `docs/adr/0044-…:139`), and
    // the absolute-from-root form appears mostly in prose. Anchored on `docs/specs/` the join found
    // **70 of 72** cited slugs and C2 passed happily on the 70: silent under-inclusion, in the gate
    // whose own §4.4 rejects a predicate for exactly that. Over-matching is safe here and
    // under-matching is not, because every slug this yields is intersected with what is on disk —
    // which is the whole reason the join runs directory-first.
    for (const m of md.matchAll(/(?:^|[^a-z0-9-])specs\/([a-z0-9][a-z0-9-]*)/g)) {
      if (onDisk.has(m[1])) cited.add(m[1]);
    }
  }

  const registerPath = resolve(ROOT, REGISTER);
  const register = existsSync(registerPath)
    ? JSON.parse(read(ROOT, REGISTER))
    : { exempt: {}, citedWithoutSpec: {} };
  const exempt = register.exempt ?? {};
  const citedWithoutSpec = register.citedWithoutSpec ?? {};

  // ── C1b — one spec document per slug ─────────────────────────────────────────────────────────
  // M0 measured that no directory holds both, which is what makes "the spec document" well defined
  // for all 91. It is a premise the reader rests on, so it is checked rather than remembered.
  for (const slug of bothNames) {
    problems.push(
      `C1b: ${SPECS}/${slug}/ holds BOTH feature-spec.md and spec.md, so which one carries the ` +
        "status is ambiguous. Keep one — the other's content belongs inside it or under a new name.",
    );
  }

  // ── C1 — the reader's count equals an independently derived one ──────────────────────────────
  // **The control measures a different quantity, and must not share the reader's blind spot.**
  // `check-debt-status.mjs:99-117` records the version of this that counted the same thing the
  // parser did, so both sides of "did we read less than we think?" were blind to the same 31 rows
  // and the assertion agreed with itself. This scan is un-anchored and reads the RAW document,
  // fences included: a fenced-only status produces a **false positive**, which is loud and fixed
  // the day it appears, where sharing `stripFences` would produce a silent false negative.
  const found = specs.filter((s) => s.value !== null).length;
  const naive = specs.filter((s) => s.raw.includes('**Status:**')).length;
  if (found !== naive) {
    problems.push(
      `C1: the reader finds a status header in ${found} spec documents but an un-anchored scan of ` +
        `the raw text sees "**Status:**" in ${naive}. One of them is wrong; a gate that reads less ` +
        'than it thinks reports green over the gap.',
    );
  }

  // ── C2 — the cited set is non-empty ──────────────────────────────────────────────────────────
  // `report()`'s population guard covers the spec list, not the join. S3 is a `.filter()` over the
  // cited set, so a citation regex that matched nothing would make it vacuously true and this gate
  // would report OK over the entire defect it exists for (ADR-0093).
  if (cited.size === 0) {
    problems.push(
      `C2: no ${SPECS}/<slug> citation was found in any ${ADRS}/*.md. The join is broken, not the ` +
        'estate — every refusal keyed on citation below would pass vacuously.',
    );
  }

  // ── C3 — every register entry is live ────────────────────────────────────────────────────────
  // Dead config is how a register stops being read (`check-adr-coverage.mjs:92-96`).
  const withSpec = new Set(specs.map((s) => s.slug));
  for (const slug of Object.keys(exempt)) {
    if (!onDisk.has(slug))
      problems.push(`C3: ${REGISTER} exempts "${slug}", which is not a directory under ${SPECS}/.`);
    else if (!withSpec.has(slug))
      problems.push(
        `C3: ${REGISTER} exempts "${slug}", which holds no spec document — so S3 could never fire ` +
          `on it. Move the entry to "citedWithoutSpec" if that is what it means.`,
      );
    else if (!cited.has(slug))
      problems.push(
        `C3: ${REGISTER} exempts "${slug}", which no ADR cites — so S3 could never fire on it. ` +
          'Delete the entry.',
      );
  }
  for (const slug of Object.keys(citedWithoutSpec)) {
    if (!onDisk.has(slug))
      problems.push(
        `C3: ${REGISTER} lists "${slug}" under citedWithoutSpec, which is not a directory under ${SPECS}/.`,
      );
    else if (withSpec.has(slug))
      problems.push(
        `C3: ${REGISTER} lists "${slug}" under citedWithoutSpec, but it now holds ` +
          `${specDocOf(ROOT, slug)[0]}. Delete the entry — the gate can read that header.`,
      );
    else if (!cited.has(slug))
      problems.push(
        `C3: ${REGISTER} lists "${slug}" under citedWithoutSpec, but no ADR cites it. Delete the entry.`,
      );
  }

  // ── S1 — every spec document has a status line the reader can find ───────────────────────────
  for (const s of specs) {
    if (s.value === null) {
      problems.push(
        `S1: ${s.path} has no **Status:** header. Add "${CANONICAL}Draft" as the third line, ` +
          'or the vocabulary token the work has reached.',
      );
    }
  }

  // ── S2 — the token is in the vocabulary ──────────────────────────────────────────────────────
  // **A vocabulary, not a blocklist of pre-approval wordings.** An unknown word fails loudly here;
  // a blocklist fails silently the first time somebody invents a new phrasing, which is how the
  // estate acquired `Reviewed`, `Delivered`, `Proposed` and `**Awaiting approval**` in the first
  // place — four one-off tokens nobody refused.
  for (const s of specs) {
    if (s.value === null) continue;
    const token = statusToken(s.value);
    if (!VOCABULARY.includes(token)) {
      problems.push(
        `S2: ${s.path}:${s.line} status token "${token}" is not one of ` +
          `${VOCABULARY.join(' / ')}. Rewrite the line as "${CANONICAL}<Token> — <prose>".`,
      );
    }
  }

  // ── S3 — no cited spec is Draft ──────────────────────────────────────────────────────────────
  for (const s of specs) {
    if (s.value === null) continue;
    if (statusToken(s.value) !== 'draft') continue;
    if (!cited.has(s.slug)) continue; // uncited is the blind spot, not a finding — see the docblock
    if (Object.hasOwn(exempt, s.slug)) continue;
    problems.push(
      `S3: ${s.path}:${s.line} is headed Draft, but ${ADRS}/ cites ${SPECS}/${s.slug}. A spec ` +
        'cannot be the source of a filed decision and be awaiting approval. Write ' +
        `"${CANONICAL}Accepted — shipped (ADR-NNNN)" naming the citing ADR, or ` +
        `"${CANONICAL}Approved — …" if the ADR is filed and the work has not shipped.`,
    );
  }

  // ── S4 — an Accepted spec names an ADR, and it resolves ──────────────────────────────────────
  const adrFiles = readdirSync(resolve(ROOT, ADRS)).filter((n) => /^\d{4}-/.test(n));
  for (const s of specs) {
    if (s.value === null || statusToken(s.value) !== 'accepted') continue;
    const refs = [...s.value.matchAll(/ADR-(\d{4})/g)].map((m) => m[1]);
    if (refs.length === 0) {
      problems.push(
        `S4: ${s.path}:${s.line} is headed Accepted but names no ADR. Write ` +
          `"${CANONICAL}Accepted — shipped (ADR-NNNN)" so a reader reaches the decision.`,
      );
      continue;
    }
    for (const n of refs) {
      if (!adrFiles.some((f) => f.startsWith(`${n}-`))) {
        problems.push(`S4: ${s.path}:${s.line} names ADR-${n}, and no ${ADRS}/${n}-*.md exists.`);
      }
    }
  }

  // ── S5 — the canonical form ──────────────────────────────────────────────────────────────────
  for (const s of specs) {
    if (s.value === null) continue;
    if (s.text.startsWith(CANONICAL)) continue;
    problems.push(
      `S5: ${s.path}:${s.line} is "${s.text.slice(0, 40)}…". Rewrite it to start with ` +
        `"${CANONICAL}" — the generous reader accepts the other forms so nothing is skipped, and ` +
        'this refuses them so the estate converges.',
    );
  }

  // ── S6 — a cited slug with no spec document is named, never silently skipped ─────────────────
  for (const slug of [...cited].sort()) {
    if (withSpec.has(slug)) continue;
    if (Object.hasOwn(citedWithoutSpec, slug)) continue;
    problems.push(
      `S6: ${ADRS}/ cites ${SPECS}/${slug}, which holds no feature-spec.md or spec.md, so this ` +
        `gate has no header to read. Add "${slug}" to "citedWithoutSpec" in ${REGISTER} with a ` +
        'reason, or give the directory a spec document.',
    );
  }

  const draft = specs.filter((s) => s.value !== null && statusToken(s.value) === 'draft');
  const summary =
    `${specs.length} spec documents (${found} with a readable status, ${specs.length - found} without), ` +
    `${cited.size} cited by an ADR, ${draft.length} headed Draft ` +
    `(${draft.filter((s) => cited.has(s.slug)).length} of them cited), ` +
    `${Object.keys(exempt).length} exempt, ${Object.keys(citedWithoutSpec).length} cited without a spec document.`;

  return { problems, summary, population: specs.length };
}

/**
 * The whole gate, findings **and** verdict, for one root.
 *
 * `report()` is called here and not in `main`, so the fixture suite exercises the same wiring the
 * CLI does. Two of the assertions are about that wiring rather than about a finding — an empty
 * population and an empty cited set must both FAIL — and testing them against a private copy of
 * the call would pin the copy (`stack-record.structural.test.ts`, ADR-0121's gate pass).
 */
export function runGate(root) {
  const { problems, summary, population } = collectFindings(root);
  const code = report({ name: 'check:spec-status', problems, population, summary });
  return { code, problems, summary };
}

function main(argv) {
  if (argv.includes('--report')) {
    process.stdout.write(`check:spec-status\n${collectFindings(ROOT).summary}\n\n`);
  }
  return runGate(ROOT).code;
}

// **Run only as a script.** The fixture suite imports {@link collectFindings}; a bare `process.exit`
// at module scope would kill that suite the moment it imported this file.
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  process.exit(main(process.argv.slice(2)));
}
