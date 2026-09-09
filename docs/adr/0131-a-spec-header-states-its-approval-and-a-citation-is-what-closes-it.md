# ADR-0131: A spec header states its approval, and a citation is what closes it

- **Status:** **Accepted** — 2026-09-09
- **Date:** 2026-09-09
- **Deciders:** product owner (the vocabulary, the shipped wording, and "gate first, properly" over
  sweeping now); this pass (the predicate, the reader, the controls)
- **Extends:** ADR-0058 (drift control — replace the vigilance with something computed), ADR-0105
  (a register row is not a spec), ADR-0110 D5 (a gate is finished when the defect it names has made
  it fail), ADR-0120 (computed gates), ADR-0124 (generous reader, strict refusal)
- **Supersedes:** nothing.
- **Spec:** [`docs/specs/spec-status-gate/`](../specs/spec-status-gate/)

## Context

**Fifty-four spec documents behind shipped, ADR-filed work were headed
`- **Status:** Draft — awaiting approval before implementation.`** The header is the first thing a
reader sees, and every one of them asserted that the live surface underneath had never been approved
to build. `docs/specs/audit-log/feature-spec.md` said it about `audit_events`, which has been
append-only in the database since 2026-08-03. `docs/specs/gantt-editing/feature-spec.md` said it
about a view released in `web-v0.92.0`.

**Nobody was negligent, and that is the whole diagnosis.** `docs/PROCESS.md` names the header as the
artefact's front matter and names no step that revisits it. Stage 5 ends at approval; nothing sends
anybody back when the work ships. So it drifted **by being nobody's step** — the ADR-0058 shape
exactly, which is why the answer is a gate and not a sweep. A sweep fixes today's fifty-four and
guarantees tomorrow's.

ADR-0105 is what makes this load-bearing rather than cosmetic. That decision turns on whether a
change is covered by a register row or needs the full spec, and a reader deciding it opens the spec
and reads the header. A header saying `Draft` where the work shipped tells them stages 1–4 were
never completed for the surface they are about to change, which is false, and it is the one document
they would have trusted.

`docs/TECH_DEBT.md` #274 filed it, argued for a gate rather than a sweep, and noted that building
one fires ADR-0105's own trigger — a shared gate — so it wanted its own spec rather than being
picked up as a tidy-up. It got one.

## Decision

### D1 — The predicate is citation, not the ADR's own status

**A spec directory named by any file in `docs/adr/` may not be headed `Draft`.**

The obvious refinement — _cited by an **Accepted** ADR_ — was **measured and rejected**. Eleven ADRs
are `Proposed` in whole or in part, and four of them (0029 the persistent app-shell, 0030 the
canvas-first workspace, 0031 the toolbar registry, 0032 canvas-first authoring) are live production
surfaces and have been for months. So `Proposed` does not mean "not shipped" in this repository, and
a predicate keyed on it would silently leave the loudest cases untouched. Silent under-inclusion is
the failure direction `doc-register.mjs:105-109` singles out as the one worth designing against.

**And the objection to the simple predicate defuses itself**, which is the more useful half.
Following all eleven `Proposed` ADRs to their citations: 0029/0030/0031/0032 cite
`docs/specs/<name>.md` files that live in `docs/plans/` and therefore name no directory at all;
0082 and 0083 — the two whose work genuinely has not been built — cite no spec directory; the
remaining five cite epics that shipped. The population of _cited by a Proposed ADR whose work has
not started_ is, on inspection, **empty**.

The claim the rule rests on is narrow and true: **an ADR citing a spec is the record that that
spec's design was taken up as a decision**, and a document cannot simultaneously be the source of a
filed decision and be awaiting approval before implementation. It does **not** claim the work
shipped — `docs/adr/0083-shaded-form-fields.md:3-5` records an ADR filed and registered in one
commit with nothing built — which is exactly why `Approved` is admitted for a cited spec and only
`Draft` is refused. That bound closes #274 and claims nothing further.

