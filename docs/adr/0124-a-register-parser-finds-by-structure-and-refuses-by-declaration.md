# ADR-0124: A register parser finds by structure and refuses by declaration

- **Status:** **Accepted** — 2026-09-02
- **Date:** 2026-09-02
- **Deciders:** this pass (design, measurement); product owner (standing mandate to work the debt
  register down)
- **Extends:** ADR-0058 (drift control), ADR-0076 (wrong claims are a defect class), ADR-0120
  (computed gates and the reconciliation pass)
- **Supersedes:** nothing. Amends ADR-0120's advisory exit convention (D4 below).

## Context

Five rows in `docs/TECH_DEBT.md` — `#222`, `#227`, `#231`, `#235`, `#237` — read as five unrelated
tooling annoyances. They are one failure in five costumes: **an instrument reported something, so
nobody looked.**

- `#231` — the shared parser ended a section at the next heading of the **same** level and never at
  a shallower one, so a `###` row followed by `##` headings ran past every one of them. `#117`
  carried no `**Status:**` line at all, its body ran 1,115 lines, it read `#118`'s on the way, and
  `check:debt-status` reported `71 with a status, 0 without`.
- `#227` — nothing asserted the register's heading form, and the parser's _correct_ generosity in
  reading both levels is exactly what hid the drift.
- `#222` — `check:counts` read a sentence that merely **mentions** a number of ADRs as a stated
  count, and fired on prose inside the very entry documenting the gates built to stop that.
- `#235` — `prepush.sh`'s 0/2/other convention collided with `tsc`, which exits 2 for type errors,
  so a broken typecheck printed a yellow `WARN` and let the push through.
- `#237` — a 43-suite sweep printed one line per suite, aggregated nothing and always exited 0, so
  `web EXIT=1` scrolled past on every run for weeks.

ADR-0120 built gates for drift. These are the gates themselves drifting, which is why they are one
epic and not five commits.

## Decision

### D1 — A parser FINDS by structure and REFUSES by declaration

Finding is generous: a row the parser cannot see is a row it cannot check, **silently**, which is
ADR-0120 Finding 0 and the reason `sections()` reads both heading levels. Refusing is a separate,
strict pass over what was found.

So `sections()` and `rowNumber` keep accepting every form, and A10 asserts the canonical one
afterwards. Narrowing the _reader_ to enforce the form would re-introduce the defect it fixes.

**Structure means position and extent.** A section ends at the next heading of the same level **or
shallower**. That makes a shallower heading significant to a deeper section for the first time, and
this repository's documents contain shell comments beginning `# ` — five in `docs/RECONCILE.md`
alone. `stripFences` already blanks them, so the hazard is covered **by an existing behaviour**,
which is precisely the kind of dependency a well-meaning refactor removes with nothing going red.
`doc-register.test.mjs` therefore pins both halves: a `# ` inside a fence ends nothing, and a `# `
outside one ends a `##` section.

### D2 — Every generous reader owes a control that measures a DIFFERENT quantity

A9 asked _"did we read less than we think?"_ by comparing heading counts against heading counts.
Both sides shared the parser's blind spot, so it could only ever agree with itself — and that is
how it missed the largest instance of exactly what it exists for.

Its second limb counts **column-0 field declarations in the raw document**. A control that measures
the same quantity as the thing it controls is not a control.

### D3 — A claim is prose; a mention is code

`#222`'s own proposed remedy was to narrow the match to "the shape a claim takes rather than the
shape a mention takes". **Measured, and rejected**: four of the six live claim sites are not in a
banner — two are inside `CLAUDE.md`'s fenced repository-layout tree and two are plain prose in
`docs/ARCHITECTURE.md`. A banner-shaped pattern would have silently stopped checking them, which is
this gate's own failure mode introduced by the fix for a different one.

So an **inline code span** marks a mention and fenced blocks stay in scope. The author declares;
the gate does not infer from prose. Measured before arming: 19 matches across the four gated
documents, **0** of them inside a code span, so the escape removes no live claim.

### D4 — Advisory is a declaration, not a number any tool can reach

**Amends ADR-0120's exit convention.** That convention is right about _what_ the two categories
mean — exit 1 is for an obligation whose remedy is an edit to the file that failed, exit 2 for one
whose remedy is somebody's judgement. It was wrong to let any tool reach the advisory category by
picking a number.

The first fix marked three gates "never advisory". That covers the three somebody thought of and
leaves the default on the dangerous side for everything else; a future non-node gate can still pick
2 for its own reasons and be silently downgraded. So the **default is inverted**: a non-zero exit
blocks unless the gate is named in `ADVISORY_GATES`.

This does not close the residual risk, it makes it **harmless** — an unanticipated exit 2 now
blocks, which is the safe direction — and it retires `run_strict` as a special case rather than
leaving it as the safe path nobody remembered to take.

