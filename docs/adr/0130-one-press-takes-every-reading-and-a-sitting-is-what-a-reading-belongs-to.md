# ADR-0130 — One press takes every reading, and a sitting is what a reading belongs to

- **Status:** Accepted
- **Date:** 2026-09-09
- **Supersedes:** nothing
- **Amends:** ADR-0128 **D4** (the INDETERMINATE vocabulary gains a second trigger and reaches
  ungated readings for the first time), **D5** (the row gains a **client-supplied** grouping fact,
  on a table whose grouping was deliberately server-minted), **D7** (a body field the server does
  not mint)
- **Builds on:** ADR-0086 (the staff identity that cannot reach a customer), ADR-0087 (retention),
  ADR-0081 (a milestone names its entry point), ADR-0058 (verify the claim), ADR-0076 (wrong claims
  are a defect class), ADR-0093 (a green suite that cannot tell "all classified" from "found none")
- **Spec:** [`docs/specs/probe-sweep/`](../specs/probe-sweep/)

## Context

ADR-0128 put the canvas benchmark on the staff console because the number is about the operator's
own machine and the API's container cannot take it. The product owner used it the next day and
produced the first 500-activity reading in the project's history. Their report on the second sitting
was two sentences: _"some say they don't get recorded and some say reported but not graded… why
split the tests should we just have a test button and it runs and records and grades all tests?
i'm not going to be doing them often so don't see the point of the splits"_.

**Both halves were true, and they were about two different mechanisms that produce
similar-sounding sentences.** Reading the code first — before designing anything — separated them
and found four more things nobody had reported.

**Two of the eight combinations the picker offered produced a verdict.** Three of twelve rows. Every
"REPORTED, NOT GRADED" was correct: a quick run has one repeat, so the INDETERMINATE rule cannot
fire, and Fit is ungated because the shipped painter already judders there and a gate that fails on
day one gets deleted rather than fixed (ADR-0058). But the picker offered eight equal-looking
choices and said nothing about which two answered a question.

**"They don't get recorded" was never about gating.** `to-probe-body.ts` returns `null` only when
the outcome is not `measured`; an ungraded measurement is stored exactly like a graded one. The
three paths that store nothing are a refusal, a cancellation and a failed POST — and each said so in
its own wording, so the operator met three sentences for three unrelated situations plus a fourth
for a verdict that had been withheld on purpose.

**A cancelled press threw away completed work, and nobody reported it** — a discarded measurement
leaves nothing behind to report. `runAbsoluteLimbs` broke out of the limb loop on **Stop** and
`toProbeBody` then discarded the whole press, so stopping during the second limb of the two-limb
`canvas-draw` scenario destroyed a **complete** 500-activity limb: three full repeats, nothing about
it wrong. The comment beside it was true of the interrupted limb and false of its finished
neighbour.

**Three acceptance criteria of the approved predecessor spec had never been met**
(`docs/specs/staff-performance-probe/feature-spec.md:206-208,252-253,262`): a history row was to name
the viewport and the display refresh, the history was to be grouped, and a narrow viewport was to be
stated as not comparable. The verdict half of that list was found missing at that epic's own gate
pass and fixed; the rest was not, and the milestone read as done. **That is the ADR-0081 shape one
level along** — not a capability with no entry point, but an approved criterion nobody re-read — and
it stopped being cosmetic on 2026-09-08, when `docs/TECH_DEBT.md` #261 recorded the same plan on the
same machine measuring **23.3 fps at 1912×1068 and 39.5 fps at 1016×636**: a fail and a pass against
one floor. The single most decision-relevant confound in the register was stored on every row and
rendered on none.

**And the deliverable expired.** `formatProbeReport` took a live `ProbeOutcome`, so the paste-ready
block — the artefact `docs/TECH_DEBT.md` #75 actually consumes — could be produced in the seconds
after a run and never again. #75's founding failure is a measurement being unreachable by the person
who needs it; the panel reproduced it a week later, one tier in.

## Decision

### D1 — The sweep is a loop above the runner, and nothing about the measurement changes

