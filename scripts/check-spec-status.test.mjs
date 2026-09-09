// @ts-check
/**
 * Fixtures for `check-spec-status.mjs` — **and every case names the mutation that made it red.**
 *
 * This gate has no journey, no browser and no user (spec §4.9): a wrong assertion here reports
 * green over the whole of `docs/specs/`, which is the state #274 records the estate reaching. So
 * ADR-0110 D5 is the standard the suite is held to — *a gate is not finished when it passes; it is
 * finished when it has been made to fail by the defect it was written for* — and each `it()` below
 * carries, in its own comment, the edit to `check-spec-status.mjs` that turns it red.
 *
 * **The whole gate runs against a synthetic tree, not a copy of its rules.** `runGate(root)` is the
 * function the CLI calls, `report()` included, so the two assertions about the verdict itself (an
 * empty population and an empty cited set must FAIL, not pass quietly) exercise the real wiring.
 * `stack-record.structural.test.ts` asserted against a private mirror of the logic it was named
 * for and would have stayed green through the regression its own docblock described.
 *
 * Run standalone: `node scripts/check-spec-status.test.mjs`
 */

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { runGate } from './check-spec-status.mjs';

/**
 * Build a throwaway repository root from a `{ 'path/from/root': contents }` map.
 *
 * **Every spec directory gets a bare-link `implementation-plan.md` unless the fixture writes its
 * own**, because C4 refuses an estate with no plans at all and would otherwise fire in every
 * fixture built for a different assertion — a control leaking into twelve unrelated cases. A bare
 * link is P1-clean by decision (it asserts nothing), so the default cannot mask a P1 finding.
 * `noPlans` opts out, and exactly one case uses it: C4's own.
 */
function tree(files, { noPlans = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'spec-status-'));
  mkdirSync(join(root, 'docs/specs'), { recursive: true });
  mkdirSync(join(root, 'docs/adr'), { recursive: true });
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  if (noPlans) return root;
  const slugs = new Set(
    Object.keys(files)
      .map((p) => /^docs\/specs\/([^/]+)\//.exec(p)?.[1])
      .filter((v) => v !== undefined),
  );
  for (const slug of slugs) {
    const p = join(root, 'docs/specs', slug, 'implementation-plan.md');
    if (!Object.keys(files).some((k) => k.endsWith(`${slug}/implementation-plan.md`)))
      writeFileSync(p, '# Plan\n\n- **Feature spec:** [`./feature-spec.md`](./feature-spec.md)\n');
  }
  return root;
}

/** Run the gate silently and return `{ code, problems, summary }`. */
function gate(root) {
  const original = process.stdout.write.bind(process.stdout);
  // @ts-expect-error — deliberately silencing the gate's own output for the duration of one run.
  process.stdout.write = () => true;
  try {
    return runGate(root);
  } finally {
    process.stdout.write = original;
  }
}

const ids = (result) => result.problems.map((p) => p.split(':')[0]);
const head = (token, prose = '') => `# Spec\n\n- **Status:** ${token}${prose}\n`;
/** The citation form the estate really uses — a relative link, never `docs/specs/…`. */
const adrCiting = (slug) =>
  `# ADR-0001\n\n## References\n\n- Feature spec: [\`../specs/${slug}/feature-spec.md\`](../specs/${slug}/feature-spec.md)\n`;

let run = 0;
const roots = [];
const it = (what, fn) => {
  run += 1;
  try {
    fn();
  } catch (err) {
    process.stdout.write(`  ✗ ${what}\n    ${err.message}\n`);
    process.exitCode = 1;
  }
};
const make = (files, opts) => {
  const root = tree(files, opts);
  roots.push(root);
  return root;
};

// ── S3, both halves ────────────────────────────────────────────────────────────────────────────
it('a cited spec headed Draft FAILS (S3)', () => {
  // Red against deleting the S3 block. This is #274's entire subject in four lines.
  const root = make({
    'docs/specs/thing/feature-spec.md': head('Draft', ' — awaiting approval'),
    'docs/adr/0001-thing.md': adrCiting('thing'),
  });
  const r = gate(root);
  assert.equal(r.code, 1);
  assert.deepEqual(ids(r), ['S3']);
  assert.match(r.problems[0], /docs\/specs\/thing\/feature-spec\.md:3/);
});