Four other predicates were considered and each measured worse: the roadmap names ADRs rather than
slugs (12 occurrences against 91 specs); git history needs a subprocess and full history, and
`check:frontend-only` records what diff-based gates cost in CI; _every spec must be cited_ is false,
since epics legitimately ship without an ADR — that boundary is ADR-0105's subject — and would force
a fabricated one; and a new `**Shipped:**` field nobody is forced to write is #274's own defect, one
field along.

### D2 — The join runs directory-first, and the regex must be generous

Iterate the slugs that exist on disk and ask whether any ADR names each — never the reverse. Two
properties follow for free: a dangling citation costs nothing, and the regex **cannot invent a
population**, because everything it yields is intersected with a directory listing.

**That is what made the first version's defect survivable, and it is recorded here because it is
this ADR's own subject landing on it.** The join was anchored on `docs/specs/<slug>` and found
**70 of the 72** cited slugs. ADRs link their spec **relatively** —
`docs/adr/0044-resource-curves-accrual-steps.md:139` writes
`../specs/resource-curves-accrual-steps/feature-spec.md` — and the absolute-from-root form appears
mostly in prose. The control that should have caught it (C2, below) only asks that the cited set be
non-empty, and it passed cheerfully on the 70. Silent under-inclusion, in the gate whose §4.4
rejects a predicate for exactly that. It was caught only because M0 had produced an **independent**
number to compare against, which is the argument for taking the measurement first.

Widened to `specs/<slug>`, the gate's counts land on M0's exactly — 91 spec documents, 72 cited, 72
`Draft`, 54 of those cited, 4 cited with no spec document to read. Two instruments sharing no code,
agreeing on every figure.

### D3 — Finding is generous; refusing is strict

`headerField(md, field)` is a **new, separately-named export** in `scripts/lib/doc-register.mjs`. It
accepts `**Field:**` bare, `- `/`* ` as a top-level list item, and `> ` as a top-level block quote,
at column 0, first match wins, with the value returned verbatim.

`fieldValue` was **not** widened. Its anchor is the bare column-0 form and its docblock is emphatic
that the anchor is its only guard, a broader version having already been removed as actively wrong.
Measured, that form is **2 of 91** spec headers: using it here would have read two files and
reported green over eighty-nine — ADR-0124's Finding 0, in the commit citing ADR-0124. Widening it
would also have changed `check:debt-status`'s behaviour over a document whose own convention is the
bare form. The two functions answer **different questions over different document families**, which
is why they are two readers with two anchors rather than the ADR-0065 drift case; each docblock says
so and names the other.

Both properties of the reader are requirements rather than conveniences, on evidence: 84 of the 91
status lines sit at line 3 and the rest at 8, 8, 9, 17, 18, 21 and 30, so a **line anchor would miss
seven**; and `one-row-header/feature-spec.md` carries two status lines — the spec's at :3 and an ADR
draft embedded at :796 — so a **last-wins reader would report the embedded draft's status as the
spec's**.

Refusing the non-canonical forms is then a **separate strict pass** (S5), because a header in the
wrong shape is still a header and a parser that skips it reports green over the gap (ADR-0120
Finding 0).

### D4 — A vocabulary of five, not a blocklist of pre-approval wordings

`Draft | Approved | Accepted | Superseded | Withdrawn`, normalised from the leading token. An
unknown word fails **loudly**; a blocklist fails **silently** the first time somebody invents a
phrasing — which is how the estate acquired `Reviewed`, `Delivered`, `Proposed` and
`**Awaiting approval**`, four one-off tokens nobody refused.

The normaliser strips emphasis, and it has to: three specs are headed
`- **Status:** **Draft — awaiting approval.**`, and **#274's own count of 67 missed all three**
because it matched a string. That was the **fourth** string-matching miscount of this population
(28 → 50 → 54 for the cited-Draft figure alone, each correction upward). Normalising a token rather
than matching a string is the direct consequence.

`Accepted` must name at least one `ADR-NNNN` that resolves to a file: the point of the token is that
a reader jumps from spec to decision, and a number that resolves to nothing is worse than no number,
because it reads as a citation and cannot be followed.

### D5 — Exit 1, blocking, and no `warnings` array anywhere in the gate