`runProbe`, `runDrawPhase`, `panRun`, `refuseRun`, `measureIdleInterval`, `judgeAbsolute`'s rules
and the scenes are untouched. A reading taken after this epic is comparable with one taken before
it, which is the single property `perf_probe_results` exists to preserve and which a redesign of the
runner would quietly destroy.

**A sweep endpoint on the API was refused outright**, and it is the thing ADR-0128 exists to refuse:
that container's own no-change baseline moved 0.56 → 1.85 pp and 0.93 → 10.00 pp between two runs an
hour apart, against a 2.00 pp bar.

**All four controls go through one orchestration.** A single run is a one-step sweep — not a
simplification for its own sake: two orchestrations would drift, and the drift would be invisible
because each looks right alone (the ADR-0065 `routeOrthogonal` argument).

The plan is **derived from the registry, never written out**. A hard-coded list goes stale the day a
scenario is added, and it goes stale silently: the new scenario is measurable one at a time and
simply absent from the sweep. Week leads because it is the framing that grades, so an interruption
costs the ungraded half.

### D2 — The completed limb is the unit of durability, and each step POSTs as it lands

A stop keeps every limb that collected all its repeats and discards only the interrupted one, by
name. Each step is recorded as it completes rather than at the end, so two minutes of measurement is
not lost because the operator closed the tab at 1:50. A refusal does not end the sweep: the machine
declined **that** step, and the next scene may well be fine.

This changes `refuseRun`'s premise deliberately. It is handed the **intended** frame count, which
was honest only because a partial press was discarded wholesale; under per-limb recording the
intended count is correct **by construction** for every limb that is recorded, because an incomplete
limb is not one of them.

**The refusal rules are not weakened anywhere.** A number from an unsuitable machine is worse than
no number. The remedy for a refusal is to take the reading again, which is D6.

### D3 — A sitting is a stored fact, and the id is client-supplied

`sweep_id` (UUID, nullable) groups the presses of one act. It is minted in the browser, which is a
new category on this table: `run_id` is server-minted precisely so the grouping of one press's limbs
cannot be forged. **Only the client knows that four presses were one sitting**, so the fact is
unobtainable server-side — and what it grants is grouping rows a staff member already owns, on a
table no customer can reach, in a console whose whole population is an allowlist.

**What a forged id can do is bounded and is stated rather than left to be discovered.** The security
review re-derived it from the code and found one variant the spec had not spelled out: an id equal to
a **real, previously-published** sitting lets a compromised staff session append fabricated readings
to a sitting a reader already trusts — borrowing an existing sitting's credibility rather than
manufacturing a fresh one. It is strictly weaker than the capability that session already has (it can
post arbitrary numbers under a fresh, indistinguishable id), and every row still carries its own
truthful server-set `run_id`, `recorded_at`, `api_version` and `recorded_by_label`, none of which is
derived from `sweep_id`. Recorded because "strictly weaker" is the argument, and an argument left
unstated is one nobody can check.

`frames_per_phase` lands beside it, so a row says which **protocol** produced it. Without it a quick
check and a full measurement are indistinguishable months later, and only one of them was ever
eligible for a verdict.

**Neither column takes a `DEFAULT`, and neither is backfilled.** `NULL` on `sweep_id` means _this
reading was a single press_; a default would claim membership of a sitting that does not exist.
`NULL` on `frames_per_phase` means _this row predates the column_, which is exactly what a reader
would otherwise assume the default away. The `hours_per_day_minutes DEFAULT 1440` precedent licenses
nothing here: 1440 was **true of every pre-existing row**, and neither of these values is knowable
for any.

### D4 — A sitting is derived from WHICH id space grouped it, never from the row count

`groupKeyOf` returns `sweep:<id>` or `run:<id>` — **namespaced, never `sweepId ?? runId`**. The two
are separate generators and nothing makes them disjoint, so a bare coalesce puts values from two
keyspaces into one map and asks it to tell them apart. The prefix makes a collision
unrepresentable rather than improbable.

The prefix also carries the fact the caller needs: **a sweep whose other three readings were refused
stores exactly one row**, so counting rows would call it a single press. Only `sweep_id` records the
operator's intent.