it('the SAME spec passes once no ADR cites it (S3 is not a blanket rule)', () => {
  // Red against making S3 unconditional. Without this half the case above passes equally against a
  // gate that fails every Draft spec — and 18 uncited Draft specs are a measured, deliberate blind
  // spot, not a backlog. A gate that failed them would be deleted by the end of the week.
  const root = make({
    'docs/specs/thing/feature-spec.md': head('Draft', ' — awaiting approval'),
    'docs/specs/other/feature-spec.md': head('Accepted', ' — shipped (ADR-0001)'),
    'docs/adr/0001-other.md': adrCiting('other'),
  });
  const r = gate(root);
  assert.equal(r.code, 0, r.problems.join('\n'));
});

// ── The citation regex ─────────────────────────────────────────────────────────────────────────
it('a relative `../specs/<slug>` citation counts (the live under-match)', () => {
  // Red against anchoring the join on `docs/specs/`. **This was a real defect in this gate**: the
  // first version matched only the absolute-from-root form, found 70 of the estate's 72 cited
  // slugs, and C2 passed cheerfully on the 70 — silent under-inclusion, in the gate whose own §4.4
  // rejects a predicate for exactly that. ADRs link their spec relatively (`docs/adr/0044-…:139`).
  const root = make({
    'docs/specs/thing/feature-spec.md': head('Draft'),
    'docs/adr/0001-thing.md': adrCiting('thing'),
  });
  assert.deepEqual(ids(gate(root)), ['S3']);
});

it('a slug no ADR names is NOT in the cited set (the negative control)', () => {
  // Red against a citation regex that matches any slug — say `/specs\/([a-z0-9-]+)/` applied to
  // the spec paths themselves rather than to ADR text. Without this, "everything is cited" passes
  // both directions and S3 quietly becomes the universal rule the case above rejects.
  const root = make({
    'docs/specs/unnamed/feature-spec.md': head('Draft'),
    'docs/specs/named/feature-spec.md': head('Approved'),
    'docs/adr/0001-named.md': adrCiting('named'),
  });
  const r = gate(root);
  assert.equal(r.code, 0, r.problems.join('\n'));
  assert.match(r.summary, /1 cited by an ADR/);
});

// ── The reader ─────────────────────────────────────────────────────────────────────────────────
it('a `spec.md` fixture is FOUND (the measured blind spot, one directory along)', () => {
  // Red against globbing `feature-spec.md` only. Three of the 91 spec documents are `spec.md`, and
  // a reader that saw 88 of 91 would report green over the other three — the shape this whole epic
  // exists to remove.
  const root = make({
    'docs/specs/thing/spec.md': head('Draft'),
    'docs/adr/0001-thing.md': `# ADR\n\n[\`../specs/thing/spec.md\`](../specs/thing/spec.md)\n`,
  });
  assert.deepEqual(ids(gate(root)), ['S3']);
});

it('a `> **Status:**` header is FOUND, then refused by S5', () => {
  // Red against a reader accepting only `- `: the finding would become S1 ("no header"), which
  // sends the reader to add a second status line to a file that already has one.
  // `operational-self-service/feature-spec.md:17` and `object-bar-defects/spec.md:3` use this form.
  const root = make({
    'docs/specs/thing/feature-spec.md': '# Spec\n\n> **Status:** Approved — go\n',
    'docs/adr/0001-thing.md': adrCiting('thing'),
  });
  const r = gate(root);
  assert.deepEqual(ids(r), ['S5']);
  assert.match(r.problems[0], /docs\/specs\/thing\/feature-spec\.md:3/);
});

it('a file with no header at all fails S1', () => {
  // Red against defaulting a missing header to `Draft`, which reads as a finding about approval
  // when the fact is that nothing can be read at all.
  const root = make({
    'docs/specs/thing/feature-spec.md': '# Spec\n\nNo header here.\n',
    'docs/specs/other/feature-spec.md': head('Approved'),
    'docs/adr/0001-other.md': adrCiting('other'),
  });
  assert.ok(ids(gate(root)).includes('S1'));
});