The convention is written in two places that agree: **exit 1 when the remedy is an edit to the file
that failed, exit 2 when the remedy is somebody's judgement** (`doc-register.mjs`, `prepush.sh`,
ADR-0120 D2, as amended by ADR-0124). Every finding here is closed by editing one line of one named
Markdown file, and the message says which line and what to write.

The implementation consequence is not stylistic. `report()`'s warnings path returns **2
unconditionally, regardless of `advisory`**, and under `prepush.sh`'s inverted default a 2 from an
undeclared gate **blocks with nothing on screen explaining why**. So the gate declares no `warnings`
array at all, following `check-debt-status.mjs:49-53`, with the reason in a comment.
`check:advisory-agreement` then classifies it correctly **by construction** — it looks for
`report({ advisory })` or `warnings.push`, and there is neither — which was confirmed by running it
after arming, not by reading its source.

### D6 — S6: a cited directory with nothing to read is named, never skipped

**This is a departure from the approved spec's §4.6 assertion table, and it is M0's.** §4.10 treated
the cited directories that hold no `feature-spec.md` or `spec.md` as a documented blind spot. M0-T1
then measured **four** of them — `canvas-decomposition` (ADR-0078), `canvas-maximisation`
(ADR-0113), `design-system-rewrite` (ADR-0097), `graphite` (ADR-0099/0102) — all shipped epics,
none an edge case. Its conclusion is quoted in the gate's own docblock: _"it cannot be a silent
skip: a silent skip is how the estate reached this state."_

A rule stated in a docblock and enforced by nothing is not a rule. So each is named in
`scripts/spec-status.json` with a sentence, and C3 kills the entry the moment the directory gains a
spec document — because at that point the gate can read a header and the register would be hiding
it.

### D7 — The plan side is a contradiction rule, not a presence rule

#274 asked for the plan files too. **Measured, 46 of the 90 plans annotate their
`**Feature spec:**` line and 44 leave it a bare link.** A bare link asserts nothing, so it cannot
contradict; requiring an annotation would invent a second field for authors to maintain, which is
#274's own diagnosis reproduced one document along. So P1 fires only when the plan **names a state
the spec does not hold** — in either direction: "not yet approved" beside `Accepted`, or `Approved`
beside `Accepted`.

The plan's own `**Status:**` field is deliberately **out of scope** (CQ-2): it is a different
vocabulary about a different subject, and folding it in means deciding what `In progress` means for
an epic that finished eight months ago. That is a second sweep and a second argument, and it is not
what #274 is about.

### D8 — Report-only first, sweep, then arm

ADR-0058's rule is that a gate failing on day one gets deleted rather than fixed, and ADR-0120's
`check:debt-status` is the worked example. The same sequence: the gate was written **deliberately
absent from `package.json`**, so `prepush.sh`'s derived roster could not pick it up; the red run
against the un-swept estate is committed at
[`docs/specs/spec-status-gate/red-run.md`](../specs/spec-status-gate/red-run.md); the sweep took 66
findings to 0; the key was added after.

**And the arming was watched, not assumed.** A deliberately re-drafted `notes/feature-spec.md`
produces `FAIL check:spec-status` under `prepush.sh`, not `WARN` — which is the difference between
registered and enforced, and the two are distinguishable only by watching.

## Consequences

**What this changes.** Closing a feature now includes writing its header, in the same change that
files the ADR — stated in `docs/PROCESS.md`, which previously sent nobody back to one. The spec and
plan templates carry the vocabulary, having taught `In review`, `In progress` and `Done`, none of
which the gate accepts.

**What it cannot see, stated here rather than discovered later.**

1. **A spec no ADR cites**, which is **17 documents** headed `Draft` after the sweep — a quarter of
   the original 72, and all 17 verified uncited rather than assumed to be. Two are known to have
   shipped and are named so the claim is checkable: `wbs-bucket-a11y` and `wbs-bucket-bracket`, both
   in `docs/TECH_DEBT.md`'s Closed-numbers ledger (`#232` and `#71`), both still headed `Draft`. The gate cannot know that, and a gate
   that failed them would be a gate somebody deletes. **The trigger to revisit** is a reconciliation
   pass finding a shipped, uncited spec still headed `Draft`: that is a debt row, not a gate change,
   because every alternative predicate measured worse (D1).