**This decision is why the epic's own worst defect was reachable, and it is worth stating plainly.**
`runSweep` called `newSweepId` unconditionally, so a single **Measure one thing** press stored an id,
grouped as a sweep, and the history told the operator: _"This sitting has 1 of 4 readings. 3 were
refused or never taken — nothing is stored for those."_ Every clause false, on the commonest press
there is, against a schema whose own approved words said the opposite. **No test could see it**: every
fixture in the model's suite sets `sweepId: null` for a single press, because that is what the
producer was supposed to send — a suite built from the contract is blind to a producer disobeying it.
It is now pinned at both tiers, and the panel-level case was verified red against the shipped code.

### D5 — One presentation model, two adapters, one formatter

`Sitting` is derived once, by `sittingFromOutcome` from a live run and by `sittingsFromRows` from
stored rows, and both the screen and the paste-ready block read it. That is what lets the block be
produced for a reading taken last week, which is the whole of §1(f); it is also what stops the screen
and the copied artefact disagreeing about the same run.

**A field a stored row cannot supply is `null`, never a guess and never an omission**, and `null`
prints as an explicit `(not recorded)`. A reader can then tell "this run did not record that" from
"this run recorded it and the renderer dropped it" — the distinction the whole epic is about, and the
one a defaulted `0` destroys.

Two facts are **disjunctions over the sitting rather than the first row's value**: whether any
reading lost the window, and the earliest time. A third, the canvas, is stated only when the readings
agree and says `varies between readings` when they do not — because stating one of two would settle
`docs/TECH_DEBT.md` #261's confound by accident, on the screen built to expose it.

The adapters are held to one shape by a structural test whose **blind spot is written into its own
docblock**: for a _required_ field the compiler is the gate (verified by running `tsc` against the
mutation, not by asserting it), and what the test covers is the optional-field move a developer makes
when the compiler stops them.

### D6 — Two remedies, because there are two failures

**Retry recording** re-sends a body that already exists. **Run the missing measurements** re-runs the
steps that produced nothing — `refused` and `not taken` — under the **same** sitting id, and folds
the result back in.

They stay apart on the discriminator of what a press would buy. A `not recorded` step has its figures
on screen and needs a POST, which takes a fraction of a second; re-measuring it would spend
twenty-five seconds obtaining **different** numbers under the impression of re-sending the ones in
front of the operator. Verified red against `status !== 'recorded'`, which is the obvious spelling and
sweeps in exactly that step.

`mergeResumed` **replaces steps and never the sitting.** Setting the resume as the panel's state
would show a one-step sitting and let an operator conclude the other three readings had been lost —
they are in the database; only the screen would have forgotten them.

**A resumed sitting can span time, so it says so.** Every reading carries its own `recordedAt`, and a
spread beyond an hour is stated on the block and in the report. An hour is a threshold chosen for what
it **excludes** — a full sweep is about two minutes and a stopped-and-resumed one perhaps ten — so it
is silent for every ordinary sitting and speaks only for the case D6 creates.

### D7 — `saturated` is a fact, and it must reach the ungated path

`docs/TECH_DEBT.md` #260 prescribed its own fix: "the guard the judge already has, one quantity
along… `INDETERMINATE` already exists and already outranks PASS/FAIL, so this is a branch and a
message". **Placed where the existing spread guard sits, it would not have caught the reading that
exposed it.** `judge.ts` returns `REPORTED_ONLY` for an ungated run **before** reaching the spread
check, and #260's own exhibit — the revision overlay at Fit — is ungated. The misleading figure is the
printed **delta**, not the withheld verdict.

So the guard produces a fact that reaches the ungated path too, and only the verdict branch is gated.
Established by reading `judge.ts`, not inferred from the row. **The row prescribed a remedy for its
own exhibit that would have left the exhibit unchanged**, which is why a register row is evidence of a
problem and not a design.

Every renderer of a verdict must read and pass `saturated`; a structural enumeration says so, and it
went red on the first new renderer this epic added.