// ── S2, the vocabulary ─────────────────────────────────────────────────────────────────────────
it('`Delivered` is refused by S2', () => {
  // Red against replacing the vocabulary with a blocklist of pre-approval wordings. A blocklist
  // passes `Delivered` — and passes the next invented token too, silently. The estate acquired
  // four one-off tokens (`Reviewed`, `Delivered`, `Proposed`, `**Awaiting`) because nothing
  // refused a new word.
  const root = make({
    'docs/specs/thing/feature-spec.md': head('Delivered', ' — it shipped'),
    'docs/adr/0001-thing.md': adrCiting('thing'),
  });
  assert.deepEqual(ids(gate(root)), ['S2']);
});

it('a BOLD `**Draft — …**` value still normalises to the Draft token', () => {
  // Red against comparing the raw value instead of normalising a leading token. #274's own count
  // was 67 rather than 72 because `grep "Status:** Draft"` misses this form, which three specs
  // use — the fourth string-matching miscount of this population.
  const root = make({
    'docs/specs/thing/feature-spec.md': head('**Draft — awaiting approval.**'),
    'docs/adr/0001-thing.md': adrCiting('thing'),
  });
  assert.deepEqual(ids(gate(root)), ['S3']);
});

// ── S4, the ADR reference ──────────────────────────────────────────────────────────────────────
it('`Accepted` with no ADR reference fails S4', () => {
  // Red against dropping the ADR requirement. US-3: the point of `Accepted` is that a reader jumps
  // from spec to decision; without the number it says only "this is done", which is what the
  // estate's `Delivered` said.
  const root = make({
    'docs/specs/thing/feature-spec.md': head('Accepted', ' — shipped'),
    'docs/adr/0001-thing.md': adrCiting('thing'),
  });
  assert.deepEqual(ids(gate(root)), ['S4']);
});

it('`Accepted (ADR-9999)` fails S4 when no such ADR file exists', () => {
  // Red against checking the pattern but not the file. A number that resolves to nothing is worse
  // than no number: it reads as a citation and cannot be followed.
  const root = make({
    'docs/specs/thing/feature-spec.md': head('Accepted', ' — shipped (ADR-9999)'),
    'docs/adr/0001-thing.md': adrCiting('thing'),
  });
  const r = gate(root);
  assert.deepEqual(ids(r), ['S4']);
  assert.match(r.problems[0], /ADR-9999/);
});

it('`Accepted (ADR-0001)` passes when the file is there', () => {
  // The positive half. Without it the two cases above pass equally against a gate that fails every
  // `Accepted` spec, which would make the token unusable and push the estate back to `Approved`.
  const root = make({
    'docs/specs/thing/feature-spec.md': head('Accepted', ' — shipped (ADR-0001)'),
    'docs/adr/0001-thing.md': adrCiting('thing'),
  });
  assert.equal(gate(root).code, 0);
});

// ── The controls ───────────────────────────────────────────────────────────────────────────────
it('C0 — an empty spec estate FAILS rather than reporting green', () => {
  // Red against passing `population: null` to `report()`. ADR-0108's census passed its "nothing is
  // unclassified" assertion because its glob matched zero files; every refusal above is a
  // `.filter()` and is vacuously true of an empty set.
  //
  // **The tree is built so that C0 is the ONLY thing that can fire**, which took two attempts: an
  // empty directory also empties the cited set, so C2 fired, the run was red for the wrong reason
  // and the case would have passed against its own mutation. The cited slug is registered under
  // `citedWithoutSpec` so S6 is closed and the population is genuinely, legitimately zero.
  //
  // **C4 is silent here only INCIDENTALLY, and that is stated rather than left to be rediscovered.**
  // `tree()` writes its default bare-link plan for every `docs/specs/<slug>/` path in the fixture
  // map, including `paperless`, which has no spec document — so the plan glob is non-empty by
  // accident of the helper rather than by design of this case. Narrowing that default to
  // "only slugs with a spec document" would make this case fail C4 as well, and per the two
  // attempts above that would cost another round of diagnosis to understand.
  const root = make({
    'docs/specs/paperless/design.md': '# Design\n',
    'docs/adr/0001.md': `[\`../specs/paperless/design.md\`](../specs/paperless/design.md)\n`,
    'scripts/spec-status.json': JSON.stringify({ citedWithoutSpec: { paperless: 'no spec doc' } }),
  });
  const r = gate(root);
  assert.equal(r.problems.length, 0, `nothing but C0 may fire here: ${r.problems.join('\n')}`);
  assert.equal(r.code, 1, 'an empty population must FAIL, not report green');
});