Rejected: **a sentinel in the output instead of an exit code.** It is spoofable by any gate that
echoes a subprocess, `prepush` prints only `tail -12` of a passing gate's log, and it re-creates the
per-branch promise the shared `report()` exists to remove.

`check:advisory-agreement` asserts the list against the code in both directions, **reading
`ADVISORY_GATES` out of `prepush.sh` rather than restating it** — a second copy is the drift it
exists to prevent, the same rule `check:claims` follows in reading SQL out of a migration.

### D5 — A sweep ends with a named verdict and a matching exit status

Failures are **named, not counted**: "1 failure" is a number somebody scrolls past, and the name is
what tells a reader whether to care. It **refuses an empty population**, because every assertion in
it is over a list and an empty list satisfies "nothing failed" perfectly — the ADR-0093 shape, where
a green suite cannot distinguish "the duplicate is gone" from "the capability is gone".

## Consequences

- `docs/TECH_DEBT.md`'s `## Closed numbers` moves to the foot, where the register's own rule at the
  top already claims it is. It sat mid-file with 40 numbered rows after it, and any `| N |` line
  after that heading is classified as a ledger entry — latent, not live (measured: the last match
  was inside the ledger's own table), and now retired.
- Nine register headings were repaired before A10 armed. One repair pass, small, in its own commit.
- **`#101` stays open.** Its item (1) — the own-file basename exclusion in `check:claims` — is
  untouched by this work and remains bounded: it cannot produce a false pass on a claim the register
  already holds, only fail to demand a new one.

## What the measurements changed

**Three of the rows' own decision-bearing claims were false**, and each correction changed the work:

1. `#231` named `check:doc-links` as a consumer of the parser. It imports only node built-ins. The
   unnamed real consumer is `check-reconcile-due.mjs`. So the blast radius was one gate over one
   document, not three.
2. `#231`'s headline instance was **already patched** — `#117` carries a status today — so this is
   a recurrence fix with no red state left in the tree, which is why A9's limb had to be verified
   against a prior revision rather than against `HEAD`.
3. `#222`'s remedy would have broken the gate, as D3 records.

**A fourth finding belonged to no row:** `fieldValue`'s docblock claimed inline code spans are
stripped. They are not, and the comment three lines below records that guard being removed as
_actively wrong_ because it ate two real declarations. A false claim in a shared module's docblock,
found by the epic that changes the module, and corrected as prose only.

**Falsification condition F0.1 came apart into its two halves.** It predicted _at most two_ moved
section boundaries and named one; **three** move, and the two it missed by reading are the large
ones — `docs/RECONCILE.md`'s "Record the pass" (31 → 5 lines) and a `docs/DECISIONS.md` entry
silently swallowing **1,160**. Its second half — zero findings changed — held exactly.

The condition had joined a **proxy** and the **real question** with an "and". The proxy was wrong by
half and decides nothing; the branch it would have triggered did not fire, and the reason is written
down rather than inferred: a moved boundary matters only where a body carried a field belonging to
another row, and neither of those two documents has a field reader.

## Three things this epic got wrong, and how each was caught

Recorded because the corrections are more useful than the fixes.

1. **The parser fix had an off-by-one, and both consumer gates were byte-identical over it.** Every
   body kept the heading that terminated it. A heading line is not a column-0 field declaration, so
   nothing the gates assert could see it, and all fifteen pre-existing fixture cases stayed green.
   Caught by a fixture written **before** the change and run red against the old module.
   Case (e)'s own first draft was then wrong in the other direction — it asserted that no body
   contains _any_ heading, and went red against a **correct** parser, because a deeper heading
   legitimately belongs inside. An assertion that fails against correct code is not stricter, it is
   wrong.
2. **A9's limb was first measured with a copy of the gate, and the copy reported 63 against 70** —
   wrong number, wrong direction. The probe reimplemented `rowNumber`, required a trailing `.`, and
   dropped every em-dash-titled row. Running the real gate against the same file gives 71 against
   70, precisely as predicted. **A measurement taken with a copy of an instrument measures the
   copy.**
3. **`check:advisory-agreement`'s first run was a false positive.** It reported `check:doc-register`
   as capable of exiting 2, because that test file names `advisory` eleven times — while _testing_
   `report()`, capturing its return through a helper rather than exiting on it. Forcing a failure
   there and reading the code gives **1**. Same class as `#222` itself: a scan matching something
   that _discusses_ its subject rather than something that _is_ it, arriving inside the check
   written about that class, and caught only by verifying the red rather than believing it.

**The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity gate
is untouched by construction — in its honest form: there is nothing here to hold parity for.

## References

- `docs/specs/gate-conventions/` — spec, plan and the measurement record.
- ADR-0120 — the drift gates, whose D5 control this ADR gives a second limb and whose exit
  convention D4 amends.
- ADR-0058, ADR-0076, ADR-0093, ADR-0105, ADR-0110.