2. **Whether an `Approved` spec's work actually shipped.** The gate refuses `Draft` and stops.
3. **Whether the prose after the token is true.** `Accepted — shipped (ADR-0131)` is checked for the
   ADR resolving to a file, never for it being the right ADR.

   **The stronger rule was written, run, and rejected on what it found.** Asking that every
   `ADR-NNNN` a header names must also _cite_ that spec directory reports **2 of 58** — and both are
   correct prose rather than defects: `corporate-brand` names ADR-0102 as the decision that overtook
   the flip it proposed, and `revision-compare` names ADR-0126/0127/0129 as the epics that continued
   the programme. Neither cites the directory, and neither should. So S4 stays at "the ADR resolves",
   and the stronger rule's real value was as a **one-off audit**: the other 56 attributions were
   each confirmed to come from an ADR that genuinely cites the spec, which is what makes the sweep's
   ADR numbers evidence rather than a grep's output.

4. **`docs/plans/`**, the historical tree, and per-milestone sub-specs
   (`engine-conformance-framework/M<n>-…`, seven files) — excluded by the root-only glob, because
   folding them in means deciding what a milestone's approval state is, which nothing in
   `docs/PROCESS.md` defines.

**One residual false positive is live and is worded rather than exempted.** ADR-0081 cites
`activity-copy-paste` as its **subject** — the epic whose milestone shipped unreachable — not as its
origin. That header now says so, so a reader is not sent to an ADR about milestone entry points
expecting a copy/paste decision. `scripts/spec-status.json`'s `exempt` register is **empty by
measurement** and its notes say so, naming M0-T3 as the evidence; it exists for the case where a
prior-art citation lands on a spec that genuinely has not been approved.

**Four sweep decisions needed judgement** and each is written into the header it changed rather than
only into a commit message: `corporate-brand` was a **sibling** epic whose D1 diagnosis and
`--destructive-hover` fix shipped through ADR-0097 while the default flip it proposed was overtaken
by that ADR's single-theme collapse; `workspace-layout` is ADR-0090 with its §42 superseded by
ADR-0093; `staff-performance-probe` is ADR-0128 extended by ADR-0130; `activity-copy-paste` is the
prior-art case above.

**A one-line replacement in a 62-file sweep does not show what the line used to continue**, and
eleven files had an orphaned continuation. Nine were the tail of the old sentence and were deleted;
two ran into text that is still true and kept it. Found by scanning for a following line that is
neither blank nor a list item — not by reading the diff, which showed each replacement looking
correct.

**Every assertion was verified red against a named mutation** (ADR-0110 D5), 23 mutations across 27
cases, each recorded in its case's own comment. Three cases exist only to stop a sibling passing for
the wrong reason: removing the citation must make a `Draft` spec **pass**, or S3 becomes a blanket
rule over the 17 legitimately-uncited drafts; a live exemption must **suppress** S3, or the override
is a lie; and "not yet approved" beside a `Draft` spec must be **clean**, or P1 becomes a rule about
the plan's words rather than about two documents disagreeing.

**C0's fixture took two attempts, and the first would have passed against its own mutation.** An
empty spec directory also empties the cited set, so C2 fired, the run was red for the wrong reason,
and the case proved nothing about `report()`'s population guard. The shipped fixture is built so
that C0 is the only thing that can fire. C4 then leaked the opposite way — writing it made twelve
unrelated fixtures fail, which is the honest cost of a control — so every fixture spec directory
gets a bare-link plan by default and exactly one case opts out.

**The CPM engine is not imported and no migration runs.** No product code changes at all: this is
one script, one shared-parser export, one JSON register, one CI step, 62 spec headers, **36**
plan files — 29 of them the contradictions P1 names, the rest annotations that agreed with their
spec and were reworded to the same words — and five documents.

**"30 plan annotations" is what the first version of this paragraph said**, and the diff says 36. It
is corrected here rather than quietly, because a count nobody re-derived is ADR-0076 Class 1 and
this ADR is about a document asserting something nobody checked.