it('C2 — an estate no ADR cites at all FAILS', () => {
  // Red against deleting C2. S3 filters the cited set, so a citation regex that matched nothing
  // would make it vacuously true and this gate would report OK over the entire defect (ADR-0093).
  // `report()`'s population guard covers the spec list, NOT the join, which is why C2 exists.
  const root = make({
    'docs/specs/thing/feature-spec.md': head('Approved'),
    'docs/adr/0001-thing.md': '# ADR with no spec link\n',
  });
  const r = gate(root);
  assert.equal(r.code, 1);
  assert.deepEqual(ids(r), ['C2']);
});

it('C1 — a status line only inside a fence fails the count control', () => {
  // Red against deriving the naive count with `headerField` — the ADR-0124 A9 defect, where both
  // sides of "did we read less than we think?" shared one blind spot and the assertion agreed with
  // itself. The control scans the RAW text, fences included, deliberately: a fenced-only status is
  // a LOUD false positive, where sharing `stripFences` would make it a silent false negative.
  const root = make({
    'docs/specs/thing/feature-spec.md': '# Spec\n\n```md\n- **Status:** Draft\n```\n',
    'docs/specs/other/feature-spec.md': head('Approved'),
    'docs/adr/0001-other.md': adrCiting('other'),
  });
  const r = gate(root);
  assert.ok(ids(r).includes('C1'), r.problems.join('\n'));
});

it('C1b — a directory holding BOTH spec names is refused as ambiguous', () => {
  // Red against silently preferring `feature-spec.md`. M0 measured that no directory holds both,
  // which is what makes "the spec document" well defined for all 91 — a premise the reader rests
  // on, so it is checked rather than remembered.
  const root = make({
    'docs/specs/thing/feature-spec.md': head('Approved'),
    'docs/specs/thing/spec.md': head('Draft'),
    'docs/adr/0001-thing.md': adrCiting('thing'),
  });
  assert.deepEqual(ids(gate(root)), ['C1b']);
});

it('C3 — an exemption for a slug nothing cites is refused as dead config', () => {
  // Red against deleting C3. Dead config is how a register stops being read
  // (`check-adr-coverage.mjs:92-96`), and an exemption is the one place in this design where a
  // human overrides the rule — so it has to stay legible.
  const root = make({
    'docs/specs/thing/feature-spec.md': head('Approved'),
    'docs/specs/loose/feature-spec.md': head('Draft'),
    'docs/adr/0001-thing.md': adrCiting('thing'),
    'scripts/spec-status.json': JSON.stringify({ exempt: { loose: 'because' } }),
  });
  const r = gate(root);
  assert.deepEqual(ids(r), ['C3']);
  assert.match(r.problems[0], /no ADR cites/);
});

it('C3 — an exemption naming a slug that is not a directory at all is refused', () => {
  // Red against collapsing this branch into its `!withSpec` neighbour — verified by the M3 test
  // review, which deleted it and watched all 26 fixture cases stay green. Four of C3's six
  // register-validity branches had no case, in the gate whose own docblock says dead config is how
  // a register stops being read: the dead-config detectors were themselves unverified.
  const root = make({
    'docs/specs/thing/feature-spec.md': head('Approved'),
    'docs/adr/0001-thing.md': adrCiting('thing'),
    'scripts/spec-status.json': JSON.stringify({ exempt: { ghost: 'nothing by this name' } }),
  });
  const r = gate(root);
  assert.deepEqual(ids(r), ['C3']);
  assert.match(r.problems[0], /not a directory/);
});