### D8 — ADR-0128's three refusals hold, and Fit stays reported-never-graded

**No CI gate.** The measurement belongs on the machine that can take it, and a number from the API's
container carries a timestamp, a scenario and a verdict and means nothing — which is worse than none,
because somebody acts on it.

**No verdict column.** A stored verdict is a second copy of a rule; changing a bar would reinterpret
history, and the judge is applied on read against the thresholds stored beside the figures.

**Fit is reported and never graded.** Dropping it from the sweep was considered and refused: it is the
only cell currently short of its gate, so a sweep that omitted it would be a sweep that could not
report the one thing anybody is waiting for.

**INDETERMINATE stays a first-class fourth verdict.** An instrument whose baseline moves by more than
its own bar cannot answer, and a rule with only PASS and FAIL must report one of them.

## Consequences

**What this buys.** Re-deriving `docs/TECH_DEBT.md` #75 costs one confirmation and about two minutes
rather than eight decisions and eight confirmations. Nothing measured is silently lost. A reading is
as legible in a month as it was in the minute after it was taken, and its paste-ready block can be
produced at any time by the person who needs it.

**What it costs.** The command surface has four controls where it had one plus a picker, and each
takes the screen for between thirteen seconds and two minutes. `sweep_id` is the first
client-supplied grouping fact on this table, and the honest bound on it is the staff allowlist rather
than a mechanism. And a sitting is now a thing that can span time, which is a concept the screen has
to keep explaining.

**Neither `docs/TECH_DEBT.md` #75 nor #261 is closed by this epic.** It removes the friction that
stopped #75 being re-derived for a year; the readings themselves are still owed, and are the product
owner's to take.

**The CPM engine is not imported.** The ADR-0034 recalculation parity gate is untouched by
construction — in its honest form: there is nothing here to hold parity for.

## Corrections this ADR records

Five, each found by running or reading something rather than by anything failing.

1. **The quick sweep is 13.07 s, not ~30 s.** The spec said ~30 s in two places, including a mermaid
   node an operator's confirmation was supposed to mirror. It was an estimate written before
   `sweep-duration.ts` existed and never re-derived once the derivation did. Measured by calling
   `estimateSweepSeconds(sweepPlan(), 'quick')`. The **spec** was corrected and not the code, because
   the code computes the answer and the prose restated it — ADR-0076 Class 1.

2. **A `revision-diff` reading had never been storable.** Its `PacingResult` carries a `frames` field
   that `canvas-draw`'s does not, the body was assembled by spreading the recording, and
   `forbidNonWhitelisted` rejects the whole POST — so **every** revision-overlay reading since that
   scenario shipped was answered `422 … property frames should not exist`, and the panel reported it
   in the same words it uses for a dropped socket. Found by a journey **reading the response body**
   rather than counting failures. The body is now built field by field from a typed shape.

3. **A gate had silently stopped being able to report.** The staff journey's stop case counted every
   row in the history before and after and required the number to rise — and the read is capped at 50
   rows, so once an installation has taken fifty readings a new one displaces the oldest and the total
   is invariant. It passed for months on a fresh database and failed at 75 rows with the product
   behaving perfectly. It now asserts the **shape of the newest sitting**, which is sharper as well as
   immune to the cap.

4. **A screen inferred absence from that same page.** "2 were refused or never taken — nothing is
   stored for those" is sound reasoning from an absence **only if the absence is real**; at the page
   boundary those readings are stored and merely unreturned. The oldest block no longer says why a
   reading is missing, and the list says it is a page. The real fix — a total on the read — is an API
   contract change and is `docs/TECH_DEBT.md` **#271**, filed rather than smuggled in (ADR-0105).

5. **A release would have shipped with no image carrying its own DTO.** M4 added two accepted body
   fields and no changeset, so `release.yml`'s publish gate would have left `PUBLISH_API` false
   forever; combined with the client sending one of those fields unconditionally, **every** reading
   would have been refused by the deployed API. Established by reading `release.yml` and running its
   own test (`git rev-parse refs/tags/api-v0.61.0`), not by inference.