it('C3 — an exemption for a directory holding no spec document says which register it belongs in', () => {
  // Red against dropping this branch: S3 could never fire on a slug with no header to read, so the
  // entry is dead — and the message has to name `citedWithoutSpec`, or the reader deletes an entry
  // that was merely filed in the wrong half.
  const root = make({
    'docs/specs/thing/feature-spec.md': head('Approved'),
    'docs/specs/paperless/design.md': '# Design\n',
    'docs/adr/0001.md': `${adrCiting('thing')}\n[\`../specs/paperless/design.md\`](../specs/paperless/design.md)\n`,
    'scripts/spec-status.json': JSON.stringify({ exempt: { paperless: 'wrong register' } }),
  });
  const r = gate(root);
  assert.ok(ids(r).includes('C3'), r.problems.join('\n'));
  assert.match(r.problems.join('\n'), /citedWithoutSpec/);
});

it('C3 — a citedWithoutSpec entry naming no directory is refused', () => {
  // Red against dropping the mirror of the first case above. The two registers rot independently.
  const root = make({
    'docs/specs/thing/feature-spec.md': head('Approved'),
    'docs/adr/0001-thing.md': adrCiting('thing'),
    'scripts/spec-status.json': JSON.stringify({ citedWithoutSpec: { ghost: 'gone' } }),
  });
  const r = gate(root);
  assert.deepEqual(ids(r), ['C3']);
  assert.match(r.problems[0], /not a directory/);
});

it('C3 — a citedWithoutSpec entry no ADR cites is refused', () => {
  // Red against dropping it. This is the entry that outlives the citation rather than the spec
  // document: the ADR stops naming the directory, S6 could never fire, and the register keeps a
  // sentence explaining an exemption nothing needs.
  const root = make({
    'docs/specs/thing/feature-spec.md': head('Approved'),
    'docs/specs/orphan/design.md': '# Design\n',
    'docs/adr/0001-thing.md': adrCiting('thing'),
    'scripts/spec-status.json': JSON.stringify({ citedWithoutSpec: { orphan: 'nobody cites it' } }),
  });
  const r = gate(root);
  assert.deepEqual(ids(r), ['C3']);
  assert.match(r.problems[0], /no ADR cites it/);
});

it('C3 — an exemption that IS live passes, and suppresses S3', () => {
  // The positive half, without which the case above passes against a gate that refuses every
  // exemption — which would make the register unusable and the override a lie.
  const root = make({
    'docs/specs/thing/feature-spec.md': head('Draft', ' — genuinely not approved'),
    'docs/adr/0001-thing.md': adrCiting('thing'),
    'scripts/spec-status.json': JSON.stringify({ exempt: { thing: 'ADR cites it as prior art' } }),
  });
  assert.equal(gate(root).code, 0);
});

// ── S6 ─────────────────────────────────────────────────────────────────────────────────────────
it('S6 — a cited directory with no spec document is named, not skipped', () => {
  // Red against `continue`-ing over it. M0-T1 found four — `canvas-decomposition`,
  // `canvas-maximisation`, `design-system-rewrite`, `graphite`, all shipped epics — and its
  // conclusion is the reason this assertion exists: *"it cannot be a silent skip: a silent skip is
  // how the estate reached this state."*
  const root = make({
    'docs/specs/paperless/design.md': '# Design\n',
    'docs/specs/other/feature-spec.md': head('Approved'),
    'docs/adr/0001.md': `${adrCiting('other')}\n[\`../specs/paperless/design.md\`](../specs/paperless/design.md)\n`,
  });
  const r = gate(root);
  assert.deepEqual(ids(r), ['S6']);
  assert.match(r.problems[0], /paperless/);
});

it('S6 — registering it in citedWithoutSpec closes the finding', () => {
  // Red against reading the wrong half of the register (checking `exempt` where the rule means
  // `citedWithoutSpec`, or the reverse) — the two are different questions about different slugs.
  // This case shipped without its mutation named, alone among the 27, which is the file's own
  // convention broken in the file that states it. Its sibling above covers "was S6 deleted"; this
  // one covers "does the register close it", and neither alone covers both.
  const root = make({
    'docs/specs/paperless/design.md': '# Design\n',
    'docs/specs/other/feature-spec.md': head('Approved'),
    'docs/adr/0001.md': `${adrCiting('other')}\n[\`../specs/paperless/design.md\`](../specs/paperless/design.md)\n`,
    'scripts/spec-status.json': JSON.stringify({ citedWithoutSpec: { paperless: 'no spec doc' } }),
  });
  assert.equal(gate(root).code, 0);
});

it('S6 — the entry dies once the directory gains a spec document (C3)', () => {
  // Red against checking only that the slug exists. An entry that outlives its reason is exactly
  // the dead config C3 exists for, and this is the direction that rots quietly: the epic writes a
  // spec later and nobody revisits the register.
  const root = make({
    'docs/specs/paperless/feature-spec.md': head('Approved'),
    'docs/adr/0001.md': adrCiting('paperless'),
    'scripts/spec-status.json': JSON.stringify({ citedWithoutSpec: { paperless: 'no spec doc' } }),
  });
  assert.deepEqual(ids(gate(root)), ['C3']);
});

// ── P1, the plan side ──────────────────────────────────────────────────────────────────────────
const plan = (annotation = '') =>
  `# Plan\n\n- **Feature spec:** [\`./feature-spec.md\`](./feature-spec.md)${annotation}\n`;

it('P1 — a plan saying "not yet approved" beside an Accepted spec fails', () => {
  // Red against deleting P1. This is #274's subject one file along, and it is the commoner half:
  // 46 of the 90 plans annotate that line, and the annotation was written when the plan was.
  const root = make({
    'docs/specs/thing/feature-spec.md': head('Accepted', ' — shipped (ADR-0001)'),
    'docs/specs/thing/implementation-plan.md': plan(' — **not yet approved**'),
    'docs/adr/0001-thing.md': adrCiting('thing'),
  });
  const r = gate(root);
  assert.deepEqual(ids(r), ['P1']);
  assert.match(r.problems[0], /implementation-plan\.md:3/);
});

it('P1 — a BARE link is clean, because it asserts nothing', () => {
  // Red against making P1 a presence rule (requiring every plan to annotate). 44 of 90 plans do
  // not, and requiring it invents a second field for authors to maintain — which is #274's own
  // diagnosis, that this drifted by being nobody's step, reproduced one document along.
  const root = make({
    'docs/specs/thing/feature-spec.md': head('Accepted', ' — shipped (ADR-0001)'),
    'docs/specs/thing/implementation-plan.md': plan(),
    'docs/adr/0001-thing.md': adrCiting('thing'),
  });
  assert.equal(gate(root).code, 0, gate(root).problems.join('\n'));
});

it('P1 — "not yet approved" beside a Draft spec is clean, because the two AGREE', () => {
  // Red against firing on any pre-approval wording regardless of the spec. Without this half, P1
  // becomes a rule about the plan's words rather than about the two documents disagreeing, and
  // every honestly-unapproved epic fails.
  const root = make({
    'docs/specs/thing/feature-spec.md': head('Draft', ' — awaiting approval'),
    'docs/specs/thing/implementation-plan.md': plan(' — **not yet approved**'),
    'docs/specs/cited/feature-spec.md': head('Accepted', ' — shipped (ADR-0001)'),
    'docs/adr/0001-cited.md': adrCiting('cited'),
  });
  assert.equal(gate(root).code, 0, gate(root).problems.join('\n'));
});

it('P1 — a plan claiming a DIFFERENT vocabulary token also fails', () => {
  // Red against testing only for pre-approval wording. A plan saying "Approved" beside a spec
  // saying "Accepted" is the same defect pointing the other way, and it is the shape that appears
  // as an epic ships: somebody updates one file.
  const root = make({
    'docs/specs/thing/feature-spec.md': head('Accepted', ' — shipped (ADR-0001)'),
    'docs/specs/thing/implementation-plan.md': plan(' — Approved 2026-01-01'),
    'docs/adr/0001-thing.md': adrCiting('thing'),
  });
  const r = gate(root);
  assert.deepEqual(ids(r), ['P1']);
  assert.match(r.problems[0], /annotates the spec "approved"/);
});

it('P1 — a plan naming the SAME token as its spec is clean', () => {
  // Red against `if (claimed && claimed !== token)` becoming `if (claimed)`, which fires P1 on
  // every explicit annotation whether or not it agrees. **The M3 test review found this by running
  // that mutation and watching all 26 cases stay green.** The asymmetry was the tell: the
  // pre-approval arm's agreement case was pinned and this one was not, so of P1's four shapes —
  // no annotation, wording+agree, wording+disagree, token+disagree — the fifth, token+AGREE, was
  // the only combination missing, and it is exactly the one a dropped comparison destroys. Without
  // it the recommended form in `docs/templates/implementation-plan.md` would itself be a finding.
  const root = make({
    'docs/specs/thing/feature-spec.md': head('Accepted', ' — shipped (ADR-0001)'),
    'docs/specs/thing/implementation-plan.md': plan(' — Accepted (ADR-0001)'),
    'docs/adr/0001-thing.md': adrCiting('thing'),
  });
  assert.equal(gate(root).code, 0, gate(root).problems.join('\n'));
});

it('C4 — an estate with no plans at all FAILS', () => {
  // Red against deleting C4. P1 is a `.filter()` like every refusal above it, so an empty plan
  // list satisfies it silently — the same argument as C2, one document type along.
  const root = make(
    {
      'docs/specs/thing/feature-spec.md': head('Accepted', ' — shipped (ADR-0001)'),
      'docs/adr/0001-thing.md': adrCiting('thing'),
    },
    { noPlans: true },
  );
  assert.deepEqual(ids(gate(root)), ['C4']);
});

// ── The real estate ────────────────────────────────────────────────────────────────────────────
it('the gate reads the real estate, and only a SHRINKAGE is a finding', () => {
  // Not a fixture: the two instruments that have counted this population — M0's hand-run commands
  // and this gate — must agree, and #274's cautionary tale is a hand-count that was wrong and was
  // believed. M0 measured 91 spec documents and 72 cited, and finding the citation under-match
  // (70 of 72, silently) is how that comparison already paid for itself.
  //
  // **The bounds are one-sided, and the first version's were not.** It asserted `/^9\d spec
  // documents/` and `/7\d cited by an ADR/` — decade-wide windows that fail on ordinary correct
  // growth the moment the estate reaches 100 specs or 80 citations, for a reason unrelated to any
  // defect this gate exists to catch. That is ADR-0076 Class 1 written into a test: a number nobody
  // will re-derive, in a suite whose subject is documents carrying stale numbers. **It is not
  // hypothetical — the cited count moved 72 → 73 inside this epic**, the moment ADR-0131 cited its
  // own spec directory, which is exactly the ordinary growth an upper bound punishes.
  //
  // So the assertion is a floor. It fails if the reader ever stops seeing most of the estate — the
  // failure this case exists for — and says nothing about growth, which is not its business.
  const repoRoot = resolve(import.meta.dirname, '..');
  const r = gate(repoRoot);
  const specs = Number(/^(\d+) spec documents/.exec(r.summary)?.[1]);
  const cited = Number(/(\d+) cited by an ADR/.exec(r.summary)?.[1]);
  assert.ok(Number.isFinite(specs) && Number.isFinite(cited), `unparseable summary: ${r.summary}`);
  assert.ok(specs >= 91, `the estate reads ${specs} spec documents; M0 measured 91`);
  assert.ok(cited >= 72, `the join reads ${cited} cited slugs; M0 measured 72`);
});

for (const root of roots) rmSync(root, { recursive: true, force: true });

process.stdout.write(
  process.exitCode === 1
    ? `check-spec-status: FAILED (${run} cases)\n`
    : `check-spec-status: ${run} cases OK\n`,
);
